// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title PayLib
/// @notice Accrual arithmetic for linear, block-based payments. Amounts are native units.
/// @dev Floor division everywhere; the cap at the end block keeps accrued <= price by construction.
library PayLib {
    /// @notice floor(price * (min(at, endBlock) - startBlock) / (endBlock - startBlock)), capped at price.
    function accrued(uint64 price, uint32 startBlock, uint32 endBlock, uint256 at) internal pure returns (uint64) {
        if (endBlock <= startBlock) return 0;
        uint256 capped = at < endBlock ? at : endBlock;
        if (capped <= startBlock) return 0;
        return uint64(uint256(price) * (capped - startBlock) / (endBlock - startBlock));
    }
}
