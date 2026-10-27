// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {MakhzanGuard} from "../../src/makhzan/MakhzanGuard.sol";

/// @notice Phase 1 — what a consumer can still see after a slash has landed.
/// @dev Runs the real Makhzan: challenge, deadline, resolve, then read the two public views.
contract AfterSlashTest is MakhzanTestBase {
    function test_slashIsInvisibleToHealthAndToTheGuard() public {
        uint32 dealId = _createDeal();
        (uint16 id, uint64 bondBefore,, bool registered) = m.providerOf(provider);
        assertEq(id, 1, "provider id");
        assertTrue(registered, "provider registered");

        _openChallenge(dealId);
        uint32 start = uint32(block.number);
        assertEq(m.healthOf(dealId), 2, "inside the window");
        assertFalse(MakhzanGuard.isHealthy(m, dealId), "guard refuses while pending");

        vm.roll(start + WINDOW + 1);
        assertEq(m.healthOf(dealId), 3, "past the deadline, before resolve");
        assertFalse(MakhzanGuard.isHealthy(m, dealId), "guard refuses in default");

        m.resolve(dealId);

        (, uint64 bondAfter,,) = m.providerOf(provider);
        assertEq(bondAfter, bondBefore - bondBefore / 5, "20% of the bond slashed");

        assertEq(m.healthOf(dealId), 1, "resolve clears the open challenge");
        assertTrue(MakhzanGuard.isHealthy(m, dealId), "the guard sees a healthy deal again");

        vm.roll(block.number + 10);
        assertEq(m.healthOf(dealId), 1, "still 1 ten blocks later");
        assertTrue(MakhzanGuard.isHealthy(m, dealId), "still healthy ten blocks later");
        (, uint64 bondLater,,) = m.providerOf(provider);
        assertEq(bondLater, bondAfter, "the bond keeps the slash");
    }

    /// The deal is still running after a slash: the provider can answer the next challenge and the
    /// deal can end normally. Nothing in `healthOf` records that a slash ever happened.
    function test_dealContinuesAfterASlashAndHealthReturnsToTwoOnTheNextChallenge() public {
        uint32 dealId = _createDeal();
        uint32 start = uint32(block.number);
        _openChallenge(dealId);
        vm.roll(start + WINDOW + 1);
        m.resolve(dealId);
        assertEq(m.healthOf(dealId), 1, "after the slash");

        _openChallenge(dealId);
        assertEq(m.healthOf(dealId), 2, "a new challenge is pending");
    }
}
