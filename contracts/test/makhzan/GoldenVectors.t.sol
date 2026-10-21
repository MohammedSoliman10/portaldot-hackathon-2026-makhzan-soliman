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

    /// @dev T010 red: the walk is wired in T011.
    function _checkVector(string memory json, string memory key, uint32 leafCount) internal view {
        json;
        key;
        leafCount;
        assertTrue(false, "golden vector walk not wired");
    }
}
