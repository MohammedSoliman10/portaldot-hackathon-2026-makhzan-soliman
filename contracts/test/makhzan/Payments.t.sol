// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMakhzan} from "../../src/makhzan/IMakhzan.sol";
import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";

/// @notice T029 — linear accrual, claim and permissionless settlement (FR-024–FR-028, FR-046).
contract PaymentsTest is MakhzanTestBase {
    function test_accrualIsZeroAtStartBlock() public {
        uint32 dealId = _createDeal();
        (uint64 accrued, uint64 claimable) = m.accruedOf(dealId);
        assertEq(accrued, 0, "no accrual at the start block");
        assertEq(claimable, 0, "nothing claimable at the start block");
    }

    function test_accrualAtMidpointIsFlooredLinearShare() public {
        uint32 dealId = _createDeal();
        uint32 start = _deal(dealId).startBlock;
        vm.roll(start + DURATION / 2);
        (uint64 accrued, uint64 claimable) = m.accruedOf(dealId);
        uint64 expected = uint64(uint256(PRICE) * (DURATION / 2) / DURATION);
        assertEq(accrued, expected, "floor(price * elapsed / duration)");
        assertEq(claimable, expected, "all accrual is claimable");
    }

    function test_accrualCapsAtPriceAfterEndBlock() public {
        uint32 dealId = _createDeal();
        vm.roll(_dealEnd(dealId) + 100);
        (uint64 accrued, uint64 claimable) = m.accruedOf(dealId);
        assertEq(accrued, PRICE, "accrual capped at the deposit");
        assertEq(claimable, PRICE, "claimable capped at the deposit");
    }

    function test_claimByStrangerRevertsNotProvider() public {
        uint32 dealId = _createDeal();
        vm.roll(_deal(dealId).startBlock + 1);
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.NotProvider.selector);
        m.claim(dealId);
    }

    function test_claimWithNoAccrualRevertsZeroClaim() public {
        uint32 dealId = _createDeal();
        vm.prank(provider);
        vm.expectRevert(IMakhzan.ZeroClaim.selector);
        m.claim(dealId);
    }

    function test_claimOnUnknownDealRevertsNoDeal() public {
        vm.prank(provider);
        vm.expectRevert(IMakhzan.NoDeal.selector);
        m.claim(999);
    }

    function test_midDealClaimPaysAccruedAndUpdatesClaimed() public {
        uint32 dealId = _createDeal();
        uint32 start = _deal(dealId).startBlock;
        vm.roll(start + DURATION / 2);
        (uint64 accruedBefore,) = m.accruedOf(dealId);
        uint256 providerBefore = provider.balance;

        vm.prank(provider);
        m.claim(dealId);

        assertEq(provider.balance, providerBefore + _wei(accruedBefore), "paid (accrued - claimed) in wei");
        assertEq(_deal(dealId).claimed, accruedBefore, "claimed updated");
        (uint64 accruedAfter, uint64 claimableAfter) = m.accruedOf(dealId);
        assertEq(accruedAfter, accruedBefore, "accrual continues");
        assertEq(claimableAfter, 0, "nothing left to claim immediately");
    }

    function test_secondImmediateClaimRevertsZeroClaim() public {
        uint32 dealId = _createDeal();
        vm.roll(_deal(dealId).startBlock + DURATION / 2);
        vm.prank(provider);
        m.claim(dealId);
        vm.prank(provider);
        vm.expectRevert(IMakhzan.ZeroClaim.selector);
        m.claim(dealId);
    }

    function test_settleBeforeEndRevertsBeforeEnd() public {
        uint32 dealId = _createDeal();
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.BeforeEnd.selector);
        m.settle(dealId);
    }

    function test_settleWithOpenChallengeRevertsChallengeOpen() public {
        uint32 dealId = _createDeal();
        _openChallenge(dealId);
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.ChallengeOpen.selector);
        m.settle(dealId);
    }

    function test_settleMarksDealSettledAndDropsActiveDealCount() public {
        uint32 dealId = _createDeal();
        assertEq(_activeDeals(), 1, "one open deal");
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        m.settle(dealId);

        assertEq(_dealFlags(dealId) & 1, 1, "settled flag");
        assertEq(_activeDeals(), 0, "open deal count fell");
    }

    function test_secondSettleRevertsAlreadySettled() public {
        uint32 dealId = _createDeal();
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        m.settle(dealId);
        vm.prank(stranger);
        vm.expectRevert(IMakhzan.AlreadySettled.selector);
        m.settle(dealId);
    }

    function test_settlePaysProviderUnpaidAccrued() public {
        uint32 dealId = _createDeal();
        uint32 start = _deal(dealId).startBlock;
        vm.roll(start + DURATION / 2);
        vm.prank(provider);
        m.claim(dealId);

        vm.roll(_dealEnd(dealId) + 1);
        uint64 claimedBefore = _deal(dealId).claimed;
        uint256 providerBefore = provider.balance;
        uint256 ownerBefore = client.balance;
        vm.prank(stranger);
        m.settle(dealId);

        uint64 claimedNow = _deal(dealId).claimed;
        assertEq(provider.balance, providerBefore + _wei(PRICE - claimedBefore), "unpaid accrued to provider");
        assertEq(client.balance, ownerBefore, "no remainder after full accrual");
        assertEq(claimedNow, PRICE, "claimed becomes the total paid at settlement");
    }

    /// @dev C1 (fund-safety review): settlement marks the whole price as paid before it transfers.
    function test_settleSetsClaimedToPriceBeforePaying() public {
        uint32 dealId = _createDeal();
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        m.settle(dealId);

        assertEq(_deal(dealId).claimed, PRICE, "claimed is the total paid after settlement");
        (uint64 accrued, uint64 claimable) = m.accruedOf(dealId);
        assertEq(accrued, PRICE, "accrual is capped at the price");
        assertEq(claimable, 0, "nothing is claimable after settlement");
    }

    /// @dev C1: the settled flag still wins over the (now zero) claimable amount.
    function test_claimAfterSettleRevertsAlreadySettled() public {
        uint32 dealId = _createDeal();
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(stranger);
        m.settle(dealId);

        vm.prank(provider);
        vm.expectRevert(IMakhzan.AlreadySettled.selector);
        m.claim(dealId);
    }

    /// @dev A stranger's settle must move exactly the same value as the owner's settle.
    function test_strangerSettleMatchesOwnerSettle() public {
        uint32 first = _createDeal();
        vm.prank(client);
        m.createDeal{value: _wei(PRICE)}(1, root, LEAF_COUNT, SIZE, DURATION, PRICE);
        uint32 second = 2;

        vm.roll(_dealEnd(first) + 1);
        uint256 providerBefore = provider.balance;
        uint256 ownerBefore = client.balance;
        uint256 callerBefore = stranger.balance;

        vm.prank(client);
        m.settle(first);
        uint256 providerAfterOwnerSettle = provider.balance;
        uint256 ownerAfterOwnerSettle = client.balance;

        vm.prank(stranger);
        m.settle(second);

        assertEq(
            provider.balance - providerAfterOwnerSettle,
            providerAfterOwnerSettle - providerBefore,
            "stranger settle pays the provider the same amount"
        );
        assertEq(client.balance, ownerAfterOwnerSettle, "stranger settle does not pay the owner differently");
        assertEq(stranger.balance, callerBefore, "caller gets nothing");
        assertEq(_activeDeals(), 0, "both deals closed");
        assertTrue(ownerBefore == ownerAfterOwnerSettle, "no remainder at the end block");
    }

    function test_cumulativeClaimsNeverExceedPrice() public {
        uint32 dealId = _createDeal();
        uint32 start = _deal(dealId).startBlock;
        vm.roll(start + 100);
        vm.prank(provider);
        m.claim(dealId);
        vm.roll(start + 300);
        vm.prank(provider);
        m.claim(dealId);
        vm.roll(_dealEnd(dealId) + 1);
        vm.prank(provider);
        m.claim(dealId);

        uint64 claimed = _deal(dealId).claimed;
        assertEq(claimed, PRICE, "all accrual claimed exactly once");
        assertTrue(claimed <= PRICE, "claimed <= price");
        (uint64 accrued,) = m.accruedOf(dealId);
        assertTrue(claimed <= accrued, "claimed <= accrued");
    }
}
