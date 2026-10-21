// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IMakhzan} from "../../../src/makhzan/IMakhzan.sol";
import {MerkleLib} from "../../../src/makhzan/lib/MerkleLib.sol";
import {MakhzanHarness} from "../harness/MakhzanHarness.sol";
import {TreeHarness} from "../harness/TreeHarness.sol";
import {MakhzanHandler} from "./MakhzanHandler.sol";

/// @notice T034 — the five invariants of FR-041 over the whole value surface.
/// @dev Invariant (1) compares in wei, per DR-006. The coverage invariant is the red gate: it fails
///      while no sequence can reach the challenge, answer, resolve or settle paths.
contract MakhzanInvariantTest is StdInvariant, Test {
    uint256 internal constant WPU = 10_000;
    uint64 internal constant MIN_BOND = 1e15;
    uint16 internal constant BLOCK_SIZE = 1024;
    uint32 internal constant SIZE = 3172;
    uint32 internal constant MIN_DURATION = 600;
    uint32 internal constant MAX_DURATION = 14_400;
    uint32 internal constant WINDOW = 50;
    uint16 internal constant SLASH_BPS = 2000;

    MakhzanHarness internal m;
    TreeHarness internal tree;
    MakhzanHandler internal handler;

    address internal actorA = address(0xA11CE);
    address internal actorB = address(0xB0B);
    address internal actorC = address(0xC11E17);

    function setUp() public {
        m = new MakhzanHarness(WINDOW, BLOCK_SIZE, SLASH_BPS, MIN_BOND, MIN_DURATION, MAX_DURATION);
        tree = new TreeHarness();
        bytes32 root = tree.root(SIZE, BLOCK_SIZE);
        handler = new MakhzanHandler(IMakhzan(address(m)), tree, root, SIZE, BLOCK_SIZE, [actorA, actorB, actorC]);
        targetSelector(FuzzSelector({addr: address(handler), selectors: handler.actionSelectors()}));
        // The harnesses expose test-only setters; fuzzing them would violate invariants by fiat.
        excludeContract(address(m));
        excludeContract(address(tree));
        excludeContract(address(this));
    }

    struct Deal {
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

    function _deal(uint32 dealId) internal view returns (Deal memory d) {
        (bool ok, bytes memory ret) = address(m).staticcall(abi.encodeWithSelector(IMakhzan.dealOf.selector, dealId));
        require(ok, "dealOf failed");
        d = abi.decode(ret, (Deal));
    }

    /// @notice Sum of every bond and every unclaimed deposit, in wei.
    function _liabilities() internal view returns (uint256 total) {
        address[] memory providers = handler.knownProviderSet();
        for (uint256 i; i < providers.length; i++) {
            (, uint64 bond,,) = m.providerOf(providers[i]);
            total += uint256(bond) * WPU;
        }
        uint32[] memory dealIds = handler.knownDealIds();
        for (uint256 i; i < dealIds.length; i++) {
            Deal memory d = _deal(dealIds[i]);
            if (d.flags & 1 == 1) continue; // settled: the deposit has left escrow
            total += uint256(d.price - d.claimed) * WPU;
        }
    }

    /// @notice (1) The balance covers every bond, every escrowed deposit and every unclaimed payout.
    function invariant_balanceCoversLiabilities() public view {
        assertGe(address(m).balance, _liabilities(), "balance >= bonds + escrow + unclaimed payouts");
    }

    /// @notice M1: no value is trapped or created — the balance is exactly the accounted-for wei.
    function invariant_noTrappedValue() public view {
        assertEq(address(m).balance, _liabilities(), "balance == bonds + unclaimed deposits exactly");
    }

    /// @notice (2) A slash never exceeds the bond it is taken from.
    function invariant_slashNeverExceedsBond() public view {
        uint256 count = handler.resolveRecordCount();
        for (uint256 i; i < count; i++) {
            (, uint64 bondBefore, uint64 bondAfter) = handler.resolveRecordAt(i);
            assertLe(bondAfter, bondBefore, "a slash never grows the bond");
            uint64 slash = bondBefore - bondAfter;
            assertLe(slash, bondBefore, "slash <= bond");
            assertTrue(slash == 0 || slash == uint64(uint256(bondBefore) * SLASH_BPS / 10_000), "slash is 0 or 20%");
        }
    }

    /// @notice (3) A challenge resolves at most once.
    function invariant_challengeResolvesAtMostOnce() public view {
        assertEq(handler.doubleResolves(), 0, "no challenge resolves twice");
    }

    /// @notice (4) Accrued never exceeds the deposit, and claimed never exceeds accrued.
    function invariant_accrualCapsAtPrice() public view {
        uint32[] memory dealIds = handler.knownDealIds();
        for (uint256 i; i < dealIds.length; i++) {
            uint32 dealId = dealIds[i];
            Deal memory d = _deal(dealId);
            (uint64 accrued,) = m.accruedOf(dealId);
            assertLe(accrued, d.price, "accrued <= price");
            assertLe(d.claimed, accrued, "claimed <= accrued");
        }
    }

    /// @notice (8) A proof accepted for position i never verifies for any other position.
    /// @dev The tree fixture's four leaves are pairwise distinct (byte 0 of each block is seeded from
    ///      its index), so this asserts binding rather than the FR-017 exception. A byte-identical
    ///      leaf is skipped explicitly, which is the only exception that can exist in a 4-leaf tree.
    function invariant_proofIsPositionBound() public view {
        if (!handler.hasAnswer()) return;
        (uint32 dealId, uint32 index, bytes memory data, bytes32[] memory path) = handler.lastProof();
        Deal memory d = _deal(dealId);
        assertTrue(MerkleLib.verify(d.root, data, index, d.leafCount, path), "the accepted proof verifies at i");
        for (uint32 j; j < d.leafCount; j++) {
            if (j == index) continue;
            if (keccak256(tree.leaf(d.size, BLOCK_SIZE, j)) == keccak256(data)) continue; // documented limit
            assertFalse(MerkleLib.verify(d.root, data, j, d.leafCount, path), "the proof must fail at j != i");
        }
    }

    /// @notice The handler really routes a payout to the malicious recipient, which re-enters.
    /// @dev Deterministic script: the receiver registers (actor index 3), owns a deal, the deal is
    ///      settled past its end block, and the payout triggers its mode-5 receive.
    function test_handlerUsesTheMaliciousRecipient() public {
        handler.register(3, MIN_BOND);
        assertGt(handler.registers(), 0, "receiver registered");
        handler.createDeal(3, 0, 10, MIN_DURATION);
        assertGt(handler.creations(), 0, "receiver owns a deal");
        handler.warp(1200); // bound() wraps, so pass the cap to advance past the 600-block deal
        handler.settleDeal(0, 1);
        assertGt(handler.settles(), 0, "the deal settled");
        assertGt(handler.maliciousAttempts(), 0, "the recipient re-entered from a payout");
    }

    /// @notice The handler's tree has pairwise-distinct leaves, so invariant (8) is meaningful.
    function test_fixtureLeavesArePairwiseDistinct() public view {
        uint32 count = tree.leafCount(SIZE, BLOCK_SIZE);
        for (uint32 i; i < count; i++) {
            for (uint32 j = i + 1; j < count; j++) {
                assertTrue(
                    keccak256(tree.leaf(SIZE, BLOCK_SIZE, i)) != keccak256(tree.leaf(SIZE, BLOCK_SIZE, j)),
                    "fixture leaves must be pairwise distinct"
                );
            }
        }
    }

    /// @notice M2: every handler action must actually reach the protocol, not just compile.
    /// @dev Fixed seeds, no fuzz: register, top up, create, pass a round, fail a round, claim at the
    ///      end block, settle, then withdraw. `claim` runs before `settle` because settlement pays the
    ///      remaining accrual and would leave nothing claimable. Foundry re-checks invariants after
    ///      every call, so the coverage gate lives here as a plain test instead of an invariant.
    function test_handlerReachesEveryValuePath() public {
        handler.register(0, MIN_BOND);
        handler.addBond(0, 1e14);
        handler.createDeal(1, 0, 1e12, MIN_DURATION);

        handler.challengeDeal(0, 1);
        handler.answerDeal(0);
        handler.challengeDeal(0, 1);

        handler.warp(60); // past the 50-block deadline of the second round
        handler.resolveDeal(0, 2);

        handler.warp(1200);
        handler.warp(1200); // past endBlock = start + 600

        handler.claimDeal(0, 1);
        handler.settleDeal(0, 2);
        handler.withdrawBond(0);

        assertGt(handler.registers(), 0, "register was never reached");
        assertGt(handler.bonds(), 0, "addBond was never reached");
        assertGt(handler.creations(), 0, "createDeal was never reached");
        assertGt(handler.challenges(), 1, "two challenge rounds were never reached");
        assertGt(handler.answers(), 0, "answer was never reached");
        assertGt(handler.resolves(), 0, "resolve was never reached");
        assertGt(handler.claims(), 0, "claim was never reached");
        assertGt(handler.settles(), 0, "settle was never reached");
        assertGt(handler.withdrawals(), 0, "withdrawBond was never reached");
        assertEq(handler.rejected(), 0, "every driven call succeeded");
    }
}
