// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SizeProbe} from "../../src/tier0/SizeProbe.sol";

contract SizeProbeTest is Test {
    function testDeploysExactlyRequestedSize(uint16 size) public {
        vm.assume(size > 0 && size <= 10_000);
        SizeProbe probe = new SizeProbe(size);
        assertEq(address(probe).code.length, size);
    }

    function testSmallLadder() public {
        uint256[4] memory sizes = [uint256(1), 24, 24576, 24577];
        for (uint256 index = 0; index < sizes.length; index++) {
            SizeProbe probe = new SizeProbe(sizes[index]);
            assertEq(address(probe).code.length, sizes[index]);
        }
    }
}
