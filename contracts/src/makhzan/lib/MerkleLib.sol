// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MerkleLib
/// @notice Domain-separated Merkle tree with promotion, per contracts/merkle.md.
/// @dev Internal library: inlined into Makhzan, no separate deployment.
library MerkleLib {
    error NotImplemented();

    /// @notice keccak256(0x00 || data)
    function leafHash(bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x00), data));
    }

    /// @notice keccak256(0x01 || left || right)
    function nodeHash(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x01), left, right));
    }

    /// @notice Root of the promoted-pairing tree. A single leaf is its own root.
    function root(bytes32[] memory leafHashes) internal pure returns (bytes32) {
        if (leafHashes.length == 0) return bytes32(0);
        bytes32[] memory level = leafHashes;
        while (level.length > 1) {
            uint256 nextLength = (level.length + 1) / 2;
            bytes32[] memory next = new bytes32[](nextLength);
            for (uint256 i = 0; i < nextLength; i++) {
                uint256 left = i * 2;
                next[i] = left + 1 < level.length ? nodeHash(level[left], level[left + 1]) : level[left];
            }
            level = next;
        }
        return level[0];
    }

    /// @notice Number of siblings a valid proof carries for (index, leafCount).
    function pathLength(uint32 index, uint32 leafCount) internal pure returns (uint32 len) {
        if (leafCount == 0 || index >= leafCount) return 0;
        uint32 idx = index;
        uint32 count = leafCount;
        while (count > 1) {
            if (!(count % 2 == 1 && idx == count - 1)) len++;
            idx /= 2;
            count = (count + 1) / 2;
        }
    }

    /// @notice Verify data at index after enforcing its expected byte length (T015).
    function verifyLeaf(
        bytes32 expectedRoot,
        bytes memory data,
        uint32 index,
        uint32 leafCount,
        uint256 expectedLen,
        bytes32[] memory path
    ) internal pure returns (bool) {
        expectedRoot;
        data;
        index;
        leafCount;
        expectedLen;
        path;
        revert NotImplemented();
    }

    /// @notice Verify data at index against expectedRoot; directions come from index/count only.
    function verify(bytes32 expectedRoot, bytes memory data, uint32 index, uint32 leafCount, bytes32[] memory path)
        internal
        pure
        returns (bool)
    {
        if (leafCount == 0 || index >= leafCount) return false;
        bytes32 h = leafHash(data);
        uint32 idx = index;
        uint32 count = leafCount;
        uint256 p = 0;
        while (count > 1) {
            if (count % 2 == 1 && idx == count - 1) {
                // promoted: no sibling consumed
            } else {
                if (p >= path.length) return false;
                bytes32 sibling = path[p++];
                h = idx % 2 == 1 ? nodeHash(sibling, h) : nodeHash(h, sibling);
            }
            idx /= 2;
            count = (count + 1) / 2;
        }
        return p == path.length && h == expectedRoot;
    }
}
