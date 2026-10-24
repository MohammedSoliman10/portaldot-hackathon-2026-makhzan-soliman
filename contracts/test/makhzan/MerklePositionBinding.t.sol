// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MerkleLib} from "../../src/makhzan/lib/MerkleLib.sol";

/// @notice Documented limit of the commitment scheme, per FR-017 and DR-011 (decided B).
/// @dev With `leafHash = keccak256(0x00 || data)` the leaf does not commit to its index. When two
///      adjacent blocks are byte-identical, `nodeHash(L, L)` is symmetric and their proofs are
///      interchangeable. The owner decided this is correct by design: the answer still proves
///      possession of exactly those bytes, and one stored copy answers either challenge. This file
///      keeps the reproduction as an explicit limit test and proves distinct blocks never share a
///      proof, which is the property the fuzz campaign and invariant (8) assert.
contract MerklePositionBindingTest is Test {
    function _leafHash(bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x00), data));
    }

    function _nodeHash(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x01), left, right));
    }

    /// @dev Builds a four-leaf tree; `identicalPair` makes blocks 0 and 1 the same bytes.
    function _fourLeaves(bool identicalPair) internal pure returns (bytes32[] memory level, bytes memory block0) {
        level = new bytes32[](4);
        block0 = new bytes(1024);
        block0[0] = bytes1(uint8(0x11));
        for (uint256 b; b < 1024; b++) {
            block0[b] = bytes1(uint8(b));
        }

        bytes memory block1 = new bytes(1024);
        if (identicalPair) {
            block1 = block0;
        } else {
            for (uint256 b; b < 1024; b++) {
                block1[b] = bytes1(uint8(b + 1));
            }
        }
        bytes memory block2 = new bytes(1024);
        for (uint256 b; b < 1024; b++) {
            block2[b] = bytes1(uint8(b + 2));
        }
        bytes memory block3 = new bytes(1024);
        for (uint256 b; b < 1024; b++) {
            block3[b] = bytes1(uint8(b + 3));
        }

        level[0] = _leafHash(block0);
        level[1] = _leafHash(block1);
        level[2] = _leafHash(block2);
        level[3] = _leafHash(block3);
    }

    function _rootAndPath(bytes32[] memory level) internal pure returns (bytes32 root, bytes32[] memory path) {
        bytes32[] memory next = new bytes32[](2);
        next[0] = _nodeHash(level[0], level[1]);
        next[1] = _nodeHash(level[2], level[3]);
        root = _nodeHash(next[0], next[1]);

        path = new bytes32[](2);
        path[0] = level[1];
        path[1] = next[1];
    }

    /// @dev DOCUMENTED LIMIT: byte-identical adjacent blocks share a proof. One stored copy answers
    ///      both challenges, so the provider saves nothing and the bytes are still proven.
    function test_identicalAdjacentBlocksShareAProof() public pure {
        (bytes32[] memory level, bytes memory block0) = _fourLeaves(true);
        (bytes32 root, bytes32[] memory path) = _rootAndPath(level);

        assertTrue(MerkleLib.verify(root, block0, 0, 4, path), "the proof verifies at its own index");
        assertTrue(
            MerkleLib.verify(root, block0, 1, 4, path),
            "documented limit: identical blocks are interchangeable by design (FR-017, DR-011)"
        );
    }

    /// @dev The binding itself: with distinct blocks the same proof fails at every other position.
    function test_distinctBlocksNeverShareAProof() public pure {
        (bytes32[] memory level, bytes memory block0) = _fourLeaves(false);
        (bytes32 root, bytes32[] memory path) = _rootAndPath(level);

        assertTrue(MerkleLib.verify(root, block0, 0, 4, path), "the proof verifies at its own index");
        for (uint32 j = 1; j < 4; j++) {
            assertFalse(MerkleLib.verify(root, block0, j, 4, path), "distinct blocks must not share a proof");
        }
    }
}
