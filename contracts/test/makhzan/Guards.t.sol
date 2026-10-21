// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "../../src/makhzan/IMakhzan.sol";
import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {MaliciousReceiver} from "./harness/MaliciousReceiver.sol";

/// @notice T031 — exit guards, pause, error coverage and malicious-receiver reentrancy (FR-003, FR-004, FR-028).
contract GuardsTest is MakhzanTestBase {
    MaliciousReceiver internal mal;

    function setUp() public override {
        super.setUp();
        mal = new MaliciousReceiver(IMakhzan(address(m)));
        vm.deal(address(mal), 1_000 ether);
    }

    function test_withdrawBondBlockedWhileDealOpenAndAllowedAfterSettle() public {
        uint32 dealId = _createDeal();
        uint64 bond = _bond();
        vm.prank(provider);
        vm.expectRevert(IMakhzan.HasOpenDeal.selector);
        m.withdrawBond();

        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        m.settle(dealId);

        uint256 before = provider.balance;
        vm.prank(provider);
        m.withdrawBond();
        assertEq(provider.balance, before + _wei(bond), "full bond paid after settlement");
        (uint16 id, uint64 bondAfter,, bool registered) = m.providerOf(provider);
        assertEq(id, 0, "registration cleared");
        assertEq(bondAfter, 0, "bond cleared");
        assertFalse(registered, "no longer registered");
    }

    function test_belowMinimumBondProviderRefusedNewDealButExistingDealSurvives() public {
        uint32 first = _createDeal();
        _openChallenge(first);
        (,,, uint32 deadline,) = m.challengeStateOf(first);
        vm.roll(deadline + 1);
        vm.prank(stranger);
        m.resolve(first);

        assertTrue(_bond() < MIN_BOND, "slash dropped the bond below the minimum");
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: _wei(PRICE)}(1, root, LEAF_COUNT, SIZE, DURATION, PRICE);

        DealView memory d = _deal(first);
        assertEq(d.flags & 1, 0, "existing deal is not settled");
        assertEq(_activeDeals(), 1, "existing deal still counts");
        assertLe(block.number, d.endBlock, "still inside the deal duration");
        _openChallenge(first);
        (bool open,,,,) = m.challengeStateOf(first);
        assertTrue(open, "existing deal still accepts challenges");
    }

    function test_pausedProtocolRejectsNewDeal() public {
        m.setPaused(1);
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: _wei(PRICE)}(1, root, LEAF_COUNT, SIZE, DURATION, PRICE);
    }

    function test_registryErrorsAreReachable() public {
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.NotRegistered.selector);
        m.addBond{value: _wei(MIN_BOND)}();

        vm.prank(provider);
        vm.expectRevert(IMakhzan.AlreadyRegistered.selector);
        m.registerProvider{value: _wei(MIN_BOND)}();

        vm.prank(stranger);
        vm.expectRevert(IMakhzan.BondTooSmall.selector);
        m.registerProvider{value: _wei(MIN_BOND - 1)}();

        uint32 dealId = _createDeal();
        vm.prank(provider);
        vm.expectRevert(IMakhzan.HasOpenDeal.selector);
        m.withdrawBond();

        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        m.settle(dealId);
    }

    function test_dealErrorsAreReachable() public {
        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: _wei(PRICE)}(1, bytes32(0), LEAF_COUNT, SIZE, DURATION, PRICE);

        vm.prank(client);
        vm.expectRevert(IMakhzan.BadParams.selector);
        m.createDeal{value: _wei(PRICE) + 1}(1, root, LEAF_COUNT, SIZE, DURATION, PRICE);

        uint32 dealId = _createDeal();
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(client);
        vm.expectRevert(IMakhzan.DealExpired.selector);
        m.challenge(dealId);
    }

    function test_challengeErrorsAreReachable() public {
        vm.prank(client);
        vm.expectRevert(IMakhzan.NoDeal.selector);
        m.challenge(999);

        uint32 dealId = _createDeal();
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.NotOwner.selector);
        m.challenge(dealId);

        uint32 index = _openChallenge(dealId);
        vm.prank(client);
        vm.expectRevert(IMakhzan.ChallengeOpen.selector);
        m.challenge(dealId);

        bytes memory wrongData = tree.leaf(SIZE, BLOCK_SIZE, (index + 1) % LEAF_COUNT);
        bytes32[] memory proof = tree.path(SIZE, BLOCK_SIZE, index);
        vm.prank(provider);
        vm.expectRevert(IMakhzan.ProofRejected.selector);
        m.answer(dealId, wrongData, proof);

        vm.prank(stranger);
        vm.expectRevert(IMakhzan.NotProvider.selector);
        m.answer(dealId, tree.leaf(SIZE, BLOCK_SIZE, index), proof);

        (,,, uint32 deadline,) = m.challengeStateOf(dealId);
        vm.roll(deadline + 1);
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.WindowOpen.selector);
        m.resolve(dealId);
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

    function test_paymentErrorsAreReachable() public {
        uint32 dealId = _createDeal();
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.NotProvider.selector);
        m.claim(dealId);

        vm.prank(provider);
        vm.expectRevert(IMakhzan.ZeroClaim.selector);
        m.claim(dealId);

        vm.prank(stranger);
        vm.expectRevert(IMakhzan.BeforeEnd.selector);
        m.settle(dealId);

        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        m.settle(dealId);
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.AlreadySettled.selector);
        m.settle(dealId);

        vm.prank(provider);
        vm.expectRevert(IMakhzan.NoDeal.selector);
        m.claim(999);
    }

    // ------------------------------------------------------------------ malicious receiver

    /// @dev The provider/owner is a contract that calls claim again from receive.
    function test_reentrantClaimCannotDoublePay() public {
        _maliciousDeal();
        vm.roll(block.number + DURATION / 2);
        (uint64 accrued,) = m.accruedOf(1);
        mal.configure(1, 1, false);

        uint256 before = address(mal).balance;
        mal.claim(1);
        assertEq(address(mal).balance - before, _wei(accrued), "exactly one payout");
        assertEq(_deal(1).claimed, accrued, "claimed updated once");
    }

    /// @dev The provider/owner re-enters settle from receive; the settled flag blocks it.
    function test_reentrantSettleCannotDoublePay() public {
        _maliciousDeal();
        vm.roll(_dealEnd(1) + 1);
        mal.configure(1, 2, false);

        uint256 before = address(mal).balance;
        mal.settle(1);
        assertEq(address(mal).balance - before, _wei(PRICE), "exactly the escrow was paid");
        assertEq(_dealFlags(1) & 1, 1, "settled once");
    }

    /// @dev The deal owner re-enters resolve from the slash transfer; NoChallenge blocks it.
    function test_reentrantResolveCannotDoublePay() public {
        _maliciousDeal();
        uint64 bondBefore = _maliciousBond();
        mal.challenge(1);
        (,,, uint32 deadline,) = m.challengeStateOf(1);
        vm.roll(deadline + 1);
        uint64 slash = uint64(uint256(bondBefore) * SLASH_BPS / 10_000);
        mal.configure(1, 3, false);

        uint256 before = address(mal).balance;
        mal.resolve(1);
        assertEq(address(mal).balance - before, _wei(slash), "exactly one slash paid");
        assertEq(_maliciousBond(), bondBefore - slash, "bond slashed once");
    }

    /// @dev A provider contract re-enters withdrawBond from its own refund.
    function test_reentrantWithdrawBondCannotDoublePay() public {
        uint64 bond = MIN_BOND;
        mal.registerProvider{value: _wei(MIN_BOND)}();
        mal.configure(0, 4, false);

        uint256 before = address(mal).balance;
        mal.withdrawBond();
        assertEq(address(mal).balance - before, _wei(bond), "one refund only");
        (uint16 id, uint64 bondAfter,, bool registered) = m.providerOf(address(mal));
        assertEq(id, 0, "registration cleared");
        assertEq(bondAfter, 0, "bond cleared");
        assertFalse(registered, "not registered");
    }

    function test_failedTransferRevertsTheWholeCall() public {
        mal.registerProvider{value: _wei(MIN_BOND)}();
        mal.configure(0, 0, true);
        vm.expectRevert(IMakhzan.TransferFailed.selector);
        mal.withdrawBond();
        (uint16 id, uint64 bond,,) = m.providerOf(address(mal));
        assertEq(id, 1, "registration survives the reverted withdrawal");
        assertEq(bond, MIN_BOND, "bond survives the reverted withdrawal");
    }

    function _maliciousDeal() internal {
        mal.registerProvider{value: _wei(MIN_BOND)}();
        mal.createDeal{value: _wei(PRICE)}(1, root, LEAF_COUNT, SIZE, DURATION, PRICE);
    }

    function _maliciousBond() internal view returns (uint64 bond) {
        (, bond,,) = m.providerOf(address(mal));
    }
}
