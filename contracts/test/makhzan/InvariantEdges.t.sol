// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanHarness} from "./harness/MakhzanHarness.sol";
import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";

/// @notice T036 — the boundaries the fuzz is unlikely to hit: minimum and maximum bond, the exact end
///         block, settlement in the block a challenge fails, and conservation across two deals.
contract InvariantEdgesTest is MakhzanTestBase {
    /// @dev A short deal: 1-block minimum duration and a 5-block challenge window.
    MakhzanHarness internal fast;

    function setUp() public override {
        super.setUp();
        fast = new MakhzanHarness(5, BLOCK_SIZE, SLASH_BPS, MIN_BOND, 1, 2);
        vm.prank(provider);
        fast.registerProvider{value: uint256(MIN_BOND) * WPU}();
    }

    /// @dev A slash on a bond of exactly minBond still leaves 80% and cannot underflow.
    function test_slashAtMinimumBondLeavesEightyPercent() public {
        uint64 bondBefore = _bond();
        assertEq(bondBefore, MIN_BOND, "fixture bond is exactly the minimum");
        uint32 dealId = _createDeal();
        _openChallenge(dealId);
        (,,, uint32 deadline,) = m.challengeStateOf(dealId);
        uint256 ownerBefore = client.balance;

        vm.roll(deadline + 1);
        vm.prank(stranger);
        m.resolve(dealId);

        uint64 slash = uint64(uint256(MIN_BOND) * SLASH_BPS / 10_000);
        assertEq(_bond(), MIN_BOND - slash, "bond keeps 80%");
        assertEq(client.balance, ownerBefore + _wei(slash), "owner got exactly the slash");
    }

    /// @dev A bond at the uint64 cap slashes in uint256 and stays representable.
    function test_slashAtUint64BondCapDoesNotOverflow() public {
        address whale = address(0xCA9);
        uint64 cap = type(uint64).max;
        vm.deal(whale, uint256(cap) * WPU + 1 ether);
        vm.prank(whale);
        m.registerProvider{value: uint256(cap) * WPU}();
        (, uint64 bondBefore,,) = m.providerOf(whale);
        assertEq(bondBefore, cap, "bond is the uint64 cap");

        vm.prank(client);
        uint32 dealId = 1;
        m.createDeal{value: _wei(PRICE)}(2, root, LEAF_COUNT, SIZE, DURATION, PRICE);
        _openChallenge(dealId);
        (,,, uint32 deadline,) = m.challengeStateOf(dealId);
        uint256 ownerBefore = client.balance;

        vm.roll(deadline + 1);
        vm.prank(stranger);
        m.resolve(dealId);

        uint64 slash = uint64(uint256(cap) * SLASH_BPS / 10_000);
        (, uint64 bondAfter,,) = m.providerOf(whale);
        assertEq(bondAfter, cap - slash, "cap minus a fifth is still a valid uint64");
        assertEq(client.balance, ownerBefore + _wei(slash), "owner got the capped slash");
    }

    /// @dev At the exact end block the whole price is accrued and claimable, and settle pays nothing more.
    function test_claimAtExactEndBlockPaysTheWholePrice() public {
        uint32 dealId = _createDeal();
        uint32 end = _dealEnd(dealId);
        vm.roll(end);

        (uint64 accrued, uint64 claimable) = m.accruedOf(dealId);
        assertEq(accrued, PRICE, "the whole price accrues at the end block");
        assertEq(claimable, PRICE, "all of it is claimable");

        uint256 providerBefore = provider.balance;
        vm.prank(provider);
        m.claim(dealId);
        assertEq(provider.balance, providerBefore + _wei(PRICE), "claim pays the whole price");
        assertEq(_deal(dealId).claimed, PRICE, "claimed equals the price");

        vm.prank(stranger);
        m.settle(dealId);
        assertEq(_dealFlags(dealId) & 1, 1, "settles at the same block");
        assertEq(_activeDeals(), 0, "deal closed");
    }

    /// @dev A challenge that fails after the end block is resolved and settled in one block.
    function test_settleInTheSameBlockAChallengeFails() public {
        vm.prank(client);
        fast.createDeal{value: _wei(PRICE)}(1, root, LEAF_COUNT, SIZE, 1, PRICE);
        uint32 dealId = 1;
        vm.prank(client);
        fast.challenge(dealId);
        (,,, uint32 deadline,) = fast.challengeStateOf(dealId);

        // The deal ends at block start + 1, so the round fails only after the end block.
        vm.roll(deadline + 1);
        uint256 ownerBefore = client.balance;
        vm.prank(stranger);
        fast.resolve(dealId);

        uint64 slash = uint64(uint256(MIN_BOND) * SLASH_BPS / 10_000);
        assertEq(client.balance, ownerBefore + _wei(slash), "the failed round paid the slash");
        (,, uint24 activeDealsBefore,) = fast.providerOf(provider);
        assertEq(activeDealsBefore, 1, "the deal is still open after the slash");

        uint256 providerBefore = provider.balance;
        vm.prank(stranger);
        fast.settle(dealId);

        assertEq(provider.balance, providerBefore + _wei(PRICE), "settled in the same block as the slash");
        (,, uint24 activeDealsAfter,) = fast.providerOf(provider);
        assertEq(activeDealsAfter, 0, "the deal closed in that block");
    }

    /// @dev One provider, two deals: every wei that leaves the contract is accounted for.
    function test_twoDealsOneProviderConserveValue() public {
        uint32 first = _createDeal();
        vm.prank(client);
        m.createDeal{value: _wei(PRICE)}(1, root, LEAF_COUNT, SIZE, DURATION, PRICE);
        uint32 second = 2;

        uint64 bondBefore = _bond();
        uint256 contractBefore = address(m).balance;

        // First deal passes its round, second deal's round fails.
        _answerAt(first, _openChallenge(first));
        _openChallenge(second);
        (,,, uint32 deadline,) = m.challengeStateOf(second);
        vm.roll(deadline + 1);
        vm.prank(stranger);
        m.resolve(second);

        uint64 slash = uint64(uint256(bondBefore) * SLASH_BPS / 10_000);
        vm.roll(_dealEnd(first) + 1);
        vm.prank(stranger);
        m.settle(first);
        vm.prank(stranger);
        m.settle(second);

        uint256 paidOut = contractBefore - address(m).balance;
        assertEq(paidOut, _wei(PRICE) * 2 + _wei(slash), "payouts equal escrow plus the slash");
        assertEq(bondBefore - _bond(), slash, "bond fell by exactly the slash");
    }
}
