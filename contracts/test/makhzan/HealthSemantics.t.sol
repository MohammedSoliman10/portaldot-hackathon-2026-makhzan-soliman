// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";

/// @notice LIVE-3b — `healthOf` semantics for the five cases in the review request.
/// @dev Expected codes are read from Makhzan.sol:
///      0 = no such deal OR settled; 1 = healthy; 2 = challenge open inside the window;
///      3 = challenge open past the deadline. The end block is not consulted by healthOf.
contract HealthSemanticsTest is MakhzanTestBase {
    /// (e) deal id that does not exist -> 0.
    function test_e_unknownDealIsZero() public view {
        assertEq(m.healthOf(0), 0, "(e) deal 0 never existed");
        assertEq(m.healthOf(12_345), 0, "(e) arbitrary unused id");
    }

    /// (b) deal that was never challenged -> 1, for as long as it is unsettled.
    function test_b_neverChallengedIsOne() public {
        uint32 dealId = _createDeal();
        assertEq(m.healthOf(dealId), 1, "(b) fresh deal, no challenge");

        vm.roll(block.number + DURATION / 2);
        assertEq(m.healthOf(dealId), 1, "(b) mid-duration, still no challenge");
    }

    /// (a) end block has passed, deal not settled, never challenged -> 1.
    /// healthOf does not consult endBlock; an expired-but-unsettled deal is still "healthy".
    function test_a_endPassedUnsettledIsOne() public {
        uint32 dealId = _createDeal();
        uint32 end = _dealEnd(dealId);

        vm.roll(end);
        assertEq(m.healthOf(dealId), 1, "(a) at the end block, still unsettled");

        vm.roll(uint256(end) + 1);
        assertEq(m.healthOf(dealId), 1, "(a) one block past the end, still unsettled");
    }

    /// (d) open challenge past its deadline, not resolved -> 3.
    /// Boundary: at start + challengeWindow the challenge is still pending (2); the next block is 3.
    function test_d_openChallengePastDeadlineIsThree() public {
        uint32 dealId = _createDeal();
        uint32 start = uint32(block.number);
        _openChallenge(dealId);

        assertEq(m.healthOf(dealId), 2, "(d) challenge just opened");

        vm.roll(start + WINDOW);
        assertEq(m.healthOf(dealId), 2, "(d) exact deadline block is still pending");

        vm.roll(start + WINDOW + 1);
        assertEq(m.healthOf(dealId), 3, "(d) first block past the deadline, unresolved");
    }

    /// (c) settled deal -> 0, regardless of how it was settled (no prior challenge here).
    function test_c_settledIsZero() public {
        uint32 dealId = _createDeal();
        vm.roll(uint256(_dealEnd(dealId)) + 1);

        m.settle(dealId);
        assertEq(m.healthOf(dealId), 0, "(c) settled deal");
    }
}
