// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {StorageGate} from "../../src/makhzan/StorageGate.sol";

/// @notice T009 — the release and refund invariants over real Makhzan state and real block numbers.
/// @dev The fuzzer chooses how the deal evolves (no challenge, answered challenge, unanswered
///      challenge, settled) and how far the chain moves. It never chooses the expectation: that is
///      read from `healthOf` and `dealOf` at the call block, and the gate must agree.
contract StorageGateFuzzTest is MakhzanTestBase {
    uint96 internal constant AMOUNT = 1 ether;

    StorageGate internal gate;

    function setUp() public override {
        super.setUp();
        gate = new StorageGate(m);
        uint32 dealId = _createDeal();
        vm.prank(client);
        gate.lock{value: AMOUNT}(dealId, stranger, 0);
    }

    /// @dev Applies one fuzzed history to deal 1 and returns the end block.
    function _evolve(uint8 mode, uint32 delay, uint32 extra) internal returns (uint32 endBlock) {
        endBlock = _dealEnd(1);
        uint8 kind = mode % 4;
        if (kind == 1 || kind == 2) {
            uint32 openAt = uint32(block.number) + (delay % DURATION);
            vm.roll(openAt);
            uint32 index = _openChallenge(1);
            if (kind == 1) _answerAt(1, index);
        } else if (kind == 3) {
            vm.roll(endBlock); // settlement is legal from the end block on
            m.settle(1);
        }
        vm.roll(block.number + (extra % 700));
    }

    /// SC-003: release moves value only when healthOf == 1 and block.number < endBlock.
    function testFuzz_releaseOnlyWhileHealthy(uint8 mode, uint32 delay, uint32 extra) public {
        uint32 endBlock = _evolve(mode, delay, extra);

        uint8 health = m.healthOf(1);
        bool allowed = health == 1 && block.number < endBlock;
        uint256 before = stranger.balance;

        vm.prank(stranger);
        if (allowed) {
            gate.release(1);
            assertEq(stranger.balance, before + AMOUNT, "released exactly once");
            assertEq(address(gate).balance, 0, "gate emptied");
            (,,,, uint8 status) = gate.lockOf(1);
            assertEq(status, 2, "released flag");
        } else {
            vm.expectRevert();
            gate.release(1);
            assertEq(stranger.balance, before, "no value moved");
            assertEq(address(gate).balance, AMOUNT, "value stayed in the gate");
            (,,,, uint8 status) = gate.lockOf(1);
            assertEq(status, 1, "still locked");
        }
        assertEq(m.healthOf(1), health, "release never changes the deal");
    }

    /// Refund moves value only on healthOf == 3, or at/after the end block, and never after release.
    function testFuzz_refundOnlyOnDefaultOrAfterTheEnd(uint8 mode, uint32 delay, uint32 extra) public {
        uint32 endBlock = _evolve(mode, delay, extra);

        uint8 health = m.healthOf(1);
        bool allowed = health == 3 || block.number >= endBlock;
        uint256 before = client.balance;

        vm.prank(client);
        if (allowed) {
            gate.refund(1);
            assertEq(client.balance, before + AMOUNT, "refunded exactly once");
            assertEq(address(gate).balance, 0, "gate emptied");
            (,,,, uint8 status) = gate.lockOf(1);
            assertEq(status, 3, "refunded flag");
        } else {
            vm.expectRevert();
            gate.refund(1);
            assertEq(client.balance, before, "no value moved");
            assertEq(address(gate).balance, AMOUNT, "value stayed in the gate");
            (,,,, uint8 status) = gate.lockOf(1);
            assertEq(status, 1, "still locked");
        }
    }

    /// A closed lock never pays twice, whatever the chain does afterwards.
    function testFuzz_closedLockNeverPaysAgain(uint8 mode, uint32 delay, uint32 extra, bool takeRelease) public {
        uint32 endBlock = _evolve(mode, delay, extra);
        uint8 health = m.healthOf(1);

        if (takeRelease) {
            if (health != 1 || block.number >= endBlock) return; // nothing to close this run
            vm.prank(stranger);
            gate.release(1);
        } else {
            if (health != 3 && block.number < endBlock) return;
            vm.prank(client);
            gate.refund(1);
        }

        uint256 gateBefore = address(gate).balance;
        uint256 payeeBefore = stranger.balance;
        uint256 payerBefore = client.balance;

        vm.prank(stranger);
        vm.expectRevert(StorageGate.NotLocked.selector);
        gate.release(1);

        vm.prank(client);
        vm.expectRevert(StorageGate.NotLocked.selector);
        gate.refund(1);

        assertEq(address(gate).balance, gateBefore, "gate balance unchanged");
        assertEq(stranger.balance, payeeBefore, "payee unchanged");
        assertEq(client.balance, payerBefore, "payer unchanged");
    }
}
