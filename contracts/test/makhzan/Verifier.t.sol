// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {VerifyHarness} from "./harness/VerifyHarness.sol";

contract VerifierTest is Test {
    VerifyHarness private harness;

    function setUp() public {
        harness = new VerifyHarness();
    }

    function _leaf(uint64 i) internal pure returns (bytes memory) {
        return abi.encodePacked(i);
    }

    function _leafHashes(uint32 count) internal view returns (bytes32[] memory hashes) {
        hashes = new bytes32[](count);
        for (uint32 i = 0; i < count; i++) {
            hashes[i] = harness.leafHash(_leaf(i));
        }
    }

    function _nextLevel(bytes32[] memory level) internal view returns (bytes32[] memory next) {
        uint256 n = (level.length + 1) / 2;
        next = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 left = i * 2;
            next[i] = left + 1 < level.length ? harness.nodeHash(level[left], level[left + 1]) : level[left];
        }
    }

    function _root(bytes32[] memory leafHashes) internal view returns (bytes32) {
        bytes32[] memory level = leafHashes;
        while (level.length > 1) level = _nextLevel(level);
        return level[0];
    }

    function _expectedLength(uint32 index, uint32 leafCount) internal pure returns (uint32 len) {
        uint32 idx = index;
        uint32 count = leafCount;
        while (count > 1) {
            if (!(count % 2 == 1 && idx == count - 1)) len++;
            idx /= 2;
            count = (count + 1) / 2;
        }
    }

    function _path(bytes32[] memory leafHashes, uint32 index, uint32 leafCount)
        internal
        view
        returns (bytes32[] memory path)
    {
        path = new bytes32[](_expectedLength(index, leafCount));
        bytes32[] memory level = leafHashes;
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

    function _fixture()
        internal
        view
        returns (bytes32 root, bytes32[] memory hashes, bytes32[] memory path, uint256 expectedLen)
    {
        uint32 count = 7;
        hashes = _leafHashes(count);
        root = _root(hashes);
        path = _path(hashes, 3, count);
        expectedLen = _leaf(3).length;
    }

    function test_correctAnswerIsAccepted() public view {
        (bytes32 root, bytes32[] memory hashes, bytes32[] memory path, uint256 expectedLen) = _fixture();
        hashes;
        assertTrue(harness.verifyLeaf(root, _leaf(3), 3, 7, expectedLen, path), "valid answer");
    }

    function test_hashUsedAsPayloadIsRejected() public view {
        (bytes32 root, bytes32[] memory hashes, bytes32[] memory path, uint256 expectedLen) = _fixture();
        bytes memory hashPayload = abi.encodePacked(hashes[3]);
        assertFalse(harness.verifyLeaf(root, hashPayload, 3, 7, expectedLen, path), "hash payload");
    }

    function test_emptyPayloadIsRejected() public view {
        (bytes32 root,, bytes32[] memory path, uint256 expectedLen) = _fixture();
        assertFalse(harness.verifyLeaf(root, "", 3, 7, expectedLen, path), "empty payload");
    }

    function test_payloadOneByteShortAndLongIsRejected() public view {
        (bytes32 root,, bytes32[] memory path, uint256 expectedLen) = _fixture();
        bytes memory short = new bytes(expectedLen - 1);
        bytes memory long = new bytes(expectedLen + 1);
        assertFalse(harness.verifyLeaf(root, short, 3, 7, expectedLen, path), "short payload");
        assertFalse(harness.verifyLeaf(root, long, 3, 7, expectedLen, path), "long payload");
    }

    function test_pathOneElementShortAndLongIsRejected() public view {
        (bytes32 root,, bytes32[] memory path, uint256 expectedLen) = _fixture();
        bytes32[] memory short = new bytes32[](path.length - 1);
        for (uint256 i = 0; i < short.length; i++) {
            short[i] = path[i];
        }
        bytes32[] memory long = new bytes32[](path.length + 1);
        for (uint256 i = 0; i < path.length; i++) {
            long[i] = path[i];
        }
        assertFalse(harness.verifyLeaf(root, _leaf(3), 3, 7, expectedLen, short), "short path");
        assertFalse(harness.verifyLeaf(root, _leaf(3), 3, 7, expectedLen, long), "long path");
    }

    function test_pathForAnotherIndexIsRejected() public view {
        (bytes32 root,, bytes32[] memory path, uint256 expectedLen) = _fixture();
        assertFalse(harness.verifyLeaf(root, _leaf(4), 4, 7, expectedLen, path), "another index");
    }

    function test_reorderedPathIsRejected() public view {
        (bytes32 root,, bytes32[] memory path, uint256 expectedLen) = _fixture();
        (path[0], path[1]) = (path[1], path[0]);
        assertFalse(harness.verifyLeaf(root, _leaf(3), 3, 7, expectedLen, path), "reordered path");
    }

    // ------------------------------------------------------------------ short last block

    /// @dev Blocks for a file of `size` bytes at `blockSize`: full blocks except the last remainder.
    function _blocks(uint32 size, uint16 blockSize) internal pure returns (bytes[] memory blocks) {
        uint32 count = uint32((uint256(size) + blockSize - 1) / blockSize);
        blocks = new bytes[](count);
        for (uint32 i; i < count; i++) {
            uint256 len = i == count - 1 ? uint256(size) - uint256(count - 1) * blockSize : blockSize;
            bytes memory b = new bytes(len);
            for (uint256 j; j < len; j++) {
                b[j] = bytes1(uint8(uint256(i) * 31 + j + 1));
            }
            blocks[i] = b;
        }
    }

    function _hashesOf(bytes[] memory blocks) internal view returns (bytes32[] memory hashes) {
        hashes = new bytes32[](blocks.length);
        for (uint256 i; i < blocks.length; i++) {
            hashes[i] = harness.leafHash(blocks[i]);
        }
    }

    /// @dev A 3-leaf tree whose last block (8 bytes) is shorter than the 16-byte block size.
    function test_threeLeafShortLastBlockVerifiesWithRemainderLength() public view {
        uint32 size = 40;
        uint16 blockSize = 16;
        bytes[] memory blocks = _blocks(size, blockSize);
        assertEq(blocks.length, 3, "three leaves");
        assertEq(blocks[2].length, 8, "last block is the 8-byte remainder");
        bytes32[] memory hashes = _hashesOf(blocks);
        bytes32 root = _root(hashes);
        uint32 leafCount = uint32(blocks.length);

        bytes32[] memory lastPath = _path(hashes, 2, leafCount);
        assertEq(lastPath.length, 1, "promoted index 2 path");
        assertTrue(harness.verifyLeaf(root, blocks[2], 2, leafCount, 8, lastPath), "short last block accepted");
        assertFalse(harness.verifyLeaf(root, blocks[2], 2, leafCount, blockSize, lastPath), "full-size length rejected");

        bytes32[] memory firstPath = _path(hashes, 0, leafCount);
        assertTrue(harness.verifyLeaf(root, blocks[0], 0, leafCount, blockSize, firstPath), "full block accepted");
        assertFalse(harness.verifyLeaf(root, blocks[0], 0, leafCount, 8, firstPath), "short length rejected");
    }

    /// @dev A 7-leaf tree (53 bytes, 8-byte blocks) whose last block is 5 bytes.
    function test_sevenLeafShortLastBlockVerifiesWithRemainderLength() public view {
        uint32 size = 53;
        uint16 blockSize = 8;
        bytes[] memory blocks = _blocks(size, blockSize);
        assertEq(blocks.length, 7, "seven leaves");
        assertEq(blocks[6].length, 5, "last block is the 5-byte remainder");
        bytes32[] memory hashes = _hashesOf(blocks);
        bytes32 root = _root(hashes);
        uint32 leafCount = uint32(blocks.length);

        bytes32[] memory lastPath = _path(hashes, 6, leafCount);
        assertEq(lastPath.length, 2, "promoted index 6 path");
        assertTrue(harness.verifyLeaf(root, blocks[6], 6, leafCount, 5, lastPath), "short last block accepted");
        assertFalse(harness.verifyLeaf(root, blocks[6], 6, leafCount, blockSize, lastPath), "full-size length rejected");

        bytes32[] memory midPath = _path(hashes, 5, leafCount);
        assertTrue(harness.verifyLeaf(root, blocks[5], 5, leafCount, blockSize, midPath), "full block accepted");
        assertFalse(harness.verifyLeaf(root, blocks[5], 5, leafCount, 5, midPath), "short length rejected");
    }
}
