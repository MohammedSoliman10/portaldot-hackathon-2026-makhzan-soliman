// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title BehaviorProbe
/// @notice Disposable G02 probe: storage, indexed event, revert reason, payable value and block context.
/// @dev Not a product contract.
contract BehaviorProbe {
    uint256 public stored;
    uint256 public lastValue;
    uint256 public lastTimestamp;
    uint256 public lastNumber;

    event Stored(address indexed sender, uint256 indexed value, uint256 timestamp, uint256 number);

    function store(uint256 value) external payable {
        stored = value;
        lastValue = msg.value;
        lastTimestamp = block.timestamp;
        lastNumber = block.number;
        emit Stored(msg.sender, value, block.timestamp, block.number);
    }

    function read() external view returns (uint256, uint256, uint256, uint256) {
        return (stored, lastValue, lastTimestamp, lastNumber);
    }

    function fail(string calldata reason) external pure {
        revert(reason);
    }

    function boom() external pure {
        revert("BehaviorProbe: boom");
    }
}
