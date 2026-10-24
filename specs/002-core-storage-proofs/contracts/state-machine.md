# State Machine: Deals, Challenges and Payments

**Feature**: `002-core-storage-proofs` | **Model**: [../data-model.md](../data-model.md)

## Deal

```text
          createDeal
(none) ───────────────> Active ──────────── endBlock reached ───────────> Expired
                          │                                                  │
                          │ challenge / answer / resolve (repeat)            │ settle (owner,
                          │                                                  │ no open challenge)
                          └──────────────────────────────────────────────────┴──> Settled
```

| Transition | Guard | Effect |
| --- | --- | --- |
| none → Active | provider registered, bond ≥ minBond, `msg.value == price`, ids and sizes valid, duration in range (no pause: see DR-010) | deal written; provider's `activeDeals += 1` |
| Active → Active (challenge round) | owner only; `block.number ≤ endBlock`; no open challenge | index and start written; open flag set |
| Active → Active (pass) | provider only; before deadline; bytes and path verify | open flag cleared; nothing else changes |
| Active → Active (fail) | permissionless; after deadline; challenge open | 20% of bond to the deal owner (not the caller); open flag cleared; deal continues |
| Active/Expired → Settled | permissionless; `block.number > endBlock`; no open challenge; not settled | unpaid accrued to provider; remainder to the deal owner (not the caller); settled flag set; `activeDeals -= 1` |

`Active` means "not yet settled". A challenge may only be opened **on or before** `endBlock`; an
already-open challenge stays resolvable after `endBlock`.

## Challenge

```text
(none) ── challenge ──> Open ── answer(valid) ──> Passed   (terminal for the round)
                         │
                         └─── resolve(after deadline) ──> Failed (terminal for the round)
```

| Transition | Guard | Effect |
| --- | --- | --- |
| none → Open | deal exists, caller is owner, deal not settled, `block.number ≤ endBlock`, no open challenge | `challengeIndex`, `challengeStart` written; open flag set |
| Open → Passed | caller is the deal's provider, `block.number ≤ deadline`, byte length expected, path length expected, `verify` true | open flag cleared; bond unchanged |
| Open → Open (bad answer) | any of the verification guards fail | the whole call reverts (`ProofRejected`); nothing changes; retry allowed until the deadline |
| Open → Failed | `block.number > deadline`, challenge still open | slash = `min(bond × 20%, bond)` to owner; open flag cleared |
| Passed/Failed → anything | — | reverts: `NoChallenge` |

There is no path that pays twice for one round, and no path that accepts an answer after the deadline.

## Payments

| Action | Guard | Effect |
| --- | --- | --- |
| `claim` | provider only; deal exists; not settled; `accrued − claimed > 0` | `claimed = accrued`; pays the provider `(accrued − claimed) × WEI_PER_UNIT` |
| `settle` | anyone; `block.number > endBlock`; no open challenge; not settled | pays provider `(accrued − claimed) × WEI_PER_UNIT`; pays deal owner `(price − accrued) × WEI_PER_UNIT`; settled flag; `activeDeals -= 1` |

`accrued = price × min(block.number, endBlock) − startBlock ÷ (endBlock − startBlock)`, integer floor,
computed in `uint256`. Because the cap is the end block, `accrued ≤ price` always; because `claimed` is
only ever set to an accrued value, `claimed ≤ accrued` always.

## Conservation proof sketch (what the invariant suite checks)

- Every incoming value is one of: bond (`registerProvider`, `addBond`) or escrow (`createDeal`,
  exactly `price`).
- Every outgoing value is one of: bond refund (`withdrawBond`), slash to owner (`resolve`), claim or
  settlement payment to the provider, remainder to the owner.
- Slash is clamped to the bond; claim/settlement never exceed `accrued ≤ price`; the remainder is
  `price − accrued ≥ 0`.
- Therefore `balance ≥ Σ bonds + Σ (price − claimed)` at every step, which is invariant 1.

## Ordering rule (why nothing re-enters)

Every value transfer happens **after** the state change that authorises it, and every transfer that
fails reverts the whole call. `withdrawBond`, `claim`, `settle` and `resolve` clear or update the
authorising state first; no reentrancy-guard slot is needed. A rejecting contract recipient can
block its own payout and, through `resolve`, the counterparty's exit; Tier 1 assumes EOAs and pull
payments are a Tier 2 item. The open-challenge flag is cleared before the slash transfer, so a
re-entrant `resolve` would fail the `NoChallenge` guard. The settled flag is set before settlement
pays out for the same reason.
