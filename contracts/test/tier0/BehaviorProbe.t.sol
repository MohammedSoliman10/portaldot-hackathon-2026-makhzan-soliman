// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BehaviorProbe} from "../../src/tier0/BehaviorProbe.sol";

contract BehaviorProbeTest is Test {
    BehaviorProbe private probe;

    function setUp() public {
        probe = new BehaviorProbe();
        vm.deal(address(this), 100 ether);
    }

    function testStorageWriteThenRead() public {
        probe.store{value: 1 ether}(42);
        (uint256 value, uint256 received, uint256 timestamp, uint256 number) = probe.read();
        assertEq(value, 42);
        assertEq(received, 1 ether);
        assertEq(timestamp, block.timestamp);
        assertEq(number, block.number);
    }

    function testEventHasIndexedSenderAndValue() public {
        vm.expectEmit(true, true, false, true, address(probe));
        emit BehaviorProbe.Stored(address(this), 42, block.timestamp, block.number);
        probe.store{value: 3}(42);
    }

    function testCustomRevertReasonIsPropagated() public {
        vm.expectRevert(bytes("BehaviorProbe: custom reason"));
        probe.fail("BehaviorProbe: custom reason");
    }

    function testBoomRevertsWithReason() public {
        vm.expectRevert(bytes("BehaviorProbe: boom"));
        probe.boom();
    }

    function testPayableValueIsAccepted() public {
        uint256 before = address(probe).balance;
        probe.store{value: 5 ether}(1);
        assertEq(address(probe).balance - before, 5 ether);
    }

    function testTimestampIsMonotonic() public {
        probe.store(1);
        (,, uint256 first,) = probe.read();
        vm.warp(block.timestamp + 30);
        probe.store(2);
        (,, uint256 second,) = probe.read();
        assertGt(second, first);
    }

    function testBlockNumberIsMonotonic() public {
        probe.store(1);
        (,,, uint256 first) = probe.read();
        vm.roll(block.number + 5);
        probe.store(2);
        (,,, uint256 second) = probe.read();
        assertGt(second, first);
    }

    function testFuzzStoredValueAndPayment(uint256 value, uint96 payment) public {
        vm.deal(address(this), uint256(payment) + 1 ether);
        probe.store{value: payment}(value);
        (uint256 stored, uint256 received,,) = probe.read();
        assertEq(stored, value);
        assertEq(received, payment);
    }
}
