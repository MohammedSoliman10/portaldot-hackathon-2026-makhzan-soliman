# Decisions

Short, dated records of decisions that change how the Tier-0 gates measure the live chain. These are
not product decisions; they exist so a later reader can see why a gate was measured the way it was.

## DR-001 — G03 samples latest state only (2026-10-20)

**Context.** During T029A a 2,000-block lookback failed with
`UnknownBlock: State already discarded ... (4003)`. A 120-block scan worked, so the public RPC keeps
only a recent state window. G03 originally implied reading randomness once per block and comparing
with transaction-emitted values; a later replay of historical `eth_call` samples would not be
reproducible.

**Decision.** The G03 sampler waits for each new block, then calls the probe at `latest` immediately.
It records the block number, block hash and UTC timestamp with every sample. It never addresses a
historical block number. Transaction-emitted values remain the authoritative comparison.

**Consequences.** Samples are captured live and cannot be regenerated after the pruning window. The
raw file must be written as sampling runs, not reconstructed later. If the sampler falls behind, it
records the missed blocks instead of backfilling them.

**Evidence.** `evidence/raw/g01/00-t029a-bytecode.md`, `evidence/raw/g10/` probe coverage.

## DR-002 — EVM/`solc` first, `resolc`/PolkaVM fallback (2026-10-20)

**Context.** The chain reports `allowEVMBytecode=true`, so both EVM bytecode and PolkaVM blobs are
accepted in principle. Standard Foundry 1.8.5 (`forge 1.8.5`) has no `--resolc` option; the
ParityTech Foundry-Polkadot fork adds it but is not installed in this environment.

**Decision.** G01/G02 attempt the EVM/`solc` path first. On failure they can attempt the same contract
source through the `resolc` 1.4.0 CLI, which produces a PVM blob. Both paths use the shared
`deployProbe` helper in `apps/gates/src/lib/deploy.ts`, so the call/verification code is identical.
The G02 size ladder remains an EVM-runtime measurement until a PVM-specific size probe is proven;
if G02 has to run on PVM, that limitation is recorded rather than papered over.

**Pins.** `resolc` 1.4.0 (`sha256 74e051ce27300c77e82e323f5c47acf2c452819b6a8d0eb21bf5b9111e7a686d`),
solc `0.8.28` for both paths.

**Evidence.** `evidence/raw/g01/05-resolc.txt`, `evidence/raw/g01/CounterProbe.pvm`.


## DR-006 — Amounts are stored in native units, not wei (2026-10-21, Tier 1)

**Context.** `msg.value` and EVM balances use 18 decimals, but G07 metadata reports
`nativeToEthRatio = 10000` and pallet-revive splits an incoming value into native units plus sub-unit
dust. Storing `uint64` wei would cap a single amount at about 18.4 tPOT.

**Decision.** Every stored amount is a count of native units (planck, 14 decimals). One constant
`WEI_PER_UNIT = 10_000` converts wei to units and is marked `[assumption]` until G07's measured
implied factor confirms it. Incoming value must be an exact multiple or `BadParams`; payouts are
`units × WEI_PER_UNIT`. `uint64` units cap at about 184,467 tPOT. Slash is
`floor(bondUnits × 20 / 100)`; accrual is computed in `uint256` and stored in `uint64` units with
floor rounding. T063 asserts the G07 factor equals the constant and stops if it does not.

**Consequences.** No dust is ever created or moved. A value that is not a whole number of planck is
rejected rather than rounded. The CLI parses decimal tPOT strings with integer math only and rejects
non-multiples. The earlier “184,467 tPOT” wording referred to units, not wei; it is corrected.

**Evidence.** `specs/002-core-storage-proofs/spec.md` FR-046, `data-model.md`, `contracts/imakhzan.md`.

## DR-007 — `resolve` and `settle` are permissionless (2026-10-21, Tier 1)

**Context.** Owner-only `resolve` and `settle` let an absent owner leave a failed challenge
unresolved and lock the provider's bond forever.

**Decision.** Any account may call `resolve` after the deadline and `settle` after the end block with
no open challenge. Recipients are fixed by the deal: slash to the deal owner, accrued payment to the
provider, remainder to the deal owner. `challenge` stays owner-only and `claim` stays provider-only.

**Consequences.** Liveness improves without adding authority, because the caller cannot redirect
value. Tests compare a stranger's settle/resolve recipients and amounts with the owner's.

**Evidence.** `spec.md` FR-020/FR-026/FR-027, `contracts/state-machine.md`, `contracts/imakhzan.md`.

## DR-008 — Checks-effects-interactions without a reentrancy slot (2026-10-21, Tier 1)

**Context.** Four exit paths transfer native value. A reentrancy guard would spend a storage slot and
the contract is size-constrained.

**Decision.** `withdrawBond`, `claim`, `settle` and `resolve` finish every state write before any
value transfer. Transfers use a low-level call and revert on failure; there is no guard slot. A
test-only malicious receiver re-enters all four paths. Tier 1 assumes EOA recipients; a contract
recipient that rejects value can block its own payout and, through `resolve`, the counterparty's
exit. Pull payments are a Tier 2 item.

**Consequences.** No double payout through a reentrant recipient. The known limitation is documented
in the explainer plan rather than hidden.

**Evidence.** `spec.md` FR-028, `tasks.md` T031/T034/T059, `contracts/state-machine.md`.

## DR-009 — Config slots are part of the deploy budget (2026-10-21, Tier 1)

**Context.** Deployment writes two fixed config slots in addition to code and the contract deposit.
The earlier demo total omitted them.

**Decision.** The budget table and demo total include the two config slots at ≈ 7.8 tPOT (estimate
pending G05). Every Solidity commit records `forge build --sizes` runtime bytes in its evidence
file; a runtime above 10,240 B stops the work and is reported rather than trimmed silently.

