// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {MerkleLib} from "../../src/makhzan/lib/MerkleLib.sol";

/// @notice Reads the contract-side copy of the shared vectors and verifies every path on-chain.
contract GoldenVectorsTest is Test {
    using stdJson for string;

    string private constant FIXTURE = "test/fixtures/vectors.json";

    function test_allSharedVectors() public view {
        string memory json = vm.readFile(FIXTURE);
        _checkVector(json, ".vectors.leafCount1", 1);
        _checkVector(json, ".vectors.leafCount3", 3);
        _checkVector(json, ".vectors.leafCount7", 7);
        _checkVector(json, ".vectors.leafCount1000", 1000);
    }

    function _checkVector(string memory json, string memory key, uint32 leafCount) internal pure {
        bytes[] memory leaves = json.readBytesArray(string.concat(key, ".leaves"));
        bytes32[] memory leafHashes = json.readBytes32Array(string.concat(key, ".leafHashes"));
        bytes32 declaredRoot = json.readBytes32(string.concat(key, ".root"));
        uint256[] memory pathLengths = json.readUintArray(string.concat(key, ".pathLengths"));
        bytes32[] memory siblings = json.readBytes32Array(string.concat(key, ".siblingHashes"));

        assertEq(leaves.length, leafCount, "leaf count");
        assertEq(leafHashes.length, leafCount, "leaf hash count");
        assertEq(pathLengths.length, leafCount, "path length count");

        for (uint32 i = 0; i < leafCount; i++) {
            assertEq(MerkleLib.leafHash(leaves[i]), leafHashes[i], "leaf hash");
        }
        assertEq(MerkleLib.root(leafHashes), declaredRoot, "root");

        uint256 offset = 0;
        for (uint32 i = 0; i < leafCount; i++) {
            uint256 len = pathLengths[i];
            assertEq(MerkleLib.pathLength(i, leafCount), len, "derived path length");
            bytes32[] memory path = new bytes32[](len);
            for (uint256 j = 0; j < len; j++) {
                path[j] = siblings[offset + j];
            }
            offset += len;
            assertTrue(MerkleLib.verify(declaredRoot, leaves[i], i, leafCount, path), "path verifies");
        }
        assertEq(offset, siblings.length, "all siblings consumed");
    }
}
