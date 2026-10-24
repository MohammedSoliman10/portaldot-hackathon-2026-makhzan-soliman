// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IMakhzan} from "../../src/makhzan/IMakhzan.sol";
import {MakhzanHarness} from "./harness/MakhzanHarness.sol";
import {TreeHarness} from "./harness/TreeHarness.sol";
import {MerkleLib} from "../../src/makhzan/lib/MerkleLib.sol";

/// @notice T020 — deal creation validation and escrow (FR-005–FR-008, FR-046).
contract DealsTest is Test {
    uint256 internal constant WPU = 10_000;
    uint64 internal constant MIN_BOND = 1e15; // 10 tPOT in units
    uint16 internal constant BLOCK_SIZE = 1024;
    uint32 internal constant MIN_DURATION = 600;
    uint32 internal constant MAX_DURATION = 14_400;
    uint64 internal constant PRICE = 5e14; // 5 tPOT in units
    uint256 internal constant VALUE = uint256(PRICE) * WPU;
    bytes32 internal constant ROOT = bytes32(uint256(0x5eed));
    uint32 internal constant SIZE = 3172; // four 1024-byte blocks, last one 100 bytes
    uint24 internal constant LEAF_COUNT = 4;

    MakhzanHarness internal m;
    TreeHarness internal tree;
    address internal provider = address(0xA11CE);
    address internal client = address(0xC11E17);

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

    function _dealView(uint32 dealId) internal view returns (DealView memory d) {
        (bool ok, bytes memory ret) = address(m).staticcall(abi.encodeWithSelector(IMakhzan.dealOf.selector, dealId));
        require(ok, "dealOf failed");
        d = abi.decode(ret, (DealView));
    }

    function setUp() public {
        m = new MakhzanHarness(50, BLOCK_SIZE, 2000, MIN_BOND, MIN_DURATION, MAX_DURATION);
        tree = new TreeHarness();
        vm.deal(provider, 1_000 ether);
        vm.deal(client, 1_000 ether);
        vm.prank(provider);
        m.registerProvider{value: uint256(MIN_BOND) * WPU}();
    }

    function _create(uint16 providerId, bytes32 root, uint24 leafCount, uint32 size, uint32 duration, uint64 price)
        internal
        returns (uint32)
    {
        uint256 value = uint256(price) * WPU;
        vm.prank(client);
        m.createDeal{value: value}(providerId, root, leafCount, size, duration, price);
        return 1;
    }

    function _valid() internal returns (uint32) {
        return _create(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);
    }

    function test_zeroRootRejected() public {
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE}(1, bytes32(0), LEAF_COUNT, SIZE, MIN_DURATION, PRICE);
    }

    function test_zeroSizeRejected() public {
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE}(1, ROOT, LEAF_COUNT, 0, MIN_DURATION, PRICE);
    }

    function test_leafCountMustMatchSizeAndBlockSize() public {
        // One leaf too few: the implied last block would be zero bytes.
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE}(1, ROOT, LEAF_COUNT - 1, SIZE, MIN_DURATION, PRICE);

        // One leaf too many: the implied last block would exceed the block size.
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE}(1, ROOT, LEAF_COUNT + 1, SIZE, MIN_DURATION, PRICE);
    }

    function test_durationOutOfRangeRejected() public {
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE}(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION - 1, PRICE);

        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE}(1, ROOT, LEAF_COUNT, SIZE, MAX_DURATION + 1, PRICE);
    }

    function test_nonMultipleValueRejected() public {
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE + 1}(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);
    }

    function test_valueAboveUnitCapRejected() public {
        // A uint64 price already bounds the escrow; paying more than price * WEI_PER_UNIT is rejected.
        uint256 overCap = (uint256(type(uint64).max) + 1) * WPU;
        vm.deal(client, overCap);
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: overCap}(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);
    }

    function test_valueMustEqualPriceTimesUnit() public {
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE - WPU}(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);

        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE + WPU}(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);

        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE}(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE + 1);
    }

    function test_unknownProviderRejected() public {
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE}(2, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);
    }

    function test_providerBelowMinimumBondRejected() public {
        m.setBond(1, MIN_BOND - 1);
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: VALUE}(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);
    }

    function test_validDealStoresEveryField() public {
        uint32 start = uint32(block.number);
        uint32 dealId = _valid();

        DealView memory d = _dealView(dealId);
        assertEq(d.owner, client, "owner");
        assertEq(d.startBlock, start, "start block");
        assertEq(d.endBlock, start + MIN_DURATION, "end block");
        assertEq(d.providerId, 1, "provider id");
        assertEq(d.flags, 0, "no flags at creation");
        assertEq(d.root, ROOT, "root");
        assertEq(d.leafCount, LEAF_COUNT, "leaf count");
        assertEq(d.size, SIZE, "size");
        assertEq(d.challengeIndex, 0, "challenge index");
        assertEq(d.challengeStart, 0, "challenge start");
        assertEq(d.price, PRICE, "price in units");
        assertEq(d.claimed, 0, "claimed");
    }

    function test_escrowAndActiveDealCount() public {
        uint32 dealId = _valid();
        dealId;
        assertEq(address(m).balance, VALUE + uint256(MIN_BOND) * WPU, "bond + escrow held in wei");
        (uint16 id, uint64 bond, uint24 activeDeals, bool registered) = m.providerOf(provider);
        assertEq(id, 1, "provider id");
        assertEq(bond, MIN_BOND, "bond unchanged");
        assertEq(activeDeals, 1, "open deal count rose");
        assertTrue(registered, "still registered");
    }

    function test_idsAreUniqueAndMonotone() public {
        uint32 first = _valid();
        vm.prank(client);
        m.createDeal{value: VALUE}(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);

        DealView memory firstView = _dealView(first);
        DealView memory secondView = _dealView(2);
        DealView memory thirdView = _dealView(3);
        assertEq(first, 1, "first id");
        assertEq(firstView.owner, client, "first deal owner");
        assertEq(secondView.owner, client, "second deal owner");
        assertEq(secondView.price, PRICE, "second deal price");
        assertEq(secondView.root, ROOT, "second deal root");
        assertEq(secondView.startBlock, firstView.startBlock, "distinct records in the same block");
        assertEq(thirdView.owner, address(0), "no third deal");
    }

    function test_eventCarriesDocumentedFields() public {
        uint32 end = uint32(block.number) + MIN_DURATION;
        vm.expectEmit(true, true, true, true, address(m));
        emit IMakhzan.DealCreated(1, client, 1, ROOT, SIZE, end, PRICE);
        vm.prank(client);
        m.createDeal{value: VALUE}(1, ROOT, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);
    }

    /// @dev T024 — US1 independent test: a produced block-and-path verifies against the stored root.
    function test_producedPathVerifiesAgainstStoredRoot() public {
        bytes32 treeRoot = tree.root(SIZE, BLOCK_SIZE);
        vm.prank(client);
        m.createDeal{value: VALUE}(1, treeRoot, LEAF_COUNT, SIZE, MIN_DURATION, PRICE);

        DealView memory d = _dealView(1);
        assertEq(d.root, treeRoot, "deal commits the built root");
        assertEq(d.leafCount, tree.leafCount(SIZE, BLOCK_SIZE), "leaf count implied by size");

        for (uint32 i; i < d.leafCount; i++) {
            bytes memory blockData = tree.leaf(SIZE, BLOCK_SIZE, i);
            bytes32[] memory proof = tree.path(SIZE, BLOCK_SIZE, i);
            uint256 expectedLen = tree.leafLength(SIZE, BLOCK_SIZE, i);
            assertEq(blockData.length, expectedLen, "block has the committed length");
            assertTrue(
                MerkleLib.verifyLeaf(d.root, blockData, i, d.leafCount, expectedLen, proof),
                "produced path verifies at its own index"
            );
            if (i != 0) {
                assertFalse(
                    MerkleLib.verifyLeaf(d.root, blockData, 0, d.leafCount, expectedLen, proof),
                    "same path does not verify at another index"
                );
            }
        }
        assertEq(tree.leafLength(SIZE, BLOCK_SIZE, d.leafCount - 1), 100, "short last block");
    }
}
