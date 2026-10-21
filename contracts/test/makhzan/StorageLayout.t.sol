// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MakhzanHarness} from "./harness/MakhzanHarness.sol";

/// @notice T022 — storage slot budget (FR-036, contracts/storage-layout.md).
/// @dev Slots: 0 config A, 1 config B, 2 providerIdOf, 3 providers, 4 deals.
contract StorageLayoutTest is Test {
    uint256 internal constant WPU = 10_000;
    uint64 internal constant MIN_BOND = 1e15;
    uint64 internal constant TOP_UP = 5e14;
    uint16 internal constant BLOCK_SIZE = 1024;
    uint64 internal constant PRICE = 5e14;
    uint32 internal constant SIZE = 3172; // 4 leaves, last 100 bytes
    bytes32 internal constant ROOT = bytes32(uint256(0x5eed));

    MakhzanHarness internal m;
    address internal provider = address(0xA11CE);
    address internal client = address(0xC11E17);

    function setUp() public {
        m = new MakhzanHarness(address(this), 50, BLOCK_SIZE, 2000, MIN_BOND, 600, 14_400);
        vm.deal(provider, 100 ether);
        vm.deal(client, 100 ether);
        vm.prank(provider);
        m.registerProvider{value: uint256(MIN_BOND) * WPU}();
        vm.prank(provider);
        m.addBond{value: uint256(TOP_UP) * WPU}();
        vm.prank(client);
        m.createDeal{value: uint256(PRICE) * WPU}(1, ROOT, 4, SIZE, 600, PRICE);
    }

    function _providerSlot(uint16 id) internal pure returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encode(uint256(3)))) + (id - 1));
    }

    function _dealSlot(uint32 id) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(id), uint256(4)));
    }

    function _load(bytes32 slot) internal view returns (uint256) {
        return uint256(vm.load(address(m), slot));
    }

    function test_twoConfigSlotsAreWrittenOnce() public view {
        assertTrue(_load(bytes32(uint256(0))) != 0, "config slot 0 written");
        assertTrue(_load(bytes32(uint256(1))) != 0, "config slot 1 written");
        // Slot 0 packs admin | window | blockSize | slashBps | paused into 29 of 32 bytes.
        assertEq(_load(bytes32(uint256(0))) >> 232, 0, "config slot 0 uses 29 bytes");
        // Slot 1 packs minBond | nextDealId | providerCount | durations into 22 of 32 bytes.
        assertEq(_load(bytes32(uint256(1))) >> 176, 0, "config slot 1 uses 22 bytes");
    }

    function test_providerUsesTwoSlots() public view {
        bytes32 element = _providerSlot(1);
        bytes32 idEntry = keccak256(abi.encode(provider, uint256(2)));
        uint256 packed = _load(element);

        assertTrue(packed != 0, "provider element written");
        assertEq(address(uint160(packed)), provider, "addr in slot 0..19");
        assertEq(uint64(packed >> 160), MIN_BOND + TOP_UP, "bond in slot 20..27");
        assertEq(uint24(packed >> 224), 1, "activeDeals in slot 28..30");
        assertEq(uint8(packed >> 248), 1, "registered flag in slot 31");
        assertTrue(_load(idEntry) != 0, "provider id mapping entry written");
        assertEq(_load(bytes32(uint256(element) + 1)), 0, "provider element fits in one slot");
    }

    function test_dealUsesThreeSlots() public view {
        bytes32 base = _dealSlot(1);
        uint256 a = _load(base);
        uint256 b = _load(bytes32(uint256(base) + 1));
        uint256 c = _load(bytes32(uint256(base) + 2));
        uint256 d = _load(bytes32(uint256(base) + 3));

        assertTrue(a != 0, "deal slot A written");
        assertTrue(b != 0, "deal slot B written");
        assertTrue(c != 0, "deal slot C written");
        assertEq(d, 0, "deal uses exactly three slots");

        assertEq(address(uint160(a)), client, "owner in slot A 0..19");
        assertEq(uint32(a >> 160), block.number, "startBlock in slot A 20..23");
        assertEq(uint32(a >> 192), uint32(block.number) + 600, "endBlock in slot A 24..27");
        assertEq(uint16(a >> 224), 1, "providerId in slot A 28..29");
        assertEq(uint8(a >> 240), 0, "flags in slot A 30");
        assertEq(a >> 248, 0, "slot A uses 31 bytes");
        assertEq(bytes32(b), ROOT, "root fills slot B");

        assertEq(uint24(c), 4, "leafCount in slot C 0..2");
        assertEq(uint32(c >> 24), SIZE, "size in slot C 3..6");
        assertEq(uint64(c >> 120), PRICE, "price in slot C 15..22");
        assertEq(uint64(c >> 184), 0, "claimed in slot C 23..30");
        assertEq(c >> 248, 0, "slot C uses 31 bytes");
    }
}
