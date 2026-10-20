// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CounterProbe
/// @notice Disposable G01 probe: one storage slot, one event, one revert with a reason.
/// @dev Not a product contract.
contract CounterProbe {
    uint256 private value;

    event Set(uint256 indexed value);

    function set(uint256 next) external {
        value = next;
        emit Set(next);
    }

    function get() external view returns (uint256) {
        return value;
    }

    function boom() external pure {
        revert("CounterProbe: boom");
    }
}
