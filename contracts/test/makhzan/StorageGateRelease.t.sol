// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {MakhzanGuard} from "../../src/makhzan/MakhzanGuard.sol";
import {StorageGate} from "../../src/makhzan/StorageGate.sol";

/// @dev Reenters `release` from the payout. The state-before-send order must refuse the inner call.
contract ReentrantPayee {
    StorageGate internal immutable gate;
    uint32 internal dealId;
    bool internal attempted;
    bool internal innerReverted;

    constructor(StorageGate gate_) {
        gate = gate_;
    }

    function setDeal(uint32 id) external {
        dealId = id;
    }

    function attack() external {
        gate.release(dealId);
    }

    function innerWasRefused() external view returns (bool) {
        return innerReverted;
    }

    receive() external payable {
        if (!attempted) {
            attempted = true;
            try gate.release(dealId) {}
            catch {
                innerReverted = true;
            }
        }
    }
}

/// @notice T007 — `release` pays the recorded payee once, and only while the guard says healthy.
contract StorageGateReleaseTest is MakhzanTestBase {
    uint96 internal constant AMOUNT = 1 ether;

    StorageGate internal gate;

    function setUp() public override {
        super.setUp();
        gate = new StorageGate(m);
    }

    function _lock(uint32 dealId, address payee) internal {
        vm.prank(client);
        gate.lock{value: AMOUNT}(dealId, payee);
    }

    function test_releasePaysThePayeeExactlyOnce() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        uint256 before = stranger.balance;

        vm.prank(stranger);
        gate.release(dealId);

        assertEq(stranger.balance, before + AMOUNT, "payee paid exactly the lock");
        assertEq(address(gate).balance, 0, "gate emptied");
        (,,, uint8 status) = gate.lockOf(dealId);
        assertEq(status, 2, "released");
    }

    function test_releaseEmitsTheAmount() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);

        vm.expectEmit(true, true, true, true, address(gate));
        emit StorageGate.Released(dealId, stranger, AMOUNT);
        vm.prank(stranger);
        gate.release(dealId);
    }

    function test_secondReleaseReverts() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.prank(stranger);
        gate.release(dealId);
        uint256 afterFirst = stranger.balance;

        vm.prank(stranger);
        vm.expectRevert(StorageGate.NotLocked.selector);
        gate.release(dealId);
        assertEq(stranger.balance, afterFirst, "no second payment");
    }

    function test_onlyThePayeeCanRelease() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);

        vm.prank(client);
        vm.expectRevert(StorageGate.NotPayee.selector);
        gate.release(dealId);

        vm.prank(provider);
        vm.expectRevert(StorageGate.NotPayee.selector);
        gate.release(dealId);
    }

    function test_releaseWithoutALockReverts() public {
        uint32 dealId = _createDeal();
        vm.prank(stranger);
        vm.expectRevert(StorageGate.NotLocked.selector);
        gate.release(dealId);
    }

    function test_releaseWithPendingChallengeRevertsPending() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        _openChallenge(dealId);

        vm.prank(stranger);
        vm.expectRevert(MakhzanGuard.Pending.selector);
        gate.release(dealId);
        assertEq(address(gate).balance, AMOUNT, "value stayed in the gate");
    }

    function test_releaseInDefaultRevertsDefault() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        uint32 start = uint32(block.number);
        _openChallenge(dealId);
        vm.roll(start + WINDOW + 1);

        vm.prank(stranger);
        vm.expectRevert(MakhzanGuard.Default.selector);
        gate.release(dealId);
    }

    function test_releaseOnSettledDealRevertsSettledOrNone() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.roll(uint256(_dealEnd(dealId)) + 1);
        m.settle(dealId);

        vm.prank(stranger);
        vm.expectRevert(MakhzanGuard.SettledOrNone.selector);
        gate.release(dealId);
    }

    function test_releaseAtTheEndBlockRevertsExpired() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.roll(uint256(_dealEnd(dealId)));

        vm.prank(stranger);
        vm.expectRevert(MakhzanGuard.Expired.selector);
        gate.release(dealId);
    }

    function test_reentrantPayeeCannotReleaseTwice() public {
        uint32 dealId = _createDeal();
        ReentrantPayee attacker = new ReentrantPayee(gate);
        attacker.setDeal(dealId);
        _lock(dealId, address(attacker));

        attacker.attack();

        assertTrue(attacker.innerWasRefused(), "inner release refused");
        assertEq(address(attacker).balance, AMOUNT, "paid once");
        assertEq(address(gate).balance, 0, "gate emptied once");
    }
}
