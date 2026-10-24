// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IMakhzan} from "../../src/makhzan/IMakhzan.sol";
import {Makhzan} from "../../src/makhzan/Makhzan.sol";

/// @notice T018 — provider registry and bond accounting (FR-001–FR-004, FR-046).
contract RegistryTest is Test {
    uint256 internal constant WPU = 10_000; // WEI_PER_UNIT
    uint64 internal constant MIN_BOND = 1e15; // 10 tPOT in planck
    uint64 internal constant TOP_UP = 5e14; // 5 tPOT

    Makhzan internal m;
    address internal provider = address(0xA11CE);
    address internal other = address(0xB0B);

    function setUp() public {
        m = new Makhzan(50, 1024, 2000, MIN_BOND, 600, 14_400);
        vm.deal(provider, 1_000 ether);
        vm.deal(other, 1_000 ether);
    }

    function _wei(uint64 units) internal pure returns (uint256) {
        return uint256(units) * WPU;
    }

    function test_registerBelowMinimumRevertsBondTooSmall() public {
        vm.startPrank(provider);
        vm.expectRevert(IMakhzan.BondTooSmall.selector);
        m.registerProvider{value: _wei(MIN_BOND - 1)}();
        vm.stopPrank();
    }

    function test_registerStoresBondAndStableId() public {
        vm.startPrank(provider);
        m.registerProvider{value: _wei(MIN_BOND)}();
        vm.stopPrank();

        (uint16 id, uint64 bond, uint24 activeDeals, bool registered) = m.providerOf(provider);
        assertEq(id, 1, "first provider id");
        assertEq(bond, MIN_BOND, "bond stored in units");
        assertEq(activeDeals, 0, "no active deals");
        assertTrue(registered, "registered flag");

        vm.startPrank(other);
        m.registerProvider{value: _wei(MIN_BOND)}();
        vm.stopPrank();
        (uint16 otherId,,,) = m.providerOf(other);
        assertEq(otherId, 2, "second provider id");
        (uint16 stableId,,,) = m.providerOf(provider);
        assertEq(stableId, 1, "first id is stable");
    }

    function test_secondRegistrationRevertsAlreadyRegistered() public {
        vm.startPrank(provider);
        m.registerProvider{value: _wei(MIN_BOND)}();
        vm.expectRevert(IMakhzan.AlreadyRegistered.selector);
        m.registerProvider{value: _wei(MIN_BOND)}();
        vm.stopPrank();
    }

    function test_addBondByStrangerRevertsNotRegistered() public {
        vm.startPrank(other);
        vm.expectRevert(IMakhzan.NotRegistered.selector);
        m.addBond{value: _wei(MIN_BOND)}();
        vm.stopPrank();
    }

    function test_topUpUpdatesBondReadBack() public {
        vm.startPrank(provider);
        m.registerProvider{value: _wei(MIN_BOND)}();

        vm.expectEmit(true, false, false, true, address(m));
        emit IMakhzan.BondAdded(provider, MIN_BOND + TOP_UP);
        m.addBond{value: _wei(TOP_UP)}();
        vm.stopPrank();

        (uint16 id, uint64 bond,,) = m.providerOf(provider);
        assertEq(id, 1, "id unchanged");
        assertEq(bond, MIN_BOND + TOP_UP, "bond topped up in units");
    }

    function test_nonMultipleValueRevertsBadParams() public {
        vm.startPrank(provider);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.registerProvider{value: _wei(MIN_BOND) + 1}();

        m.registerProvider{value: _wei(MIN_BOND)}();
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.addBond{value: 1}();
        vm.stopPrank();
    }

    function test_unitsAboveUint64CapRevertBadParams() public {
        uint256 overCap = (uint256(type(uint64).max) + 1) * WPU;
        vm.deal(provider, overCap * 2);
        vm.startPrank(provider);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.registerProvider{value: overCap}();

        m.registerProvider{value: _wei(MIN_BOND)}();
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.addBond{value: _wei(type(uint64).max)}();
        vm.stopPrank();
    }

    function test_withdrawBondClearsRegistrationAndPaysFullBond() public {
        vm.startPrank(provider);
        m.registerProvider{value: _wei(MIN_BOND)}();
        uint256 before = provider.balance;

        vm.expectEmit(true, false, false, true, address(m));
        emit IMakhzan.BondWithdrawn(provider, MIN_BOND);
        m.withdrawBond();
        vm.stopPrank();

        assertEq(provider.balance, before + _wei(MIN_BOND), "bond paid in wei");
        (uint16 id, uint64 bond, uint24 activeDeals, bool registered) = m.providerOf(provider);
        assertEq(id, 0, "registration cleared");
        assertEq(bond, 0, "bond cleared");
        assertEq(activeDeals, 0, "deal count cleared");
        assertFalse(registered, "no longer registered");
    }

    function test_registerEventCarriesDocumentedFields() public {
        vm.startPrank(provider);
        vm.expectEmit(true, true, false, true, address(m));
        emit IMakhzan.ProviderRegistered(provider, 1, MIN_BOND);
        m.registerProvider{value: _wei(MIN_BOND)}();
        vm.stopPrank();
    }
}
