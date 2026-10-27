// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {MakhzanGuard} from "../../src/makhzan/MakhzanGuard.sol";
import {StorageGate} from "../../src/makhzan/StorageGate.sol";

/// @notice T006 — `lock` takes one payment per real Makhzan deal, only while the deal is healthy.
contract StorageGateLockTest is MakhzanTestBase {
    uint96 internal constant AMOUNT = 1 ether;

    StorageGate internal gate;

    function setUp() public override {
        super.setUp();
        gate = new StorageGate(m);
    }

    function test_lockOnHealthyDealStoresPayerPayeeAndAmount() public {
        uint32 dealId = _createDeal();

        vm.prank(client);
        gate.lock{value: AMOUNT}(dealId, stranger);

        (address payer, uint96 amount, address payee, uint8 status) = gate.lockOf(dealId);
        assertEq(payer, client, "payer");
        assertEq(payee, stranger, "payee");
        assertEq(amount, AMOUNT, "amount");
        assertEq(status, 1, "locked");
        assertEq(address(gate).balance, AMOUNT, "gate holds the value");
    }

    function test_secondLockForTheSameDealReverts() public {
        uint32 dealId = _createDeal();
        vm.prank(client);
        gate.lock{value: AMOUNT}(dealId, stranger);

        vm.prank(client);
        vm.expectRevert(StorageGate.AlreadyLocked.selector);
        gate.lock{value: AMOUNT}(dealId, provider);
    }

    function test_lockWithoutValueReverts() public {
        uint32 dealId = _createDeal();
        vm.prank(client);
        vm.expectRevert(StorageGate.BadLock.selector);
        gate.lock{value: 0}(dealId, stranger);
    }

    function test_lockWithZeroPayeeReverts() public {
        uint32 dealId = _createDeal();
        vm.prank(client);
        vm.expectRevert(StorageGate.BadLock.selector);
        gate.lock{value: AMOUNT}(dealId, address(0));
    }

    function test_lockOnUnknownDealRevertsSettledOrNone() public {
        vm.prank(client);
        vm.expectRevert(MakhzanGuard.SettledOrNone.selector);
        gate.lock{value: AMOUNT}(999, stranger);
    }

    function test_lockOnSettledDealRevertsSettledOrNone() public {
        uint32 dealId = _createDeal();
        vm.roll(uint256(_dealEnd(dealId)) + 1);
        m.settle(dealId);

        vm.prank(client);
        vm.expectRevert(MakhzanGuard.SettledOrNone.selector);
        gate.lock{value: AMOUNT}(dealId, stranger);
    }

    function test_lockWithPendingChallengeRevertsPending() public {
        uint32 dealId = _createDeal();
        _openChallenge(dealId);

        vm.prank(client);
        vm.expectRevert(MakhzanGuard.Pending.selector);
        gate.lock{value: AMOUNT}(dealId, stranger);
    }

    function test_lockInDefaultRevertsDefault() public {
        uint32 dealId = _createDeal();
        uint32 start = uint32(block.number);
        _openChallenge(dealId);
        vm.roll(start + WINDOW + 1);

        vm.prank(client);
        vm.expectRevert(MakhzanGuard.Default.selector);
        gate.lock{value: AMOUNT}(dealId, stranger);
    }

    function test_lockAfterTheEndBlockRevertsExpired() public {
        uint32 dealId = _createDeal();
        vm.roll(uint256(_dealEnd(dealId)));

        vm.prank(client);
        vm.expectRevert(MakhzanGuard.Expired.selector);
        gate.lock{value: AMOUNT}(dealId, stranger);
    }
}
