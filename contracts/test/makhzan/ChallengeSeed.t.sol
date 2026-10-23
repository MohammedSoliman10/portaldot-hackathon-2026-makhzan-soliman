// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";

/// @notice R4 — the D5 selector mixes the deal id: many deals in one block and deals across 40 blocks
///         must not collapse to a single index, and every index stays below the committed leaf count.
contract ChallengeSeedTest is MakhzanTestBase {
    function _create(uint256 count) internal returns (uint32 first) {
        first = uint32(count);
        for (uint256 i = 0; i < count; i++) {
            vm.prank(client);
            m.createDeal{value: _wei(PRICE)}(1, root, LEAF_COUNT, SIZE, DURATION, PRICE);
        }
    }

    function _index(uint32 dealId) internal returns (uint32 index) {
        vm.prank(client);
        m.challenge(dealId);
        (, index,,,) = m.challengeStateOf(dealId);
    }

    function test_manyDealsInOneBlockDoNotShareOneIndex() public {
        uint32 start = uint32(block.number);
        uint32 count = 16;
        _create(count);
        uint32[] memory indices = new uint32[](count);
        uint256 distinct;
        for (uint32 i = 0; i < count; i++) {
            indices[i] = _index(i + 1);
            assertLt(indices[i], LEAF_COUNT, "index must be below leafCount");
            bool seen;
            for (uint32 j = 0; j < i; j++) {
                if (indices[j] == indices[i]) seen = true;
            }
            if (!seen) distinct++;
        }
        assertGt(distinct, 1, "16 deals in one block used a single challenge index");
        assertEq(uint32(block.number), start, "all deals and challenges stayed in one block");
    }

    function test_dealsAcrossFortyBlocksKeepVaryingIndices() public {
        uint32 start = uint32(block.number);
        uint256 distinct;
        uint32 previous = type(uint32).max;
        for (uint32 i = 0; i < 40; i++) {
            vm.roll(start + i);
            _create(1);
            uint32 index = _index(i + 1);
            assertLt(index, LEAF_COUNT, "index must be below leafCount");
            if (index != previous) distinct++;
            previous = index;
        }
        assertGt(distinct, 1, "40 blocks produced a single challenge index");
    }
}
