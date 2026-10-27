// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "../../src/makhzan/IMakhzan.sol";
import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {MakhzanGuard} from "../../src/makhzan/MakhzanGuard.sol";

/// @dev Internal library calls are inlined, so `vm.expectRevert` cannot sit in front of them.
///      This tiny external wrapper gives the test one call frame to attach the expectation to.
contract GuardProbe {
    function requireHealthy(IMakhzan makhzan, uint32 dealId) external view {
        MakhzanGuard.requireHealthy(makhzan, dealId);
    }
}

/// @notice T005 — the guard joins `healthOf == 1` with `block.number < endBlock`.
///         Every case runs against a real Makhzan; nothing here is mocked.
contract MakhzanGuardTest is MakhzanTestBase {
    GuardProbe internal probe;

    function setUp() public override {
        super.setUp();
        probe = new GuardProbe();
    }

    function test_healthyInsideTheTermIsTrue() public {
        uint32 dealId = _createDeal();
        assertTrue(MakhzanGuard.isHealthy(m, dealId), "fresh deal is healthy");
        probe.requireHealthy(m, dealId); // must not revert
    }

    function test_unknownDealIsNotHealthyAndNamesSettledOrNone() public {
        assertFalse(MakhzanGuard.isHealthy(m, 0), "deal 0");
        assertFalse(MakhzanGuard.isHealthy(m, 999), "unused id");

        vm.expectRevert(MakhzanGuard.SettledOrNone.selector);
        probe.requireHealthy(m, 999);
    }

    function test_settledDealIsNotHealthyAndNamesSettledOrNone() public {
        uint32 dealId = _createDeal();
        vm.roll(uint256(_dealEnd(dealId)) + 1);
        m.settle(dealId);
        assertEq(m.healthOf(dealId), 0, "precondition: settled");

        assertFalse(MakhzanGuard.isHealthy(m, dealId), "settled");
        vm.expectRevert(MakhzanGuard.SettledOrNone.selector);
        probe.requireHealthy(m, dealId);
    }

    function test_pendingChallengeIsNotHealthyAndNamesPending() public {
        uint32 dealId = _createDeal();
        uint32 start = uint32(block.number);
        _openChallenge(dealId);
        assertEq(m.healthOf(dealId), 2, "precondition: pending");

        assertFalse(MakhzanGuard.isHealthy(m, dealId), "pending");
        vm.expectRevert(MakhzanGuard.Pending.selector);
        probe.requireHealthy(m, dealId);

        vm.roll(start + WINDOW);
        assertEq(m.healthOf(dealId), 2, "deadline block is still pending");
        vm.expectRevert(MakhzanGuard.Pending.selector);
        probe.requireHealthy(m, dealId);
    }

    function test_defaultIsNotHealthyAndNamesDefault() public {
        uint32 dealId = _createDeal();
        uint32 start = uint32(block.number);
        _openChallenge(dealId);
        vm.roll(start + WINDOW + 1);
        assertEq(m.healthOf(dealId), 3, "precondition: default");

        assertFalse(MakhzanGuard.isHealthy(m, dealId), "default");
        vm.expectRevert(MakhzanGuard.Default.selector);
        probe.requireHealthy(m, dealId);
    }

    /// The case that matters: `healthOf` says 1, but the term is over.
    function test_expiredHealthyDealNamesExpired() public {
        uint32 dealId = _createDeal();
        uint32 end = _dealEnd(dealId);

        vm.roll(end - 1);
        assertEq(m.healthOf(dealId), 1, "precondition: healthOf ignores endBlock");
        assertTrue(MakhzanGuard.isHealthy(m, dealId), "one block before the end");

        vm.roll(end);
        assertEq(m.healthOf(dealId), 1, "healthOf is still 1 at the end block");
        assertFalse(MakhzanGuard.isHealthy(m, dealId), "the end block itself is closed");
        vm.expectRevert(MakhzanGuard.Expired.selector);
        probe.requireHealthy(m, dealId);

        vm.roll(uint256(end) + 1);
        assertEq(m.healthOf(dealId), 1, "still 1 after the end block");
        assertFalse(MakhzanGuard.isHealthy(m, dealId), "one block past the end");
        vm.expectRevert(MakhzanGuard.Expired.selector);
        probe.requireHealthy(m, dealId);
    }

    function test_answeredChallengeBecomesHealthyAgain() public {
        uint32 dealId = _createDeal();
        uint32 index = _openChallenge(dealId);
        _answerAt(dealId, index);

        assertEq(m.healthOf(dealId), 1, "precondition: answered");
        assertTrue(MakhzanGuard.isHealthy(m, dealId), "guard agrees");
        probe.requireHealthy(m, dealId);
    }

    /// `dealOf` is the source of the end block: assert the guard follows it, not a constant.
    function test_guardReadsTheEndBlockFromDealOf() public {
        uint32 dealId = _createDeal();
        (,, uint32 endBlock,,,,,,,,,) = m.dealOf(dealId);
        assertEq(endBlock, uint32(block.number) + DURATION, "dealOf third field");
        assertTrue(MakhzanGuard.isHealthy(m, dealId));
        vm.roll(endBlock);
        assertFalse(MakhzanGuard.isHealthy(m, dealId));
    }
}
