// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ValueEcho} from "../../src/tier0/ValueEcho.sol";

contract ValueEchoTest is Test {
    ValueEcho private echo;

    function setUp() public {
        echo = new ValueEcho();
        vm.deal(address(this), 1_000 ether);
    }

    function testEchoReturnsSentValueAndSender() public {
        (uint256 value, address sender, uint256 timestamp, uint256 number) = echo.echo{value: 1 ether}();
        assertEq(value, 1 ether);
        assertEq(sender, address(this));
        assertEq(timestamp, block.timestamp);
        assertEq(number, block.number);
    }

    function testRecordStoresValueAndEmits() public {
        vm.expectEmit(true, false, false, true, address(echo));
        emit ValueEcho.Echoed(address(this), 2 ether, block.timestamp, block.number);
        echo.record{value: 2 ether}();
        assertEq(echo.lastValue(), 2 ether);
        assertEq(echo.lastSender(), address(this));
        assertEq(echo.lastTimestamp(), block.timestamp);
        assertEq(echo.lastNumber(), block.number);
    }

    function testFuzzValueIsEchoedExactly(uint96 amount) public {
        vm.deal(address(this), uint256(amount) * 2 + 1 ether);
        echo.echo{value: amount}();
        echo.record{value: amount}();
        assertEq(echo.lastValue(), uint256(amount));
    }

    function testRecordWithoutValueStoresZero() public {
        echo.record();
        assertEq(echo.lastValue(), 0);
    }
}
