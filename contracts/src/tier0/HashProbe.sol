// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title HashProbe
/// @notice Disposable G02 probe for the two hash-cost ratios.
/// @dev One operation per external call so the transaction receipt isolates it.
///      Reference event shape: one indexed topic plus 32 bytes of data.
contract HashProbe {
    uint256 public slot;

    event Reference(bytes32 indexed topic, bytes32 data);

    function hashOnly(bytes32 input) external returns (bytes32) {
        return keccak256(abi.encodePacked(input));
    }

    function writeSlot(uint256 value) external {
        slot = value;
    }

    function emitReference(bytes32 topic, bytes32 data) external {
        emit Reference(topic, data);
    }
}
