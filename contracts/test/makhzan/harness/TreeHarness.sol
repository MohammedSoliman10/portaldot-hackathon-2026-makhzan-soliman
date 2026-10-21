// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MerkleLib} from "../../../src/makhzan/lib/MerkleLib.sol";

/// @notice Test-only tree builder for an arbitrary file size and challenge block size.
contract TreeHarness {
    function leafCount(uint32 size, uint16 blockSize) public pure returns (uint32) {
        return uint32((uint256(size) + blockSize - 1) / blockSize);
    }

    function leafLength(uint32 size, uint16 blockSize, uint32 index) public pure returns (uint256) {
        uint32 count = leafCount(size, blockSize);
        require(index < count, "index out of range");
        if (index != count - 1) return blockSize;
        return uint256(size) - uint256(count - 1) * blockSize;
    }

    function leaf(uint32 size, uint16 blockSize, uint32 index) public pure returns (bytes memory b) {
        uint256 len = leafLength(size, blockSize, index);
        b = new bytes(len);
        uint256 x = uint256(keccak256(abi.encodePacked(size, blockSize, index)));
        for (uint256 j; j < len; j++) {
            unchecked {
                x = x * 6364136223846793005 + 1442695040888963407;
            }
            b[j] = bytes1(uint8(x >> 56));
        }
    }

    function hashes(uint32 size, uint16 blockSize) public pure returns (bytes32[] memory out) {
        uint32 count = leafCount(size, blockSize);
        out = new bytes32[](count);
        for (uint32 i; i < count; i++) {
            out[i] = MerkleLib.leafHash(leaf(size, blockSize, i));
        }
    }

    function root(uint32 size, uint16 blockSize) public pure returns (bytes32) {
        return MerkleLib.root(hashes(size, blockSize));
    }

    function pathLength(uint32 size, uint16 blockSize, uint32 index) public pure returns (uint32) {
        return MerkleLib.pathLength(index, leafCount(size, blockSize));
    }

    function path(uint32 size, uint16 blockSize, uint32 index) public pure returns (bytes32[] memory out) {
        uint32 count = leafCount(size, blockSize);
        bytes32[] memory level = hashes(size, blockSize);
        out = new bytes32[](MerkleLib.pathLength(index, count));
        uint32 idx = index;
        uint32 p;
        while (count > 1) {
            if (!(count % 2 == 1 && idx == count - 1)) out[p++] = level[idx ^ 1];
            idx /= 2;
            count = (count + 1) / 2;
            level = _next(level);
        }
    }

    /// @dev Convenience read for the US1 independent test.
    function verify(bytes32 expectedRoot, uint32 size, uint16 blockSize, uint32 index) public pure returns (bool) {
        return MerkleLib.verifyLeaf(
            expectedRoot,
            leaf(size, blockSize, index),
            index,
            leafCount(size, blockSize),
            leafLength(size, blockSize, index),
            path(size, blockSize, index)
        );
    }

    function _next(bytes32[] memory level) internal pure returns (bytes32[] memory next) {
        uint256 n = (level.length + 1) / 2;
        next = new bytes32[](n);
        for (uint256 i; i < n; i++) {
            uint256 left = i * 2;
            next[i] = left + 1 < level.length ? MerkleLib.nodeHash(level[left], level[left + 1]) : level[left];
        }
    }
}
