// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CounterProbe} from "../../src/tier0/CounterProbe.sol";

contract CounterProbeTest is Test {
    CounterProbe private probe;

    function setUp() public {
        probe = new CounterProbe();
    }

    function testStartsAtZero() public view {
        assertEq(probe.get(), 0);
    }

    function testSetThenGet() public {
        probe.set(7);
        assertEq(probe.get(), 7);
    }

    function testSetEmitsIndexedValue() public {
        vm.expectEmit(true, false, false, true, address(probe));
        emit CounterProbe.Set(7);
        probe.set(7);
    }

    function testBoomRevertsWithReason() public {
        vm.expectRevert("CounterProbe: boom");
        probe.boom();
    }

    function testFuzzSetGet(uint256 value) public {
        probe.set(value);
        assertEq(probe.get(), value);
    }
}
