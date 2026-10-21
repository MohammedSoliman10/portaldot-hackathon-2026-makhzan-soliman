# Data Model: Core Storage Proofs

**Feature**: `002-core-storage-proofs` | **Date**: 2026-10-21 | **Plan**: [plan.md](./plan.md)

All money and all challenge state live on-chain. The only off-chain model is the daemon/CLI state
file, which is a cache and never a source of truth for a payout.

## Entities

### Config (deployment, 2 slots)

| Field | Type | Bytes | Slot | Constraint |
| --- | --- | --- | --- | --- |
| `admin` | `address` | 20 | 0 | non-zero; may pause (future) but cannot move deal funds |
| `challengeWindow` | `uint32` | 4 | 0 | blocks; default 50; > 0 |
| `challengeBlockSize` | `uint16` | 2 | 0 | 1024 default; in 1024–4096; set from G04 |
| `slashBps` | `uint16` | 2 | 0 | 2000 (20%); 1–10000 |
| `paused` | `uint8` | 1 | 0 | 0 by default; a paused protocol accepts no new deal |
| `minBond` | `uint64` | 8 | 1 | 10 tPOT = `10 * 10^14` smallest units |
| `nextDealId` | `uint32` | 4 | 1 | starts at 0; first deal id is 1 |
| `providerCount` | `uint16` | 2 | 1 | ≤ 65,535 |
| `minDurationBlocks` | `uint32` | 4 | 1 | 600 (≈ 1 h at 6 s blocks) |
| `maxDurationBlocks` | `uint32` | 4 | 1 | 14,400 (≈ 24 h) |

Two fixed slots; no per-operation storage.

### Provider (2 slots: one array element + one id mapping entry)

| Field | Type | Bytes | Notes |
| --- | --- | --- | --- |
| `addr` | `address` | 20 | the only address allowed to answer this provider's deals |
| `bond` | `uint64` | 8 | locked native units (planck); slashable; capped by `uint64` units |
| `activeDeals` | `uint24` | 3 | deals whose escrow has not been settled |
| `flags` | `uint8` | 1 | bit0 `registered` |

Placement: `providers` array at slot 3 (`providerId - 1` is the index), `providerIdOf` mapping at
slot 2 keyed by address. A provider record occupies **2 slots** (one element, one mapping entry).

**Validation**: `registerProvider` requires a non-zero `msg.value ≥ minBond`, exactly divisible by
`WEI_PER_UNIT`, no existing id, and `msg.value / WEI_PER_UNIT ≤ type(uint64).max`. `addBond` requires
a registered provider, a multiple of `WEI_PER_UNIT`, and a result that still fits `uint64` units.
`withdrawBond` requires `activeDeals == 0`, clears the element and the id entry, and transfers
`bond × WEI_PER_UNIT`.

### Deal (3 slots)

| Field | Type | Bytes | Slot within record | Constraint |
| --- | --- | --- | --- | --- |
| `owner` | `address` | 20 | A | non-zero; only challenger and settler |
| `startBlock` | `uint32` | 4 | A | block at creation |
| `endBlock` | `uint32` | 4 | A | `startBlock + durationBlocks`; ≤ `startBlock + maxDurationBlocks` |
| `providerId` | `uint16` | 2 | A | in `1..providerCount`; provider bond ≥ `minBond` at creation |
| `flags` | `uint8` | 1 | A | bit0 `settled`, bit1 `challengeOpen` |
| `root` | `bytes32` | 32 | B | non-zero; committed Merkle root |
| `leafCount` | `uint24` | 3 | C | equals `ceil(size / challengeBlockSize)`; ≥ 1 |
| `size` | `uint32` | 4 | C | > 0; `(leafCount − 1) × blockSize < size ≤ leafCount × blockSize` |
| `challengeIndex` | `uint32` | 4 | C | `< leafCount`; only meaningful while `challengeOpen` |
| `challengeStart` | `uint32` | 4 | C | block the current challenge opened; 0 when none |
| `price` | `uint64` | 8 | C | equals `msg.value / WEI_PER_UNIT` |
| `claimed` | `uint64` | 8 | C | native units; monotone; never exceeds `price` |

The record is exactly 3 slots: A packs to 31 bytes, B is one full slot, C packs to 31 bytes. The
challenge fields live inside A and C, so **an active challenge adds 0 new slots and a challenge
round never grows storage**.

