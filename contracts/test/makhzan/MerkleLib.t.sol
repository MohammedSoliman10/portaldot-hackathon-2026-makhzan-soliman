// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MerkleLib} from "../../src/makhzan/lib/MerkleLib.sol";

contract MerkleLibTest is Test {
    function _bytes(uint256 i) internal pure returns (bytes memory) {
        return abi.encodePacked("makhzan-leaf-", i);
    }

    function _leafHashes(uint32 count) internal pure returns (bytes32[] memory hashes) {
        hashes = new bytes32[](count);
        for (uint32 i = 0; i < count; i++) {
            hashes[i] = MerkleLib.leafHash(_bytes(i));
        }
    }

    function _nextLevel(bytes32[] memory level) internal pure returns (bytes32[] memory next) {
        uint256 n = (level.length + 1) / 2;
        next = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 left = i * 2;
            if (left + 1 < level.length) {
                next[i] = MerkleLib.nodeHash(level[left], level[left + 1]);
            } else {
                next[i] = level[left]; // promoted
            }
        }
    }

    function _root(bytes32[] memory leafHashes) internal pure returns (bytes32) {
        bytes32[] memory level = leafHashes;
        while (level.length > 1) {
            level = _nextLevel(level);
        }
        return level[0];
    }

    /// @dev Test-local path length, independent of MerkleLib.pathLength.
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
        pure
        returns (bytes32[] memory path)
    {
        path = new bytes32[](_expectedLength(index, leafCount));
        bytes32[] memory level = leafHashes;
        uint32 idx = index;
        uint32 count = leafCount;
        uint32 p;
        while (count > 1) {
            if (!(count % 2 == 1 && idx == count - 1)) {
                path[p++] = level[idx ^ 1];
            }
            idx /= 2;
            count = (count + 1) / 2;
            level = _nextLevel(level);
        }
    }

    function test_singleLeafRootIsTheLeafHash() public pure {
        bytes32[] memory hashes = _leafHashes(1);
        assertEq(MerkleLib.root(hashes), MerkleLib.leafHash(_bytes(0)), "single leaf root");
        assertEq(MerkleLib.pathLength(0, 1), 0, "single leaf path length");
    }

    function test_threeLeafRootPromotesTheOddNode() public pure {
        bytes32[] memory hashes = _leafHashes(3);
        bytes32 expected = MerkleLib.nodeHash(MerkleLib.nodeHash(hashes[0], hashes[1]), hashes[2]);
        assertEq(MerkleLib.root(hashes), expected, "3-leaf root");
        assertEq(MerkleLib.pathLength(0, 3), 2, "index 0");
        assertEq(MerkleLib.pathLength(1, 3), 2, "index 1");
        assertEq(MerkleLib.pathLength(2, 3), 1, "promoted index 2");
    }

    function test_sevenLeafRootAndPathLengths() public pure {
        bytes32[] memory hashes = _leafHashes(7);
        assertEq(MerkleLib.root(hashes), _root(hashes), "7-leaf root");
        assertEq(MerkleLib.pathLength(0, 7), 3, "index 0");
        assertEq(MerkleLib.pathLength(6, 7), 2, "promoted index 6");
    }

    function test_everyValidPathVerifies() public pure {
        uint32[3] memory counts = [uint32(1), 3, 7];
        for (uint256 c = 0; c < counts.length; c++) {
            uint32 count = counts[c];
            bytes32[] memory hashes = _leafHashes(count);
            bytes32 expectedRoot = _root(hashes);
            for (uint32 i = 0; i < count; i++) {
                bytes32[] memory path = _path(hashes, i, count);
                assertTrue(MerkleLib.verify(expectedRoot, _bytes(i), i, count, path), "valid path must verify");
            }
        }
    }

    function test_proofForOneIndexIsRejectedAtEveryOtherIndex() public pure {
        uint32 count = 7;
        bytes32[] memory hashes = _leafHashes(count);
        bytes32 expectedRoot = _root(hashes);
        for (uint32 i = 0; i < count; i++) {
            bytes32[] memory path = _path(hashes, i, count);
            for (uint32 j = 0; j < count; j++) {
                if (i == j) continue;
                assertFalse(MerkleLib.verify(expectedRoot, _bytes(i), j, count, path), "position replay must fail");
            }
        }
    }

    function test_shortenedReorderedAndExtendedPathsAreRejected() public pure {
        uint32 count = 7;
        bytes32[] memory hashes = _leafHashes(count);
        bytes32 expectedRoot = _root(hashes);
        bytes32[] memory path = _path(hashes, 3, count);

        bytes32[] memory short = new bytes32[](path.length - 1);
        for (uint256 i = 0; i < short.length; i++) {
            short[i] = path[i];
        }
        assertFalse(MerkleLib.verify(expectedRoot, _bytes(3), 3, count, short), "short path");

        bytes32[] memory long = new bytes32[](path.length + 1);
        for (uint256 i = 0; i < path.length; i++) {
            long[i] = path[i];
        }
        assertFalse(MerkleLib.verify(expectedRoot, _bytes(3), 3, count, long), "long path");

        bytes32[] memory swapped = new bytes32[](path.length);
        for (uint256 i = 0; i < path.length; i++) {
            swapped[i] = path[i];
        }
        (swapped[0], swapped[1]) = (swapped[1], swapped[0]);
        assertFalse(MerkleLib.verify(expectedRoot, _bytes(3), 3, count, swapped), "reordered path");
    }

    function test_wrongBytesAreRejected() public pure {
        uint32 count = 3;
        bytes32[] memory hashes = _leafHashes(count);
        bytes32 expectedRoot = _root(hashes);
        bytes32[] memory path = _path(hashes, 1, count);
        assertFalse(MerkleLib.verify(expectedRoot, _bytes(99), 1, count, path), "wrong bytes");
    }

    function test_zeroLeafCountAndOutOfRangeIndexAreRejected() public pure {
        bytes32[] memory emptyPath = new bytes32[](0);
        assertFalse(MerkleLib.verify(bytes32(0), _bytes(0), 0, 0, emptyPath), "zero leaf count");
        bytes32[] memory hashes = _leafHashes(3);
        assertFalse(MerkleLib.verify(_root(hashes), _bytes(0), 3, 3, emptyPath), "index out of range");
    }
}
