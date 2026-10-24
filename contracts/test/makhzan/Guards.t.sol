// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "../../src/makhzan/IMakhzan.sol";
import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";
import {MaliciousReceiver} from "./harness/MaliciousReceiver.sol";

/// @notice T031 — exit guards, error coverage and malicious-receiver reentrancy (FR-003, FR-004, FR-028).
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

        bytes memory correctData = tree.leaf(SIZE, BLOCK_SIZE, index);
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.NotProvider.selector);
        m.answer(dealId, correctData, proof);

        // Still inside the response window: resolving now must revert WindowOpen.
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
        (uint16 idBefore, uint64 bondBefore,,) = m.providerOf(address(mal));
        mal.configure(0, 0, true);
        vm.expectRevert(IMakhzan.TransferFailed.selector);
        mal.withdrawBond();
        (uint16 id, uint64 bond,,) = m.providerOf(address(mal));
        assertEq(id, idBefore, "registration survives the reverted withdrawal");
        assertEq(bond, bondBefore, "bond survives the reverted withdrawal");
        assertEq(bond, MIN_BOND, "bond is still the full minimum");
    }

    /// @dev M6: the owner/provider re-enters claim, settle, resolve and withdrawBond together
    ///      (mode 5) from every payout. Each authorised path must pay exactly once: the receiver ends
    ///      with exactly the wei it paid in, and the contract keeps only the unrelated provider's bond.
    function test_combinedModeFiveReentryPaysEachPathOnce() public {
        _maliciousDeal();
        uint64 bondStart = _maliciousBond();
        uint64 slash = uint64(uint256(bondStart) * SLASH_BPS / 10_000);
        mal.configure(1, 5, false);

        // Claim: the reentrant claim has nothing new, settle is before the end, resolve has no
        // challenge and withdrawBond sees an open deal.
        vm.roll(block.number + DURATION / 2);
        (uint64 accrued,) = m.accruedOf(1);
        uint256 before = address(mal).balance;
        mal.claim(1);
        assertEq(address(mal).balance - before, _wei(accrued), "claim paid exactly once");
        assertEq(_deal(1).claimed, accrued, "claimed updated once");
        assertEq(mal.attempts(), 4, "all four reentrant calls were attempted");

        // Resolve: the slash plus the accrual that grew since the claim; settle and withdrawals stay
        // blocked, and the reentrant resolve hits NoChallenge.
        mal.challenge(1);
        (,,, uint32 deadline,) = m.challengeStateOf(1);
        vm.roll(deadline + 1);
        (uint64 accruedAtResolve,) = m.accruedOf(1);
        uint64 claimedBeforeResolve = _deal(1).claimed;
        before = address(mal).balance;
        mal.resolve(1);
        assertEq(
            address(mal).balance - before,
            _wei(slash) + _wei(accruedAtResolve - claimedBeforeResolve),
            "resolve paid one slash plus the new accrual"
        );
        assertEq(_maliciousBond(), bondStart - slash, "bond slashed exactly once");
        // The reentrant claim succeeded and paid, so its own receive attempted four more calls:
        // the counter is a lower bound here, while the balance delta above is exact.
        assertGe(mal.attempts(), 8, "mode 5 attempted four calls again");

        // Settle: the escrow remainder plus the bond refund, both authorised, each once. The
        // reentrant settle and claim fail; the reentrant withdrawBond is the authorised refund.
        vm.roll(_dealEnd(1) + 1);
        uint64 claimedBeforeSettle = _deal(1).claimed;
        before = address(mal).balance;
        mal.settle(1);

        assertEq(
            address(mal).balance - before,
            _wei(PRICE - claimedBeforeSettle) + _wei(bondStart - slash),
            "settle paid the remainder plus one bond refund"
        );
        assertGe(mal.attempts(), 12, "mode 5 attempted four calls on the settlement transfer");
        assertEq(_dealFlags(1) & 1, 1, "settled once");
        (uint16 id, uint64 bondAfter,, bool registered) = m.providerOf(address(mal));
        assertEq(id, 0, "reentrant withdrawBond cleared the registration");
        assertEq(bondAfter, 0, "bond cleared");
        assertFalse(registered, "not registered");

        // Nothing was paid twice: the test funded the bond and the deposit, so the receiver ends with
        // its starting balance plus exactly the price (all accrual) and the bond (slash + refund).
        // Any double payout would exceed this; any missed path would fall short.
        assertEq(address(mal).balance, 1_000 ether + _wei(PRICE) + _wei(MIN_BOND), "each path paid once");
        assertEq(address(m).balance, _wei(MIN_BOND), "only the fixture provider's bond remains");
    }

    function _maliciousDeal() internal {
        mal.registerProvider{value: _wei(MIN_BOND)}();
        (uint16 malId,,,) = m.providerOf(address(mal));
        mal.createDeal{value: _wei(PRICE)}(malId, root, LEAF_COUNT, SIZE, DURATION, PRICE);
    }

    function _maliciousBond() internal view returns (uint64 bond) {
        (, bond,,) = m.providerOf(address(mal));
    }
}
