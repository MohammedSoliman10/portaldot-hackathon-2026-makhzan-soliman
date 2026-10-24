// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Makhzan} from "../../../src/makhzan/Makhzan.sol";

/// @notice Test-only view into state a real slash or pause would produce. Never deployed.
contract MakhzanHarness is Makhzan {
    constructor(
        uint32 challengeWindow_,
        uint16 challengeBlockSize_,
        uint16 slashBps_,
        uint64 minBond_,
        uint32 minDurationBlocks_,
        uint32 maxDurationBlocks_
    ) Makhzan(challengeWindow_, challengeBlockSize_, slashBps_, minBond_, minDurationBlocks_, maxDurationBlocks_) {}

    /// @dev Seeds the bond a failed challenge would leave behind, without moving value.
    function setBond(uint16 providerId, uint64 units) external {
        providers[providerId - 1].bond = units;
    }

    function setActiveDeals(uint16 providerId, uint24 count) external {
        providers[providerId - 1].activeDeals = count;
    }
}
