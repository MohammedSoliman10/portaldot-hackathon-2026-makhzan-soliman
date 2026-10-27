// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "./IMakhzan.sol";

/// @title MakhzanGuard
/// @notice The two facts a consumer needs before it pays: the deal has no open challenge, and the
///         deal is still inside its term. `healthOf` alone answers only the first one.
/// @dev Internal functions only: no linked deployment, no external call, no new trust anchor.
///      `healthOf` never reads the end block (see contracts/test/makhzan/HealthSemantics.t.sol), so
///      an expired-but-unsettled deal still reports 1. This library adds the term check.
library MakhzanGuard {
    /// @dev healthOf == 2: a challenge is open and still inside its response window.
    error Pending();
    /// @dev healthOf == 3: a challenge is open and past its deadline, unresolved.
    error Default();
    /// @dev healthOf == 0: the deal is settled, or the id never existed.
    error SettledOrNone();
    /// @dev healthOf == 1 but block.number >= endBlock: the term is over.
    error Expired();

    /// @notice True only while `healthOf(dealId) == 1` and `block.number < endBlock`.
    function isHealthy(IMakhzan makhzan, uint32 dealId) internal view returns (bool) {
        if (makhzan.healthOf(dealId) != 1) return false;
        return block.number < endBlockOf(makhzan, dealId);
    }

    /// @notice Reverts with the state that blocks a payment; returns silently when healthy.
    function requireHealthy(IMakhzan makhzan, uint32 dealId) internal view {
        uint8 health = makhzan.healthOf(dealId);
        if (health == 1) {
            if (block.number < endBlockOf(makhzan, dealId)) return;
            revert Expired();
        }
        if (health == 2) revert Pending();
        if (health == 3) revert Default();
        revert SettledOrNone();
    }

    /// @notice The deal's end block, read from the third field of `dealOf`. 0 means no such deal.
    function endBlockOf(IMakhzan makhzan, uint32 dealId) internal view returns (uint32 endBlock) {
        (,, endBlock,,,,,,,,,) = makhzan.dealOf(dealId);
    }
}
