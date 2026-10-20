# Storage Layout and Slot Budget

**Feature**: `002-core-storage-proofs` | **Plan**: [../plan.md](../plan.md)

## Layout

```text
slot 0  admin(20) | challengeWindow(4) | challengeBlockSize(2) | slashBps(2) | paused(1)   = 29/32
slot 1  minBond(8) | nextDealId(4) | providerCount(2) | minDurationBlocks(4)
        | maxDurationBlocks(4)                                                        = 22/32
slot 2  mapping(address => uint16) providerIdOf
slot 3  Provider[] providers            (length at slot 3; elements at keccak256(3) + index)
slot 4  mapping(uint32 => Deal) deals
```

```text
Provider (32/32, one slot per element)
  addr(20) | bond(8) | activeDeals(3) | flags(1)

Deal (3 slots)
  slot A  owner(20) | startBlock(4) | endBlock(4) | providerId(2) | flags(1)      = 31/32
  slot B  root(32)                                                               = 32/32
  slot C  leafCount(3) | size(4) | challengeIndex(4) | challengeStart(4)
          | price(8) | claimed(8)                                                = 31/32
```

## Budget arithmetic

| Budget | Target | This layout | Check |
| --- | --- | --- | --- |
| Deployed runtime | ≤ 10,240 B | 8,926 B (scratch skeleton, nine events, every entry point) | `scripts/check-size.mjs` in CI |
| Slots per deal | ≤ 3 | 3 exactly | `StorageLayout.t.sol` reads slots A/B/C and asserts the next slot is zero |
| Slots per provider | ≤ 2 | 2 (array element + id mapping entry) | same suite, provider element + 1 asserted zero |
| Active challenge | ≤ 1 reused slot | 0 new slots; fields live in deal slots A and C | same suite, before/after a challenge |
| Growth per challenge round | 0 slots | 0 | same suite, two consecutive rounds on one deal |

## Why the ids and not addresses

Storing a `uint16 providerId` in the deal instead of the 20-byte provider address is what lets a
deal fit in three slots. The id is the provider's index in the `providers` array, so the address is
one read away and the mapping is the same value used for access control.

## Amount caps (validated, not truncated)

`uint64` amounts cap at `18,446,744,073,709,551,615` smallest units ≈ 184,467 tPOT at 14 decimals.
Registration, bond top-up, deal creation and settlement all validate that the value fits before
writing. A value that does not fit is rejected with `BadParams`, never silently wrapped.

## Slot-cost note

Every new record pays the chain's per-slot deposit, refunded when the slot is cleared. `withdrawBond`
clears the provider's element and id entry, so those two slots are refundable. Settled deals are kept
on-chain for auditability and are **not** deleted, so a deal's three slots are a permanent cost; the
budget accounts for it and the CLI reports the running total per operation.

## Change control

`contracts/size-budget.json` is the single source of the numbers. Changing the layout, the budget or
the check is one commit that updates the JSON, `StorageLayout.t.sol` and this document together.
