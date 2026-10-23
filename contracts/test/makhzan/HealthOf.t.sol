// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";

/// @notice R1 — `healthOf` availability view, every state and every window boundary.
contract HealthOfTest is MakhzanTestBase {
    function test_unknownDealIsZero() public view {
        assertEq(m.healthOf(0), 0, "deal 0 does not exist");
        assertEq(m.healthOf(999), 0, "any unknown deal");
    }

    function test_dealWithoutChallengeIsHealthy() public {
        uint32 dealId = _createDeal();
        assertEq(m.healthOf(dealId), 1, "open window, no challenge");
    }

    function test_openChallengeInsideWindowIsTwoIncludingTheDeadlineBlock() public {
        uint32 dealId = _createDeal();
        uint32 start = uint32(block.number);
        _openChallenge(dealId);

        assertEq(m.healthOf(dealId), 2, "challenge start block");
        vm.roll(start + WINDOW);
        assertEq(m.healthOf(dealId), 2, "exact deadline block is still pending");
        vm.roll(start + WINDOW + 1);
        assertEq(m.healthOf(dealId), 3, "the next block is in default");
    }

    function test_answeredChallengeIsHealthyAgain() public {
        uint32 dealId = _createDeal();
        uint32 index = _openChallenge(dealId);
        _answerAt(dealId, index);
        assertEq(m.healthOf(dealId), 1, "challenge closed, deal not settled");
    }

    function test_resolvedChallengeIsHealthy() public {
        uint32 dealId = _createDeal();
        uint32 start = uint32(block.number);
        _openChallenge(dealId);
        vm.roll(start + WINDOW + 1);
        assertEq(m.healthOf(dealId), 3, "in default before resolve");
        vm.prank(stranger);
        m.resolve(dealId);
        assertEq(m.healthOf(dealId), 1, "resolved, not settled");
    }

    function test_settledDealIsZero() public {
        uint32 dealId = _createDeal();
        uint32 end = _dealEnd(dealId);
        vm.roll(end + 1);
        vm.prank(client);
        m.settle(dealId);
        assertEq(m.healthOf(dealId), 0, "settled deal has no availability");
    }
}
