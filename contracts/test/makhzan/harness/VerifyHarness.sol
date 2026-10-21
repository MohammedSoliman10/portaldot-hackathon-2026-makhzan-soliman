// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MerkleLib} from "../../../src/makhzan/lib/MerkleLib.sol";

/// @notice Test-only entry point for the length-enforcing verifier.
contract VerifyHarness {
    function verifyLeaf(
        bytes32 expectedRoot,
        bytes memory data,
        uint32 index,
        uint32 leafCount,
        uint256 expectedLen,
        bytes32[] memory path
    ) external pure returns (bool) {
        return MerkleLib.verifyLeaf(expectedRoot, data, index, leafCount, expectedLen, path);
    }

    function leafHash(bytes memory data) external pure returns (bytes32) {
        return MerkleLib.leafHash(data);
    }

    function nodeHash(bytes32 left, bytes32 right) external pure returns (bytes32) {
        return MerkleLib.nodeHash(left, right);
    }

    function root(bytes32[] memory leafHashes) external pure returns (bytes32) {
        return MerkleLib.root(leafHashes);
    }
}
