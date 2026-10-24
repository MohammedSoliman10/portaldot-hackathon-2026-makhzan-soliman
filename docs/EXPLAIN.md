# Tier 1 explained — bonded, challenged storage

**Feature**: `002-core-storage-proofs`. Plain English; no marketing claims. Every statement here is
backed by `evidence/tier1-results.md` (local) or marked `[pending live run]`.

## What a deal is

A **deal** is one file, one provider, one price paid up front.

1. The client splits the file into 1,024-byte blocks and builds a Merkle tree over them. The root is
   32 bytes that commit to every block and to their order.
2. The client registers a provider (the provider posts a bond) and creates a deal: root, size, leaf
   count, price, duration. The price is escrowed in the contract.
3. During the deal, the deal owner can open a **challenge**: the contract picks a block index and a
   deadline, and records how long a valid path must be.
4. The provider must answer before the deadline with that one block and its Merkle path. The contract
   verifies the path against the committed root. A good answer closes the challenge and the bond does
   not move. A missing or bad answer is **slashed** when the challenge is resolved after the window:
   20% of the provider's bond goes to the deal owner, gas-free to the owner.
5. After the deal ends, the provider takes the price with `settle` (or `claim` for whatever accrued).
   `claimed` is set so a second payment cannot happen.

## What the user trusts

The proofs remove trust in the provider's *honesty*, not in the machinery around it. A user trusts:

- **The chain** to order transactions and produce the block data the contract reads.
- **The challenge index source** — the D5 fallback (parent hash, `prevrandao`, deal id) — to be hard
  to bias. It is a fallback, not a proven randomness beacon; G03 may replace it.
- **The keeper/resolver** to call `resolve` after the deadline. Anyone may do it and the owner is
  credited whether or not the caller is the owner, so it is permissionless — but if nobody resolves,
  the slash is not applied until someone does. There is no automatic timer on-chain.
- **The client's own upload path**: the daemon stores blocks on disk and serves the challenge from
  that store. The contract never sees the disk.
- **Externally owned accounts for payouts.** A contract that rejects value can block its own payout,
  and through `resolve` the counterparty's exit. Pull payments with a separate escrow are Tier 2.

## What a pass proves, and what it does not

A pass proves that, at the time of the answer, the provider could produce **one** specific block of
the file together with a valid path to the committed root. It proves the file existed and was
retrievable then, for that block.

It does **not** prove:

- that the provider stores the file *continuously*, or on local disk — it proves one block inside a
  response window, and nothing observes the disk between challenges;
- that the provider holds a *distinct* copy of every block: identical blocks (and identical subtrees)
  are interchangeable by design, because the leaf commits the bytes, not the position (FR-017,
  DR-011);
- that the whole file is available: one block is not the whole file, and a provider could keep the
  blocks it expects to be challenged and lose the rest;
- that the challenge index was unpredictable, while the D5 fallback stands;
- that a bond is locked per deal: one bond backs every deal the provider holds, so the bond is the
  economic bound, not a per-deal deposit.

These limits are the honest core of the product. The economics work because a provider that cannot
answer loses 20% of its bond, and the client can challenge as often as the window allows.

## What it costs

- **Gas**: local Foundry numbers — challenge ≈ 207k, answer ≈ 983k before the deadline (≈ 2.57M at
  the end block), resolve with a slash ≈ 323k, settle ≈ 219k–307k. These are local gas, not a live
  fee estimate `[pending live run]`.
- **The bond**: 10,000,000,000,000,000 units in the local run; 20% (2,000,000,000,000,000 units) is
  at risk per failed round. One bond covers all the provider's deals.
- **The price**: 1,000,000,000,000,000 units in the local run, escrowed at creation and paid at
  settle.
- **Units to wei**: the local run uses `WEI_PER_UNIT = 10,000` wei `[assumption]`. At 1 POT =
  10^18 wei that prices the local deal at 10 POT and the bond at 100 POT. G05/G07 must confirm the
  live fee schedule and the unit before any live number is quoted.
- **Size**: the deployed contract is 6,378 bytes against a 10,240-byte budget (with `via_ir`). The
  owner's planning formula put the deployment at roughly 517 tPOT, an estimate, not a measurement.

## What was not built

- No live deployment, no live round, no live fee or block-time measurement. All `[pending live run]`.
- No randomness beacon beyond the D5 fallback (blocked on G03).
- No front-end, agent client, indexed history or pull-payment escrow contract (Tier 2+).
- No continuous-storage proof, no per-deal bond, no proof that the provider holds a distinct copy of
  every block.
- No PolkaVM deployment: the resolc probe is a Tier 0 compiler test, not a deployed Makhzan.

## The daemon's job

The provider daemon is the only moving part that can lie to itself: it sends an answer and gets a
transaction hash. A hash is not evidence. The daemon therefore records `submitted`, then re-reads
`challengeStateOf` and the provider bond; only a closed challenge with an unchanged bond becomes
`passed`, and only an observed slash becomes `failed`. A failed send stays `pending` and is retried on
the next poll while the block is before the deadline, up to three attempts, then `unanswered`. One
deal's failure never stops the others. That is why the local evidence can say "the round passed"
without trusting the daemon's own log line.
