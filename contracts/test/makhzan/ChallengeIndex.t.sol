// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "../../src/makhzan/IMakhzan.sol";
import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";

/// @notice M3 — deterministic challenge-index coverage and last-block byte-length rules (FR-014, FR-016).
/// @dev The helper never reads the selector's internals: it retries block number and prevrandao
///      combinations, snapshotting around each attempt, until the contract itself reports the wanted
///      index. This stays valid if T026's selector changes.
contract ChallengeIndexTest is MakhzanTestBase {
    uint256 internal constant MAX_TRIES = 400;

    /// @dev Forces the next challenge on `dealId` onto `wanted`, or fails loudly.
    function _forceChallenge(uint32 dealId, uint32 wanted) internal {
        for (uint256 i; i < MAX_TRIES; i++) {
            uint256 snap = vm.snapshotState();
            vm.prevrandao(uint256(keccak256(abi.encode(wanted, i))));
            vm.roll(block.number + 1);
            vm.prank(client);
            m.challenge(dealId);
            (bool open, uint32 index,,,) = m.challengeStateOf(dealId);
            if (open && index == wanted) return;
            vm.revertToState(snap);
        }
        revert("could not force the wanted index");
    }

    /// @dev The selector must vary with block/prevrandao: 40 samples on a 4-leaf deal must show at
    ///      least three distinct indices, and never an index outside the committed leaf count.
    function test_selectorVariesAcrossBlocksAndPrevrandao() public {
        uint32 dealId = _createDeal();
        uint256 seenMask;

        for (uint256 i; i < 40; i++) {
            vm.prevrandao(uint256(keccak256(abi.encode("m4", i))));
            uint32 index = _openChallenge(dealId);
            assertLt(index, LEAF_COUNT, "index is inside the leaf count");
            seenMask |= uint256(1) << index;
            _answerAt(dealId, index);
        }

        uint256 distinct;
        for (uint256 b; b < LEAF_COUNT; b++) {
            if (seenMask & (uint256(1) << b) != 0) distinct++;
        }
        assertGe(distinct, 3, "at least three distinct indices over 40 samples");
    }

    /// @dev Every leaf position 0..3 must accept its own block and proof.
    function test_everyLeafIndexAcceptsItsOwnAnswer() public {
        uint32 dealId = _createDeal();
        for (uint32 wanted; wanted < LEAF_COUNT; wanted++) {
            _forceChallenge(dealId, wanted);
            (bool open, uint32 index,,,) = m.challengeStateOf(dealId);
            assertTrue(open, "challenge open");
            assertEq(index, wanted, "forced the wanted index");

            _answerAt(dealId, index);
            (bool openAfter,,,,) = m.challengeStateOf(dealId);
            assertFalse(openAfter, "a correct answer at this index passes");
        }
    }

    /// @dev The last leaf is 100 bytes: only exactly 100 bytes is accepted.
    function test_lastLeafAcceptsOnlyTheExactByteLength() public {
        uint32 dealId = _createDeal();
        uint32 last = LEAF_COUNT - 1;
        _forceChallenge(dealId, last);

        uint256 len = tree.leafLength(SIZE, BLOCK_SIZE, last);
        assertEq(len, 100, "fixture's last leaf is 100 bytes");
        bytes memory exact = tree.leaf(SIZE, BLOCK_SIZE, last);
        bytes32[] memory proof = tree.path(SIZE, BLOCK_SIZE, last);

        // 1024 bytes: the last block padded out to the full block size.
        bytes memory padded = new bytes(BLOCK_SIZE);
        for (uint256 i; i < exact.length; i++) {
            padded[i] = exact[i];
        }
        vm.prank(provider);
        vm.expectRevert(IMakhzan.ProofRejected.selector);
        m.answer(dealId, padded, proof);

        // 99 bytes: one byte short.
        bytes memory short = new bytes(len - 1);
        for (uint256 i; i < short.length; i++) {
            short[i] = exact[i];
        }
        vm.prank(provider);
        vm.expectRevert(IMakhzan.ProofRejected.selector);
        m.answer(dealId, short, proof);

        // The rejected attempts left the round open and the exact block still passes.
        (bool openAfterRejects,,,,) = m.challengeStateOf(dealId);
        assertTrue(openAfterRejects, "rejections keep the round open");
        vm.prank(provider);
        m.answer(dealId, exact, proof);
        (bool openAfterPass,,,,) = m.challengeStateOf(dealId);
        assertFalse(openAfterPass, "the exact block passes");
    }

    /// @dev A one-leaf deal has an empty proof path and still accepts a served block.
    function test_singleLeafDealAcceptsEmptyPath() public {
        uint32 singleSize = 100;
        bytes32 singleRoot = tree.root(singleSize, BLOCK_SIZE);
        vm.prank(client);
        m.createDeal{value: _wei(PRICE)}(1, singleRoot, 1, singleSize, DURATION, PRICE);
        uint32 dealId = 1; // the first deal created in this test

        vm.prank(client);
        m.challenge(dealId);
        (bool open, uint32 index, uint32 start, uint32 deadline, uint32 pathLen) = m.challengeStateOf(dealId);
        assertTrue(open, "single-leaf challenge open");
        assertEq(index, 0, "only one index exists");
        assertEq(pathLen, 0, "expected path length is zero");
        assertEq(deadline, start + WINDOW, "deadline");

        bytes memory data = tree.leaf(singleSize, BLOCK_SIZE, 0);
        bytes32[] memory path = tree.path(singleSize, BLOCK_SIZE, 0);
        assertEq(path.length, 0, "empty proof path");
        vm.prank(provider);
        m.answer(dealId, data, path);
        (bool openAfter,,,,) = m.challengeStateOf(dealId);
        assertFalse(openAfter, "single-leaf answer passes");
    }
}
