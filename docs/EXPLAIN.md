# Tier 1 explained — bonded, challenged storage

**Feature**: `002-core-storage-proofs`. Plain English; no marketing claims. Every statement here is
backed by `evidence/tier1-results.md` (local) or by the live run in `evidence/raw/t1/`
(`59-live-deploy.txt` to `77-verify-deal2.txt`, summarised in `72-live-summary.txt`).

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

## The consumer gate, and what `minBond` buys

`StorageGate` (`contracts/src/makhzan/StorageGate.sol`) is the smallest honest consumer of Makhzan: no
admin, no upgrade path, one payment per deal.

1. `lock(dealId, payee, minBond)` — the payer deposits the payment and names who may take it. The lock
   opens only while `MakhzanGuard.requireHealthy` passes (no open challenge, still inside the term).
2. `release(dealId)` — only the named payee, once, and only while the guard still says healthy. When
   `minBond != 0` it also reads the payee's provider record and refuses with `BondTooLow` if the bond
   is below that floor.
3. `refund(dealId)` — only the payer, and only when `healthOf == 3` (defaulted) or at/after the deal's
   end block. Otherwise `RefundNotAllowed`.

The whole flow is measured locally in `evidence/raw/t1/101-gate-demo-local.txt`: lock with a
900,000,000,000,000-unit floor, release while healthy, challenge, let it expire, resolve (the 20%
slash), then a second deal whose release is refused `BondTooLow`, whose in-term refund is refused
`RefundNotAllowed`, and which is refunded at its end block. The gate's balance ends at zero. The gate
deploys through the same tooling, dry run and pending record as Makhzan
(`evidence/raw/t1/100-gate-deploy.txt`) at 2,528 B runtime against a 2,600 B budget
(`evidence/raw/t1/102-size-check-gate.txt`).

`minBond` is a floor, not a proof, and these are its limits:

- **The bond is read in the same transaction as the payment.** `release` reads `healthOf` and
  `providerOf(payee)` while it runs. A slash that lands afterwards — even later in the same block —
  does not undo a release that already succeeded. The gate is not atomic with Makhzan's state.
- **`minBond = 0` sees nothing after a slash.** Zero disables the check by design, so the gate pays
  whenever the deal reads healthy. After `resolve`, `healthOf` is back to `1` and the default that just
  happened is invisible to it: only a non-zero floor catches a bond that the slash pushed down.
- **The payee must be the provider.** The bond is read with `providerOf(payee)` and counts only when
  that record's provider id matches the deal's `providerId`. Lock to any other address and the bond
  reads as `0`: with a floor above zero every release is refused `BondTooLow`, and with a floor of zero
  that payee is simply paid. The gate cannot check a provider it is not told about.

## What it costs

- **Gas**: local Foundry numbers — challenge ≈ 207k, answer ≈ 983k before the deadline (≈ 2.57M at
  the end block), resolve with a slash ≈ 323k, settle ≈ 219k–307k. These stay the per-call
  reference because Portaldot's `gasUsed` is reported in its own native scale and, on the
  storage-writing transactions, carries the storage deposit inside it. The live run recorded the
  fee actually paid instead: `createDeal` 11.557016609978156 tPOT on top of its 5 tPOT value,
  `resolve` with a slash 0.015316960078034360 tPOT (`evidence/raw/t1/60-live-pass.txt`,
  `69-live-resolve-b.txt`, `72-live-summary.txt`).
- **The bond**: 10,000,000,000,000,000 units in the local run; 20% (2,000,000,000,000,000 units) is
  at risk per failed round. One bond covers all the provider's deals.
- **The price**: 1,000,000,000,000,000 units in the local run, escrowed at creation and paid at
  settle.
- **Units to wei**: `WEI_PER_UNIT = 10,000`, confirmed on the live chain (G07 closed, see
  `docs/decisions.md`), so 1 unit is 10,000 wei and 1 tPOT is 10^14 units. The local run prices its
  deal at 10 POT and its bond at 100 POT on that basis.
- **Size**: the deployed contract is 6,566 bytes against a 10,240-byte budget (with `via_ir`),
  matching the on-chain `code` length read back at deploy (`evidence/raw/t1/59-live-deploy.txt`). The
  owner's planning formula put the deployment at roughly 517 tPOT, an estimate, not a measurement.

## What was not built

The live run exists (contract `0x60481DFcFCA34A8F095939D9675eC715127B2e44` on chain `420420777`,
registered, challenged, answered, slashed, claimed, settled, verified; `evidence/raw/t1/59-live-deploy.txt`
to `77-verify-deal2.txt`, summarised in `72-live-summary.txt`), and live block time is a measured
6 s (`evidence/raw/g02/11-block-time.txt`). What is still missing:

- No finality rule beyond the one-confirmation heuristic.
- No live evidence-bundle CLI run `[pending live run]`; the bundle schema and its validator exist
  and are tested locally.
- No randomness beacon beyond the D5 fallback (blocked on G03).
- No agent client, indexed history or pull-payment escrow contract (Tier 2+). The read-only status app
  *is* built and live (feature 003, <https://status-ui-one.vercel.app/>): it reads the deployment and
  falls back to the recorded run, but it is a viewer, not a client that signs or pays.
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
