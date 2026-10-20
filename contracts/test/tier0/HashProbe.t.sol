// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HashProbe} from "../../src/tier0/HashProbe.sol";

contract HashProbeTest is Test {
    HashProbe private probe;

    function setUp() public {
        probe = new HashProbe();
    }

    function testHashMatchesKeccak() public {
        bytes32 input = keccak256("makhzan");
        assertEq(probe.hashOnly(input), keccak256(abi.encodePacked(input)));
    }

    function testWriteSlotStores() public {
        probe.writeSlot(99);
        assertEq(probe.slot(), 99);
    }

    function testReferenceEventShape() public {
        bytes32 topic = keccak256("topic");
        bytes32 data = keccak256("data");
        vm.expectEmit(true, false, false, true, address(probe));
        emit HashProbe.Reference(topic, data);
        probe.emitReference(topic, data);
    }
}