**Evidence.** `plan.md` budget table, `contracts/size-budget.md`.

**Amended 2026-10-21 by DR-010.** Removing the unused admin address and pause flag lets the whole
config pack into one 30/32-byte slot, so the deploy now writes **one** config slot (≈ 3.9 tPOT at the
planning rate) instead of two.

## DR-010 — No admin and no pause flag (2026-10-21, Tier 1)

**Context.** The skeleton carried an `admin` address and a one-byte `paused` flag, with a
`paused == 0` guard on `createDeal`. A search of `spec.md`, `plan.md` and `contracts/*.md` found no
requirement for a pause or admin function: `data-model.md` described `admin` as "may pause (future)"
and no FR, guarantee or acceptance outcome depends on either field.

**Decision.** Remove `admin`, `paused`, the `createDeal` pause check and the test-only setter. Tier 1
has no privileged address: `challenge` is owner-checked, `answer`/`claim` are provider-checked, and
`resolve`/`settle` are permissionless with recipients fixed by the deal. A pause would be a new FR and
a new authority surface, not scaffolding. Measured effect: `Makhzan` runtime 5,542 → 5,523 B and
config slot 0 uses 8/32 bytes instead of 29/32.

**Consequences.** The pause cases in `Deals.t.sol` and `Guards.t.sol` and the `setPaused` harness
setter are deleted; the constructor loses its `admin_` parameter and zero-address check. A future
emergency stop needs an explicit admin FR, a layout change and its own tests.

## DR-011 — DECIDED (B): position binding vs identical adjacent blocks (2026-10-21, Tier 1)

**Finding.** FR-041(8) and `contracts/merkle.md` state that a proof for index `i` never verifies for
`j != i`. With `leafHash = keccak256(0x00 || data)` the leaf does not commit to its index. When blocks
`i` and `i+1` are byte-identical, `nodeHash(L, L)` is symmetric, so the two proofs are
interchangeable: a 4-leaf tree of repeated 1024-byte blocks verifies a proof for index 0 at index 1.
This is reproduced deterministically by
`contracts/test/makhzan/MerklePositionBinding.t.sol::test_identicalAdjacentBlocksShareAProof` (RED) and
was first found by the T009a fuzz campaign (leafCount 45, index 16 verified at 17).

**Why it matters.** No funds are at risk: answering a challenge with byte-identical data still proves
possession of the challenged bytes. But the invariant as written is false, so it cannot be reported as
enforced, and Tier 2's position-sensitive claims would inherit the hole.

**Options (not decided; owner's call).**
- **A — bind the index into the leaf:** `leafHash = keccak256(0x00 || index || data)`. Makes
  FR-041(8) literally true. Cost: regenerate the golden vectors and fixture, update
  `packages/merkle-vectors/generate.ts`, `apps/makhzan/src/merkle.ts`, both test tree builders and
  `contracts/merkle.md`; the contract grows by a few bytes. The challenge and payment logic does not
  change shape.
- **B — narrow the claim:** amend FR-041(8) and `merkle.md` to say position binding holds for blocks
  with distinct content, and document that identical adjacent blocks are interchangeable (no code
  change, no vector churn, but a MUST becomes a caveat).

**Decision (owner, 2026-10-21): B — narrow the claim.** The leaf hash stays
`keccak256(0x00 || data)`; no vector, fixture or TypeScript change. Reason: identical blocks are
interchangeable by design — same bytes, same proof — a provider saves nothing by that, and binding the
index would add churn and bytes for no storage guarantee. Consequences: FR-017 and FR-041(8), this
record, `spec.md`, `plan.md`, `data-model.md` and `contracts/merkle.md` state the exception;
`MerklePositionBinding.t.sol` keeps the reproduction as a documented-limit test and proves distinct
blocks never share a proof; the Merkle fuzz property uses pairwise-distinct leaf contents so it stays
meaningful. The invariant can no longer be reported as an unconditional MUST, and the checkpoint says
so.

## DR-012 — DECIDED: `via_ir = true` for the size budget (2026-10-21, Tier 1)

**Context.** After the batch-4 fund-safety fixes `Makhzan` compiled to 9,210 runtime bytes, about
741 tPOT on the owner's planning formula (`0.079 tPOT/byte + 13`). `docs/lean-build.md` measured the
candidate cuts on scratch copies: `via_ir` alone was 6,378 B (−2,832 B, no source change), while
dropping `peek` saved 373 B, dropping events 673 B, and optimizer runs 200/10,000 made it larger.
The owner now holds about 1,500 tPOT across two wallets.

**Decision (owner, 2026-10-21): enable `via_ir = true` and nothing else.** `peek` and the events
stay. `solc 0.8.28`, `evm_version = paris`, `optimizer_runs = 1`, `bytecode_hash = none` and
`cbor_metadata = false` are unchanged. CI has no separate optimizer flags; it inherits
`contracts/foundry.toml`, so the workflow needs no edit.

**Measured result (local, cold build).** Runtime 9,210 → **6,378 B**; creation 9,773 → **6,966 B**;
planning estimate ≈ 517 tPOT. Wall time for a cold `forge build --sizes` 36 s. `forge fmt --check`
clean; 21 suites / 144 tests; 8 fuzz functions × 1000 runs; 6 invariants × 256 sequences × 50 calls
(12,800 calls) zero violations; golden vectors match on both copies; 39 TypeScript tests and the
typecheck pass. No behaviour changed.

**Consequences.** G02 must confirm the live chain accepts the IR bytecode before any live deployment;
the compiler pin and `evm_version` remain provisional until then. Further cuts (`peek`, events) are a
separate decision and are not taken here. A future change that pushes runtime back over 10,240 B
stops the work, per the standing rule.
