// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IMakhzan} from "../../../src/makhzan/IMakhzan.sol";
import {MakhzanHarness} from "./MakhzanHarness.sol";
import {TreeHarness} from "./TreeHarness.sol";

/// @notice Shared fixture for the US2, guard and invariant suites.
abstract contract MakhzanTestBase is Test {
    uint256 internal constant WPU = 10_000;
    uint64 internal constant MIN_BOND = 1e15; // 10 tPOT in planck
    uint16 internal constant BLOCK_SIZE = 1024;
    uint64 internal constant PRICE = 5e14; // 5 tPOT in planck
    uint32 internal constant SIZE = 3172; // four blocks, last one 100 bytes
    uint24 internal constant LEAF_COUNT = 4;
    uint32 internal constant DURATION = 600;
    uint32 internal constant WINDOW = 50;
    uint16 internal constant SLASH_BPS = 2000;

    MakhzanHarness internal m;
    TreeHarness internal tree;
    bytes32 internal root;

    address internal provider = address(0xA11CE);
    address internal client = address(0xC11E17);
    address internal stranger = address(0x57A);

    function setUp() public virtual {
        m = new MakhzanHarness(WINDOW, BLOCK_SIZE, SLASH_BPS, MIN_BOND, DURATION, 14_400);
        tree = new TreeHarness();
        root = tree.root(SIZE, BLOCK_SIZE);
        vm.deal(provider, 1_000 ether);
        vm.deal(client, 1_000 ether);
        vm.deal(stranger, 1_000 ether);
        vm.prank(provider);
        m.registerProvider{value: uint256(MIN_BOND) * WPU}();
    }

    function _wei(uint64 units) internal pure returns (uint256) {
        return uint256(units) * WPU;
    }

    function _bond() internal view returns (uint64 bond) {
        (, bond,,) = m.providerOf(provider);
    }

    struct DealView {
        address owner;
        uint32 startBlock;
        uint32 endBlock;
        uint16 providerId;
        uint8 flags;
        bytes32 root;
        uint24 leafCount;
        uint32 size;
        uint32 challengeIndex;
        uint32 challengeStart;
        uint64 price;
        uint64 claimed;
    }

    function _deal(uint32 dealId) internal view returns (DealView memory d) {
        (bool ok, bytes memory ret) = address(m).staticcall(abi.encodeWithSelector(IMakhzan.dealOf.selector, dealId));
        require(ok, "dealOf failed");
        d = abi.decode(ret, (DealView));
    }

    function _dealFlags(uint32 dealId) internal view returns (uint8 flags) {
        return _deal(dealId).flags;
    }

    function _activeDeals() internal view returns (uint24 count) {
        (,, count,) = m.providerOf(provider);
    }

    function _createDeal() internal returns (uint32 dealId) {
        vm.prank(client);
        m.createDeal{value: _wei(PRICE)}(1, root, LEAF_COUNT, SIZE, DURATION, PRICE);
        dealId = 1;
    }

    /// @dev Opens a challenge and returns the recorded index.
    function _openChallenge(uint32 dealId) internal returns (uint32 index) {
        vm.prank(client);
        m.challenge(dealId);
        (bool open, uint32 recordedIndex,,,) = m.challengeStateOf(dealId);
        assertTrue(open, "challenge did not open");
        index = recordedIndex;
    }

    function _answerAt(uint32 dealId, uint32 index) internal {
        bytes memory data = tree.leaf(SIZE, BLOCK_SIZE, index);
        bytes32[] memory proof = tree.path(SIZE, BLOCK_SIZE, index);
        vm.prank(provider);
        m.answer(dealId, data, proof);
    }

    function _dealEnd(uint32 dealId) internal view returns (uint32 endBlock) {
        return _deal(dealId).endBlock;
    }
}
