// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MerkleLib} from "../../src/makhzan/lib/MerkleLib.sol";

/// @title MerkleFuzzTest
/// @notice Property tests for FR-040 / SC-003. Every tree in this file is built by the local
///         helpers below; no property depends on MerkleLib.root or MerkleLib.pathLength.
contract MerkleFuzzTest is Test {
    // ---------------------------------------------------------------- local tree builder

    function _copy(bytes memory src) internal pure returns (bytes memory dst) {
        dst = new bytes(src.length);
        for (uint256 i; i < src.length; i++) {
            dst[i] = src[i];
        }
    }

    function _leafHash(bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x00), data));
    }

    function _nodeHash(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x01), left, right));
    }

    function _leafData(uint32 index, uint256 seed, uint256 len) internal pure returns (bytes memory b) {
        b = new bytes(len);
        uint256 x = uint256(keccak256(abi.encodePacked(seed, index, len)));
        for (uint256 j; j < len; j++) {
            unchecked {
                x = x * 6364136223846793005 + 1442695040888963407;
            }
            b[j] = bytes1(uint8(x >> 56));
        }
    }

    function _leafHashes(bytes[] memory leaves) internal pure returns (bytes32[] memory hashes) {
        hashes = new bytes32[](leaves.length);
        for (uint256 i; i < leaves.length; i++) {
            hashes[i] = _leafHash(leaves[i]);
        }
    }

    function _nextLevel(bytes32[] memory level) internal pure returns (bytes32[] memory next) {
        uint256 n = (level.length + 1) / 2;
        next = new bytes32[](n);
        for (uint256 i; i < n; i++) {
            uint256 left = i * 2;
            next[i] = left + 1 < level.length ? _nodeHash(level[left], level[left + 1]) : level[left];
        }
    }

    function _rootOf(bytes32[] memory hashes) internal pure returns (bytes32) {
        bytes32[] memory level = hashes;
        while (level.length > 1) {
            level = _nextLevel(level);
        }
        return level[0];
    }

    function _pathLen(uint32 index, uint32 leafCount) internal pure returns (uint32 len) {
        uint32 idx = index;
        uint32 count = leafCount;
        while (count > 1) {
            if (!(count % 2 == 1 && idx == count - 1)) len++;
            idx /= 2;
            count = (count + 1) / 2;
        }
    }

    function _pathOf(bytes32[] memory hashes, uint32 index) internal pure returns (bytes32[] memory path) {
        uint32 leafCount = uint32(hashes.length);
        path = new bytes32[](_pathLen(index, leafCount));
        bytes32[] memory level = hashes;
        uint32 idx = index;
        uint32 count = leafCount;
        uint32 p;
        while (count > 1) {
            if (!(count % 2 == 1 && idx == count - 1)) path[p++] = level[idx ^ 1];
            idx /= 2;
            count = (count + 1) / 2;
            level = _nextLevel(level);
        }
    }

    struct Tree {
        bytes[] leaves;
        bytes32 root;
        bytes32[] path;
        uint32 index;
    }

    function _tree(uint32 leafCount, uint32 index, uint256 seed, uint256 dataLen)
        internal
        pure
        returns (Tree memory t)
    {
        t.index = index;
        t.leaves = new bytes[](leafCount);
        for (uint32 i; i < leafCount; i++) {
            uint256 len = 1 + (uint256(keccak256(abi.encodePacked(seed, "len", i))) % dataLen);
            t.leaves[i] = _leafData(i, seed, len);
        }
        bytes32[] memory hashes = _leafHashes(t.leaves);
        t.root = _rootOf(hashes);
        t.path = _pathOf(hashes, index);
    }

    // ---------------------------------------------------------------- (a) correct proof

    /// @dev A correct (data, index, path) verifies.
    function testFuzz_correctProofVerifies(uint8 countSeed, uint32 indexSeed, uint8 lenSeed) public {
        uint32 leafCount = 1 + uint32(countSeed) % 64;
        uint32 index = indexSeed % leafCount;
        uint256 dataLen = 1 + uint256(lenSeed) % 40;
        Tree memory t = _tree(leafCount, index, uint256(keccak256(abi.encode(countSeed, indexSeed, lenSeed))), dataLen);
        assertTrue(MerkleLib.verify(t.root, t.leaves[index], index, leafCount, t.path), "valid proof rejected");
    }

    // ---------------------------------------------------------------- (b) position binding

    /// @dev The same proof at any other index j != i is rejected.
    function testFuzz_proofRejectedAtEveryOtherIndex(uint8 countSeed, uint32 indexSeed, uint8 lenSeed) public {
        uint32 leafCount = 1 + uint32(countSeed) % 64;
        uint32 index = indexSeed % leafCount;
        uint256 dataLen = 1 + uint256(lenSeed) % 40;
        Tree memory t = _tree(leafCount, index, uint256(keccak256(abi.encode(countSeed, indexSeed, lenSeed))), dataLen);
        bytes memory data = t.leaves[index];
        for (uint32 j; j < leafCount; j++) {
            if (j == index) continue;
            assertFalse(MerkleLib.verify(t.root, data, j, leafCount, t.path), "proof replayed at another index");
        }
    }

    // ---------------------------------------------------------------- (c) wrong bytes

    /// @dev Flipping any one byte of the data is rejected.
    function testFuzz_flippedByteIsRejected(uint8 countSeed, uint32 indexSeed, uint8 lenSeed) public {
        uint32 leafCount = 1 + uint32(countSeed) % 64;
        uint32 index = indexSeed % leafCount;
        uint256 dataLen = 1 + uint256(lenSeed) % 40;
        Tree memory t = _tree(leafCount, index, uint256(keccak256(abi.encode(countSeed, indexSeed, lenSeed))), dataLen);
        bytes memory good = t.leaves[index];
        for (uint256 j; j < good.length; j++) {
            bytes memory bad = _copy(good);
            bad[j] = bytes1(uint8(good[j]) ^ 0x01);
            assertFalse(MerkleLib.verify(t.root, bad, index, leafCount, t.path), "flipped byte accepted");
        }
    }

    // ---------------------------------------------------------------- (d) wrong path shape

    /// @dev A path with one element removed is rejected.
    function testFuzz_shortPathIsRejected(uint8 countSeed, uint32 indexSeed) public {
        uint32 leafCount = 1 + uint32(countSeed) % 64;
        uint32 index = indexSeed % leafCount;
        Tree memory t = _tree(leafCount, index, uint256(keccak256(abi.encode(countSeed, indexSeed))), 40);
        vm.assume(t.path.length > 0);
        bytes32[] memory short = new bytes32[](t.path.length - 1);
        for (uint256 i; i < short.length; i++) {
            short[i] = t.path[i];
        }
        assertFalse(MerkleLib.verify(t.root, t.leaves[index], index, leafCount, short), "short path accepted");
    }

    /// @dev A path with one element appended is rejected.
    function testFuzz_longPathIsRejected(uint8 countSeed, uint32 indexSeed) public {
        uint32 leafCount = 1 + uint32(countSeed) % 64;
        uint32 index = indexSeed % leafCount;
        Tree memory t = _tree(leafCount, index, uint256(keccak256(abi.encode(countSeed, indexSeed))), 40);
        bytes32[] memory long = new bytes32[](t.path.length + 1);
        for (uint256 i; i < t.path.length; i++) {
            long[i] = t.path[i];
        }
        long[t.path.length] = keccak256(abi.encodePacked("extra", countSeed, indexSeed));
        assertFalse(MerkleLib.verify(t.root, t.leaves[index], index, leafCount, long), "long path accepted");
    }

    /// @dev Swapping two distinct path elements is rejected.
    function testFuzz_swappedPathElementsAreRejected(uint8 countSeed, uint32 indexSeed, uint8 swapSeed) public {
        uint32 leafCount = 1 + uint32(countSeed) % 64;
        uint32 index = indexSeed % leafCount;
        Tree memory t = _tree(leafCount, index, uint256(keccak256(abi.encode(countSeed, indexSeed, swapSeed))), 40);
        uint256 len = t.path.length;
        vm.assume(len >= 2);
        uint256 a = uint256(swapSeed) % len;
        uint256 b = (uint256(swapSeed) >> 8) % len;
        vm.assume(a != b);
        vm.assume(t.path[a] != t.path[b]);
        bytes32[] memory swapped = new bytes32[](len);
        for (uint256 i; i < len; i++) {
            swapped[i] = t.path[i];
        }
        (swapped[a], swapped[b]) = (swapped[b], swapped[a]);
        assertFalse(MerkleLib.verify(t.root, t.leaves[index], index, leafCount, swapped), "swapped path accepted");
    }

    // ---------------------------------------------------------------- (e) expected length

    /// @dev verifyLeaf rejects data one byte short or one byte long.
    function testFuzz_expectedLengthIsEnforced(uint8 countSeed, uint32 indexSeed, uint8 lenSeed) public {
        uint32 leafCount = 1 + uint32(countSeed) % 64;
        uint32 index = indexSeed % leafCount;
        uint256 dataLen = 1 + uint256(lenSeed) % 40;
        Tree memory t = _tree(leafCount, index, uint256(keccak256(abi.encode(countSeed, indexSeed, lenSeed))), dataLen);
        bytes memory good = t.leaves[index];
        assertTrue(MerkleLib.verifyLeaf(t.root, good, index, leafCount, good.length, t.path), "valid length rejected");

        bytes memory short = new bytes(good.length - 1);
        for (uint256 i; i < short.length; i++) {
            short[i] = good[i];
        }
        bytes memory long = new bytes(good.length + 1);
        for (uint256 i; i < good.length; i++) {
            long[i] = good[i];
        }
        long[good.length] = bytes1(0x2a);

        assertFalse(MerkleLib.verifyLeaf(t.root, short, index, leafCount, good.length, t.path), "short data accepted");
        assertFalse(MerkleLib.verifyLeaf(t.root, long, index, leafCount, good.length, t.path), "long data accepted");
        assertFalse(
            MerkleLib.verifyLeaf(t.root, short, index, leafCount, short.length, t.path), "short data with short length"
        );
        assertFalse(
            MerkleLib.verifyLeaf(t.root, long, index, leafCount, long.length, t.path), "long data with long length"
        );
    }

    // ---------------------------------------------------------------- (f) wrong root

    /// @dev The proof does not verify against a different root.
    function testFuzz_differentRootIsRejected(uint8 countSeed, uint32 indexSeed) public {
        uint32 leafCount = 1 + uint32(countSeed) % 64;
        uint32 index = indexSeed % leafCount;
        Tree memory t = _tree(leafCount, index, uint256(keccak256(abi.encode(countSeed, indexSeed))), 40);
        bytes32 other = bytes32(uint256(t.root) ^ 1);
        assertFalse(MerkleLib.verify(other, t.leaves[index], index, leafCount, t.path), "wrong root accepted");
    }
}
