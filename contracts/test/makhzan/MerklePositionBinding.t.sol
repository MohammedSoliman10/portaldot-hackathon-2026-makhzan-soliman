// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MerkleLib} from "../../src/makhzan/lib/MerkleLib.sol";

/// @notice Deterministic reproduction of a position-binding defect found by the T009a fuzz campaign.
/// @dev With `leafHash = keccak256(0x00 || data)` the leaf does not commit to its index. When two
///      adjacent blocks are byte-identical, `nodeHash(L, L)` makes their proofs interchangeable, so a
///      proof for index 0 also verifies at index 1. FR-041(8) and contracts/merkle.md claim this
///      never happens. This test is RED on purpose: it is the smallest honest reproduction, not a
///      flake. See CHECKPOINT-B3 for the two fixes and why the choice is the owner's.
contract MerklePositionBindingTest is Test {
    function _leafHash(bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x00), data));
    }

    function _nodeHash(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x01), left, right));
    }

    /// @dev Four 1024-byte blocks; blocks 0 and 1 are identical, as a file of repeated content would be.
    function test_identicalAdjacentBlocksShareAProof() public pure {
        bytes32[] memory level = new bytes32[](4);
        bytes memory zeroBlock = new bytes(1024);
        bytes memory other = new bytes(1024);
        other[0] = bytes1(uint8(0x01));

        level[0] = _leafHash(zeroBlock);
        level[1] = _leafHash(zeroBlock); // identical sibling
        level[2] = _leafHash(other);
        level[3] = _leafHash(other);

        bytes32[] memory next = new bytes32[](2);
        next[0] = _nodeHash(level[0], level[1]);
        next[1] = _nodeHash(level[2], level[3]);
        bytes32 root = _nodeHash(next[0], next[1]);

        bytes32[] memory path = new bytes32[](2);
        path[0] = level[1];
        path[1] = next[1];

        assertTrue(MerkleLib.verify(root, zeroBlock, 0, 4, path), "the proof must verify at its own index");
        assertFalse(MerkleLib.verify(root, zeroBlock, 1, 4, path), "FR-041(8): a proof for i must fail at j != i");
    }
}
