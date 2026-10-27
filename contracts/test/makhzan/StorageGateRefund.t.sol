// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {MakhzanGuard} from "../../src/makhzan/MakhzanGuard.sol";
import {StorageGate} from "../../src/makhzan/StorageGate.sol";

/// @notice T008 — `refund` is payer-only and allowed only on default or after the term, unreleased.
contract StorageGateRefundTest is MakhzanTestBase {
    uint96 internal constant AMOUNT = 1 ether;

    StorageGate internal gate;

    function setUp() public override {
        super.setUp();
        gate = new StorageGate(m);
    }

    function _lock(uint32 dealId, address payee) internal {
        vm.prank(client);
        gate.lock{value: AMOUNT}(dealId, payee, 0);
    }

    function test_refundAfterDefaultPaysThePayer() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        uint32 start = uint32(block.number);
        _openChallenge(dealId);
        vm.roll(start + WINDOW + 1);
        assertEq(m.healthOf(dealId), 3, "precondition: default");

        uint256 before = client.balance;
        vm.prank(client);
        gate.refund(dealId);

        assertEq(client.balance, before + AMOUNT, "payer refunded inside the term");
        assertEq(address(gate).balance, 0, "gate emptied");
        (,,,, uint8 status) = gate.lockOf(dealId);
        assertEq(status, 3, "refunded");
    }

    function test_refundAfterTheEndBlockWithoutAReleasePaysThePayer() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.roll(uint256(_dealEnd(dealId)) + 1);

        uint256 before = client.balance;
        vm.prank(client);
        gate.refund(dealId);

        assertEq(client.balance, before + AMOUNT, "payer refunded after expiry");
        assertEq(address(gate).balance, 0, "gate emptied");
    }

    function test_refundAtTheEndBlockIsAllowed() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.roll(uint256(_dealEnd(dealId)));

        uint256 before = client.balance;
        vm.prank(client);
        gate.refund(dealId);
        assertEq(client.balance, before + AMOUNT, "release is already closed, so refund opens");
    }

    function test_refundAfterReleaseReverts() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.prank(stranger);
        gate.release(dealId);
        vm.roll(uint256(_dealEnd(dealId)) + 1);

        vm.prank(client);
        vm.expectRevert(StorageGate.NotLocked.selector);
        gate.refund(dealId);
    }

    function test_refundWhileHealthyInsideTheTermReverts() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);

        vm.prank(client);
        vm.expectRevert(StorageGate.RefundNotAllowed.selector);
        gate.refund(dealId);
        assertEq(address(gate).balance, AMOUNT, "value stayed in the gate");
    }

    function test_refundWithPendingChallengeReverts() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        _openChallenge(dealId);

        vm.prank(client);
        vm.expectRevert(StorageGate.RefundNotAllowed.selector);
        gate.refund(dealId);
    }

    function test_refundOnSettledDealStillReturnsThePayer() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.roll(uint256(_dealEnd(dealId)) + 1);
        m.settle(dealId);

        // Settled and past the end block: the expiry branch still allows the payer to recover.
        uint256 before = client.balance;
        vm.prank(client);
        gate.refund(dealId);
        assertEq(client.balance, before + AMOUNT, "settled is not a reason to strand the payer");
    }

    function test_onlyThePayerCanRefund() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.roll(uint256(_dealEnd(dealId)) + 1);

        vm.prank(stranger);
        vm.expectRevert(StorageGate.NotPayer.selector);
        gate.refund(dealId);

        vm.prank(provider);
        vm.expectRevert(StorageGate.NotPayer.selector);
        gate.refund(dealId);
    }

    function test_secondRefundReverts() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.roll(uint256(_dealEnd(dealId)) + 1);
        vm.prank(client);
        gate.refund(dealId);
        uint256 afterFirst = client.balance;

        vm.prank(client);
        vm.expectRevert(StorageGate.NotLocked.selector);
        gate.refund(dealId);
        assertEq(client.balance, afterFirst, "no second payment");
    }

    function test_refundEmitsTheAmount() public {
        uint32 dealId = _createDeal();
        _lock(dealId, stranger);
        vm.roll(uint256(_dealEnd(dealId)) + 1);

        vm.expectEmit(true, true, true, true, address(gate));
        emit StorageGate.Refunded(dealId, client, AMOUNT);
        vm.prank(client);
        gate.refund(dealId);
    }
}
