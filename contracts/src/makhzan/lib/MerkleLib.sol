// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MerkleLib
/// @notice Domain-separated Merkle tree with promotion, per contracts/merkle.md.
/// @dev Every function intentionally reverts in this commit; T009 implements them.
library MerkleLib {
    error NotImplemented();

    function leafHash(bytes memory data) internal pure returns (bytes32) {
        data;
        revert NotImplemented();
    }

    function nodeHash(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        left;
        right;
        revert NotImplemented();
    }

    function root(bytes32[] memory leafHashes) internal pure returns (bytes32) {
        leafHashes;
        revert NotImplemented();
    }

    function pathLength(uint32 index, uint32 leafCount) internal pure returns (uint32) {
        index;
        leafCount;
        revert NotImplemented();
    }

    function verify(bytes32 expectedRoot, bytes memory data, uint32 index, uint32 leafCount, bytes32[] memory path)
        internal
        pure
        returns (bool)
    {
        expectedRoot;
        data;
        index;
        leafCount;
        path;
        revert NotImplemented();
    }
}