`size`, `leafCount` and the deployment's `challengeBlockSize` together commit the byte size of every
leaf, including the shorter last leaf.

### Challenge (embedded; no separate record)

A challenge exists while `deal.flags` bit1 is set. Its whole state is `challengeIndex`,
`challengeStart` and the deadline `challengeStart + challengeWindow`. A challenge resolves at most
once, and resolution is the only thing that clears the bit.

### Money buckets

| Bucket | Where | Released by |
| --- | --- | --- |
| Bond | `provider.bond` | `withdrawBond` (all) or a failed challenge (20%) |
| Escrow | the contract's balance attributable to a deal's `price` | `claim` (accrued) and `settle` (remaining accrued + remainder) |

There is no separate payout ledger: payments are pushed, so "unclaimed payouts" in the conservation
invariant are zero by construction and the invariant still checks for them. The contract's balance
must be at least the sum of bonds plus the sum of `price − claimed` over unsettled deals.

## Lifecycle

```text
Deal:      Created ──> Active ──> (challenge rounds) ──> Expired ──> Settled
                        │                                            ▲
                        └──────────── open challenge ────────────────┘ (must be cleared first)

Challenge: (none) ──> Open ──> Passed   (answer accepted; bond unchanged; deal continues)
                        │
                        └────> Failed   (deadline passed with no accepted answer; 20% slash)
```

Illegal transitions that MUST revert:

1. Challenge on a settled deal, on an expired deal, or while a challenge is already open.
2. Answer before a challenge exists, after the deadline, from an address that is not the deal's
   provider, or with bytes/path that fail the verifier.
3. Resolve before the deadline, resolve of a passed challenge, or a second resolve of the same round.
4. Claim after settlement, when the claim amount is zero, or by an account that is not the deal's provider.
5. Settle before the end block, with an open challenge, or twice. Caller may be anyone.
6. Withdraw the bond while `activeDeals != 0`.

## Validation rules (reject, never coerce)

- Every incoming `msg.value` is an exact multiple of `WEI_PER_UNIT = 10_000`, otherwise `BadParams`;
  `price = msg.value / WEI_PER_UNIT` on `createDeal`; `registerProvider` and `addBond` require a
  positive value and a `uint64`-representable unit result; `price > 0`.
- `root != 0`, `leafCount >= 1`, `size > 0`, and `leafCount == ceil(size / blockSize)`.
- `durationBlocks` in `[minDurationBlocks, maxDurationBlocks]`.
- `providerId` names a registered provider whose bond is at least `minBond`.
- Answer bytes length equals the expected length for the challenged index (block size for a non-last
  leaf, the remainder for the last leaf), and is never zero.
- Path length equals the length derived from `leafCount` and `challengeIndex`.
- The daemon's upload envelope: bounded field set, exact root and size, chunk count consistent with
  `size` and `blockSize`, byte lengths within bounds, no unknown fields. A malformed envelope is
  rejected and logged.

## Invariants (spec FR-041) and the paths that can violate them

| # | Invariant | Paths that must preserve it |
| --- | --- | --- |
| 1 | Balance in wei ≥ Σ `bond × WEI_PER_UNIT` + Σ `(price − claimed) × WEI_PER_UNIT` + unclaimed payouts | `registerProvider`, `addBond`, `withdrawBond`, `createDeal`, `claim`, `settle`, `resolve` |
| 2 | Slash ≤ bond, in units | `resolve` (clamped) |
| 3 | At most one resolution per challenge | `answer` (pass) and `resolve` (fail) both clear the open flag; state is cleared before the slash transfer |
| 4 | Accrued ≤ deposit, and `claimed ≤ accrued` | `_accrued` (cap at `price`), `claim`, `settle` |
| 1e | Balance in wei == Σ `bond × WEI_PER_UNIT` + Σ `(price − claimed) × WEI_PER_UNIT` exactly (no trapped or created value) | same entry points as (1); all value enters and leaves through the contract's own calls |
| 8 | A valid proof for `i` never verifies for `j` | `MerkleLib.verify` + the on-chain index/path-length binding |

## Off-chain state (cache only)

`apps/makhzan/.state/state.json` (gitignored): known deal ids, provider ids, uploaded roots with
byte size and chunk count, last observed block, the last challenge seen per deal and its status
record references. Losing it costs re-discovery time, never money; the daemon rebuilds what it can
by polling current state and reports what it cannot.
