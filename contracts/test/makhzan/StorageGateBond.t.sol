// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {MakhzanGuard} from "../../src/makhzan/MakhzanGuard.sol";
import {StorageGate} from "../../src/makhzan/StorageGate.sol";

/// @notice T012 — the gate's optional bond floor. A slash is invisible to `healthOf`; the bond is
///         how a consumer notices it. Every case runs against the real Makhzan.
contract StorageGateBondTest is MakhzanTestBase {
    uint96 internal constant AMOUNT = 1 ether;
    uint64 internal constant FLOOR = 9e14; // 90% of the 1e15 bond: above the post-slash 8e14

    StorageGate internal gate;

    function setUp() public override {
        super.setUp();
        gate = new StorageGate(m);
    }

    function _lock(uint32 dealId, address payee, uint64 minBond) internal {
        vm.prank(client);
        gate.lock{value: AMOUNT}(dealId, payee, minBond);
    }

    /// Drive the deal to a resolved slash and return the end block.
    function _slash(uint32 dealId) internal returns (uint32 endBlock) {
        endBlock = _dealEnd(dealId);
        _openChallenge(dealId);
        vm.roll(uint32(block.number) + WINDOW + 1);
        m.resolve(dealId);
        assertEq(m.healthOf(dealId), 1, "healthy again after the slash");
    }

    function test_lockStoresTheBondFloor() public {
        uint32 dealId = _createDeal();
        _lock(dealId, provider, FLOOR);

        (address payer, uint96 amount, address payee, uint64 minBond, uint8 status) = gate.lockOf(dealId);
        assertEq(payer, client, "payer");
        assertEq(amount, AMOUNT, "amount");
        assertEq(payee, provider, "payee");
        assertEq(minBond, FLOOR, "minBond");
        assertEq(status, 1, "locked");
    }

    function test_releaseAtExactlyTheFloorPasses() public {
        uint32 dealId = _createDeal();
        _lock(dealId, provider, uint64(MIN_BOND)); // bond == floor

        vm.prank(provider);
        gate.release(dealId);
        assertEq(address(gate).balance, 0, "paid");
    }

    function test_releaseBelowTheFloorAfterASlashRevertsBondTooLow() public {
        uint32 dealId = _createDeal();
        _lock(dealId, provider, FLOOR);
        _slash(dealId);

        (uint16 id, uint64 bond,,) = m.providerOf(provider);
        assertEq(id, 1, "still the provider");
        assertEq(bond, 8e14, "20% slashed");

        vm.prank(provider);
        vm.expectRevert(StorageGate.BondTooLow.selector);
        gate.release(dealId);
        assertEq(address(gate).balance, AMOUNT, "value stayed in the gate");
        (,,,, uint8 status) = gate.lockOf(dealId);
        assertEq(status, 1, "still locked");
    }

    /// The floor is read at release time, not at lock time: topping the bond up re-opens it.
    function test_releasePassesAgainAfterTheBondIsToppedUp() public {
        uint32 dealId = _createDeal();
        _lock(dealId, provider, FLOOR);
        _slash(dealId);

        vm.prank(provider);
        vm.expectRevert(StorageGate.BondTooLow.selector);
        gate.release(dealId);

        uint64 topUp = 2e14; // 8e14 + 2e14 = 1e15 >= 9e14
        vm.prank(provider);
        m.addBond{value: _wei(topUp)}();

        vm.prank(provider);
        gate.release(dealId);
        assertEq(address(gate).balance, 0, "paid after the top-up");
    }

    function test_zeroFloorIgnoresTheSlash() public {
        uint32 dealId = _createDeal();
        _lock(dealId, provider, 0);
        _slash(dealId);

        vm.prank(provider);
        gate.release(dealId);
        assertEq(address(gate).balance, 0, "minBond 0 behaves as before");
    }

    /// A payee that is not the deal's provider has no bond to prove, so any floor refuses.
    function test_nonProviderPayeeCannotMeetAFloor() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger, 1); // 1 planck, but stranger has no provider record

        vm.prank(stranger);
        vm.expectRevert(StorageGate.BondTooLow.selector);
        gate.release(dealId);
    }

    /// Refund is untouched by the floor: default pays the payer.
    function test_refundInDefaultIsUnchangedByTheFloor() public {
        uint32 dealId = _createDeal();
        _lock(dealId, provider, FLOOR);

        _openChallenge(dealId);
        vm.roll(uint32(block.number) + WINDOW + 1);
        assertEq(m.healthOf(dealId), 3, "default");
        vm.prank(client);
        gate.refund(dealId);
        assertEq(address(gate).balance, 0, "refunded in default");
    }

    /// After resolve the deal is healthy again, so an in-term refund is still refused.
    function test_refundAfterResolveStillRefusesInsideTheTerm() public {
        uint32 dealId = _createDeal();
        _lock(dealId, provider, FLOOR);
        _slash(dealId);

        vm.prank(client);
        vm.expectRevert(StorageGate.RefundNotAllowed.selector);
        gate.refund(dealId);
    }

    /// The floor does not bypass the health check: a pending challenge refuses even with a high bond.
    function test_floorDoesNotOverrideHealth() public {
        uint32 dealId = _createDeal();
        _lock(dealId, provider, 1);
        _openChallenge(dealId);

        vm.prank(provider);
        vm.expectRevert(MakhzanGuard.Pending.selector);
        gate.release(dealId);
    }
}
