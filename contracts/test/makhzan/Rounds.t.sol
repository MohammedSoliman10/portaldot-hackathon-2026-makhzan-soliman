// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MakhzanTestBase} from "./harness/MakhzanTestBase.sol";

/// @notice T033 — US2 independent test: one passed round, one slashed round, then settlement.
contract RoundsTest is MakhzanTestBase {
    function test_onePassedAndOneFailedRoundOnTheSameDealThenSettle() public {
        uint32 dealId = _createDeal();
        uint64 bondStart = _bond();
        uint24 dealsStart = _activeDeals();

        // Round 1: the provider answers correctly; bond unchanged, deal still active.
        uint32 index = _openChallenge(dealId);
        _answerAt(dealId, index);
        (bool openAfterPass,,,,) = m.challengeStateOf(dealId);
        assertFalse(openAfterPass, "passed round closed");
        assertEq(_bond(), bondStart, "a pass keeps the bond");
        assertEq(_dealFlags(dealId) & 1, 0, "deal not settled by a pass");
        assertEq(_activeDeals(), dealsStart, "deal count unchanged by a pass");

        // Round 2: same deal, no answer; the failure slashes 20% to the owner and the deal survives.
        _openChallenge(dealId);
        (bool openBeforeSlash,,,,) = m.challengeStateOf(dealId);
        assertTrue(openBeforeSlash, "second round opened on the same deal");
        (,,, uint32 deadline,) = m.challengeStateOf(dealId);
        uint64 slash = uint64(uint256(bondStart) * SLASH_BPS / 10_000);
        uint256 ownerBeforeSlash = client.balance;

        vm.roll(deadline + 1);
        vm.prank(stranger);
        m.resolve(dealId);

        (bool stillOpen,,,,) = m.challengeStateOf(dealId);
        assertFalse(stillOpen, "resolved round closed");
        assertEq(_bond(), bondStart - slash, "bond fell by exactly 20%");
        assertEq(client.balance, ownerBeforeSlash + _wei(slash), "owner credited the slash");
        assertEq(_dealFlags(dealId) & 1, 0, "deal survives the failed round");
        assertEq(_activeDeals(), dealsStart, "deal count unchanged by a slash");

        // Settlement: the deal ends normally after the failed round; the provider keeps its price.
        vm.roll(_dealEnd(dealId) + 1);
        uint256 providerBeforeSettle = provider.balance;
        uint256 ownerBeforeSettle = client.balance;
        vm.prank(stranger);
        m.settle(dealId);

        assertEq(provider.balance, providerBeforeSettle + _wei(PRICE), "provider paid the full price");
        assertEq(client.balance, ownerBeforeSettle, "owner got no remainder after full accrual");
        assertEq(_dealFlags(dealId) & 1, 1, "settled flag bit0");
        assertEq(_activeDeals(), 0, "no active deals left");
        assertEq(_bond(), bondStart - slash, "settlement leaves the bond alone");
    }
}
