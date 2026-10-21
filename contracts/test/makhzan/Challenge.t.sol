// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IMakhzan} from "../../src/makhzan/IMakhzan.sol";
import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {MakhzanHarness} from "./harness/MakhzanHarness.sol";

/// @notice T025 — challenge, answer, resolve and slash (FR-010–FR-023).
contract ChallengeTest is MakhzanTestBase {
    function test_onlyDealOwnerCanChallenge() public {
        uint32 dealId = _createDeal();
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.NotOwner.selector);
        m.challenge(dealId);
    }

    function test_challengeOnUnknownDealRevertsNoDeal() public {
        vm.prank(client);
        vm.expectRevert(IMakhzan.NoDeal.selector);
        m.challenge(999);
    }

    function test_secondChallengeWhileOpenRevertsChallengeOpen() public {
        uint32 dealId = _createDeal();
        _openChallenge(dealId);
        vm.prank(client);
        vm.expectRevert(IMakhzan.ChallengeOpen.selector);
        m.challenge(dealId);
    }

    function test_challengeRecordsIndexDeadlineAndPathLength() public {
        uint32 dealId = _createDeal();
        uint32 start = uint32(block.number);
        (bool openBefore,,,,) = m.challengeStateOf(dealId);
        assertFalse(openBefore, "no challenge before the call");

        uint32 index = _openChallenge(dealId);
        (bool open, uint32 recordedIndex, uint32 recordedStart, uint32 deadline, uint32 pathLen) =
            m.challengeStateOf(dealId);
        assertTrue(open, "challenge open");
        assertEq(recordedIndex, index, "index read back");
        assertLt(index, LEAF_COUNT, "index is inside the committed leaf count");
        assertEq(recordedStart, start, "challenge start");
        assertEq(deadline, start + WINDOW, "deadline is start + window");
        assertEq(pathLen, tree.pathLength(SIZE, BLOCK_SIZE, index), "expected path length derived on-chain");
    }

    function test_challengeOpenedEventCarriesFields() public {
        uint32 dealId = _createDeal();
        vm.recordLogs();
        vm.prank(client);
        m.challenge(dealId);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "one event");
        assertEq(logs[0].topics[0], IMakhzan.ChallengeOpened.selector, "event selector");
        assertEq(logs[0].topics[1], bytes32(uint256(dealId)), "indexed deal id");
        (uint32 index, uint32 deadline) = abi.decode(logs[0].data, (uint32, uint32));
        (,,, uint32 recordedDeadline,) = m.challengeStateOf(dealId);
        assertEq(deadline, recordedDeadline, "event deadline");
        assertLt(index, LEAF_COUNT, "event index");
    }

    function test_onlyProviderCanAnswer() public {
        uint32 dealId = _createDeal();
        uint32 index = _openChallenge(dealId);
        bytes memory data = tree.leaf(SIZE, BLOCK_SIZE, index);
        bytes32[] memory proof = tree.path(SIZE, BLOCK_SIZE, index);
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.NotProvider.selector);
        m.answer(dealId, data, proof);
    }

    function test_validAnswerBeforeDeadlinePasses() public {
        uint32 dealId = _createDeal();
        uint64 bondBefore = _bond();
        uint32 index = _openChallenge(dealId);

        vm.recordLogs();
        _answerAt(dealId, index);

        (bool open,,,,) = m.challengeStateOf(dealId);
        assertFalse(open, "challenge cleared");
        assertEq(_bond(), bondBefore, "bond unchanged after a pass");
        assertEq(_dealFlags(dealId), 0, "deal still active, no flags set");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "one event");
        assertEq(logs[0].topics[0], IMakhzan.ChallengePassed.selector, "ChallengePassed");
        assertEq(logs[0].topics[1], bytes32(uint256(dealId)), "indexed deal id");
    }

    function test_invalidAnswerRevertsAndLeavesChallengeOpenForRetry() public {
        uint32 dealId = _createDeal();
        uint32 index = _openChallenge(dealId);

        uint32 wrongIndex = (index + 1) % LEAF_COUNT;
        bytes memory wrongData = tree.leaf(SIZE, BLOCK_SIZE, wrongIndex);
        bytes32[] memory proofForIndex = tree.path(SIZE, BLOCK_SIZE, index);
        vm.prank(provider);
        vm.expectRevert(IMakhzan.ProofRejected.selector);
        m.answer(dealId, wrongData, proofForIndex);

        (bool open,,,,) = m.challengeStateOf(dealId);
        assertTrue(open, "a rejected answer keeps the challenge open");

        _answerAt(dealId, index);
        (bool openAfter,,,,) = m.challengeStateOf(dealId);
        assertFalse(openAfter, "retry with the correct answer passes");
    }

    function test_answerAfterDeadlineRevertsWindowOpen() public {
        uint32 dealId = _createDeal();
        uint32 index = _openChallenge(dealId);
        (,,, uint32 deadline,) = m.challengeStateOf(dealId);
        vm.roll(deadline + 1);
        bytes memory data = tree.leaf(SIZE, BLOCK_SIZE, index);
        bytes32[] memory proof = tree.path(SIZE, BLOCK_SIZE, index);
        vm.prank(provider);
        vm.expectRevert(IMakhzan.WindowOpen.selector);
        m.answer(dealId, data, proof);
    }

    function test_answerWithoutChallengeRevertsNoChallenge() public {
        uint32 dealId = _createDeal();
        bytes memory data = tree.leaf(SIZE, BLOCK_SIZE, 0);
        bytes32[] memory proof = tree.path(SIZE, BLOCK_SIZE, 0);
        vm.prank(provider);
        vm.expectRevert(IMakhzan.NoChallenge.selector);
        m.answer(dealId, data, proof);
    }

    function test_resolveBeforeDeadlineRevertsWindowOpen() public {
        uint32 dealId = _createDeal();
        _openChallenge(dealId);
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.WindowOpen.selector);
        m.resolve(dealId);
    }

    function test_ownerResolveAfterDeadlineSlashesTwentyPercentToOwner() public {
        uint32 dealId = _createDeal();
        uint64 bondBefore = _bond();
        _openChallenge(dealId);
        (,,, uint32 deadline,) = m.challengeStateOf(dealId);

        uint64 expectedSlash = uint64(uint256(bondBefore) * SLASH_BPS / 10_000);
        uint256 ownerBefore = client.balance;
        vm.roll(deadline + 1);
        vm.recordLogs();
        vm.prank(client);
        m.resolve(dealId);

        assertEq(_bond(), bondBefore - expectedSlash, "bond fell by floor(20%)");
        assertEq(client.balance, ownerBefore + _wei(expectedSlash), "slash paid to the deal owner");
        (bool open,,,,) = m.challengeStateOf(dealId);
        assertFalse(open, "challenge cleared");
        assertEq(_dealFlags(dealId) & 1, 0, "deal not settled by a failed challenge");
        assertEq(_activeDeals(), 1, "deal survives the slash");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "one event");
        assertEq(logs[0].topics[0], IMakhzan.ChallengeFailed.selector, "ChallengeFailed");
        assertEq(abi.decode(logs[0].data, (uint64)), expectedSlash, "event slash");
    }

    /// @dev T029 addition: a stranger's resolve must pay the deal owner, never the caller.
    function test_strangerResolvePaysOwnerNotCaller() public {
        uint32 dealId = _createDeal();
        uint64 bondBefore = _bond();
        _openChallenge(dealId);
        (,,, uint32 deadline,) = m.challengeStateOf(dealId);
        uint64 expectedSlash = uint64(uint256(bondBefore) * SLASH_BPS / 10_000);
        uint256 ownerBefore = client.balance;
        uint256 callerBefore = stranger.balance;

        vm.roll(deadline + 1);
        vm.prank(stranger);
        m.resolve(dealId);

        assertEq(client.balance, ownerBefore + _wei(expectedSlash), "owner credited");
        assertEq(stranger.balance, callerBefore, "caller paid nothing");
        assertEq(_bond(), bondBefore - expectedSlash, "slash applied once");
    }

    function test_secondResolveRevertsNoChallenge() public {
        uint32 dealId = _createDeal();
        _openChallenge(dealId);
        (,,, uint32 deadline,) = m.challengeStateOf(dealId);
        vm.roll(deadline + 1);
        vm.prank(stranger);
        m.resolve(dealId);
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.NoChallenge.selector);
        m.resolve(dealId);
    }

    function test_challengeOnExpiredDealRevertsDealExpired() public {
        uint32 dealId = _createDeal();
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(client);
        vm.expectRevert(IMakhzan.DealExpired.selector);
        m.challenge(dealId);
    }

    function test_openChallengeStaysResolvableAfterEndBlock() public {
        uint32 dealId = _createDeal();
        uint64 bondBefore = _bond();
        _openChallenge(dealId);
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        m.resolve(dealId);
        assertTrue(_bond() < bondBefore, "resolve after the end block still slashes");
    }

    /// @dev C2 (fund-safety review): settlement is allowed at block == endBlock and so is a
    ///      challenge, so the challenge itself must refuse a settled deal. Otherwise the provider
    ///      could answer nothing, resolve a slash, withdraw the bond first and dodge it.
    function test_challengeOnDealSettledAtTheEndBlockReverts() public {
        uint32 dealId = _createDeal();
        vm.roll(_dealEnd(dealId)); // exactly the end block: settle is allowed here
        vm.prank(stranger);
        m.settle(dealId);
        assertEq(_dealFlags(dealId) & 1, 1, "the deal is settled");

        vm.prank(client);
        vm.expectRevert(IMakhzan.AlreadySettled.selector);
        m.challenge(dealId);
    }

    function test_challengeOnSettledDealReverts() public {
        uint32 dealId = _createDeal();
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        m.settle(dealId);
        vm.prank(client);
        vm.expectRevert(IMakhzan.DealExpired.selector);
        m.challenge(dealId);
    }

    /// @dev M5: the deal ending does not close an already-open round; the deadline does.
    function test_answerAfterEndBlockButBeforeDeadlinePasses() public {
        MakhzanHarness late = new MakhzanHarness(700, BLOCK_SIZE, SLASH_BPS, MIN_BOND, DURATION, 14_400);
        vm.prank(provider);
        late.registerProvider{value: _wei(MIN_BOND)}();
        vm.prank(client);
        late.createDeal{value: _wei(PRICE)}(1, root, LEAF_COUNT, SIZE, DURATION, PRICE);
        uint32 dealId = 1;

        vm.prank(client);
        late.challenge(dealId);
        (bool open, uint32 index,, uint32 deadline,) = late.challengeStateOf(dealId);
        assertTrue(open, "challenge open");
        assertEq(deadline, uint32(block.number) + 700, "long 700-block window");

        // The deal's end block lands 100 blocks before the deadline.
        (,, uint32 endBlock,,) = _dealFields(late, dealId);
        vm.roll(endBlock + 10);
        assertLt(block.number, deadline, "still inside the response window");

        bytes memory data = tree.leaf(SIZE, BLOCK_SIZE, index);
        bytes32[] memory proof = tree.path(SIZE, BLOCK_SIZE, index);
        vm.prank(provider);
        late.answer(dealId, data, proof);

        (bool openAfter,,,,) = late.challengeStateOf(dealId);
        assertFalse(openAfter, "an answer after the end block still passes");
    }

    /// @dev Minimal end-block read for a harness deployed inside a test.
    function _dealFields(MakhzanHarness target, uint32 dealId)
        internal
        view
        returns (address owner, uint32 startBlock, uint32 endBlock, uint16 providerId, uint8 flags)
    {
        (owner, startBlock, endBlock, providerId, flags,,,,,,,) = target.dealOf(dealId);
    }
}
