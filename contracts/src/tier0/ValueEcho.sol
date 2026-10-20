// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ValueEcho
/// @notice Disposable G07 probe. Reports the value and sender an EVM call actually sees.
/// @dev Not a product contract. Deleted or quarantined before the product tier.
contract ValueEcho {
    uint256 public lastValue;
    address public lastSender;
    uint256 public lastTimestamp;
    uint256 public lastNumber;

    event Echoed(address indexed sender, uint256 value, uint256 timestamp, uint256 number);

    function echo() external payable returns (uint256, address, uint256, uint256) {
        emit Echoed(msg.sender, msg.value, block.timestamp, block.number);
        return (msg.value, msg.sender, block.timestamp, block.number);
    }

    function record() external payable returns (uint256) {
        lastValue = msg.value;
        lastSender = msg.sender;
        lastTimestamp = block.timestamp;
        lastNumber = block.number;
        emit Echoed(msg.sender, msg.value, block.timestamp, block.number);
        return msg.value;
    }
}
