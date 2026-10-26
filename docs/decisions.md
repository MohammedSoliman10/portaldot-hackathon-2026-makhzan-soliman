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

## DR-003 — Storage deposits are balance, not just gas (2026-10-20)

**Context.** Other teams report `[reported]`: about 0.079 tPOT per code byte plus about 13 tPOT per
contract for deployment, about 3.9 tPOT per new slot (refunded when cleared), and that
`eth_estimateGas` includes the deposit. If true, a 24 KiB size ladder would cost roughly 1,475 tPOT
and a gas limit is not a safe proxy for affordability.

**Decision.** Treat every deposit as real balance. G02 deploys at most three small probes (~0.5, 2
and 4 KiB runtime code) and derives deposit per byte plus the fixed part; the code-size limit comes
from runtime metadata/constants, and any further size is an `eth_estimateGas` dry run only when the
owner balance covers it. No single probe may spend more than 5% of the owner balance. G05 measures the
deposit matrix and the refund recipient; G06 states its budget as tPOT = gas + deposits floated −
refunds and includes Tier 1 deployment at 8, 12 and 16 KiB runtime code.

**Consequences.** G02's live size answer may be `PARTIAL` if the three probes do not bracket the
limit; the metadata limit is then the recorded answer with that caveat. Anvil's 24,576-byte result is
never reported as the chain's limit.

**Status.** `[reported]` until our own G02/G05 measurements confirm or correct it.

## DR-004 — Chain identity in every gate record (2026-10-20)

**Context.** A team reports genesis `0xd4f9acbc…283bd`. Our records currently do not pin the chain
identity at measurement time, so a later reader cannot tell whether a gate ran against the same chain.

**Decision.** Every gate record includes our own `chain_getBlockHash(0)` and runtime spec version,
read at measurement time. The reported genesis is a cross-check only; our own read decides
`equal`, `different` or `unconfirmed`. G07 also calls the read-only `ReviveApi_account_id` for the
owner EVM address and compares it with candidate A.

**Consequences.** A genesis or spec mismatch is recorded as a contradiction and flagged, not worked
around silently. The check is read-only and costs no funds.

## DR-005 — RPC event and finality shape (2026-10-20)

**Context.** `[reported]`: `eth_getLogs` is limited, blocks take about 6 s, and the finalized head lags
the best head by 1–2 blocks.

**Decision.** Gates read events from their own transaction receipts or very recent blocks, never from
a long historical `eth_getLogs` query. Where finality matters, the gate waits for the finalized head
and records both heads. The reported numbers are re-measured, not assumed.

**Consequences.** G03's latest-state sampling (DR-001) remains correct; a receipt is authoritative
for event values. A limited `eth_getLogs` is recorded as an RPC limitation, not as a gate failure.

## DR-010 — Tier 0 live spending caps (2026-10-21)

**Context.** The reported funding stash is about 1,500 tPOT, delivered to native SS58 addresses.
The Tier 1 deploy is estimated at about 718 tPOT, and the Tier 0 probes must not consume it. Recon on
2026-10-21T07:10:22Z observed HUB2
`5HnABVM6AYZS1WR2x8mF4Z4gmUnSUp5E7rwASY5svrns7LZp` at 500 tPOT free, not the reported 1,500.

**Decision.**
- The owner keeps an **untouched 800 tPOT reserve** for the Tier 1 deploy.
- Total Tier 0 live spend, gas **and** storage deposits included, is capped at **250 tPOT**.
- No single probe deposit may exceed **60 tPOT**. The 2 KiB and 4 KiB size rungs are therefore
  `eth_estimateGas` dry runs only; they are not deployed.
- Before every live deploy, print the estimate and abort if it would break either cap.
- Record every transaction hash and the balance before and after the transaction.

**Consequences.** A probe whose estimate exceeds 60 tPOT is not sent. If the owner's spendable
balance cannot cover both the 800 tPOT reserve and the live probes, the live phase stops and reports
the shortfall rather than spending the reserve. The observed 500 tPOT HUB2 balance cannot fund both
the 800 tPOT reserve and the 75% fan-out; the fan-out plan records the conflict and does not move
funds without the owner's decision.

**Evidence.** `evidence/raw/g07/09-funding-recon.txt`, `evidence/raw/g07/10-fanout-plan.txt`.

## DR-011 — Reduced live cap until the missing tokens arrive (2026-10-21)

**Context.** Recon at 2026-10-21T07:10:22Z found HUB2
`5HnABVM6AYZS1WR2x8mF4Z4gmUnSUp5E7rwASY5svrns7LZp` holding 500 tPOT, not the reported ~1,500.
DR-010's untouched 800 tPOT reserve cannot be funded from the balance that exists, so the live phase
uses a reduced envelope until the remaining tokens arrive.

**Decision.** DR-011 supersedes DR-010 while HUB2 holds less than the reported stash:
- Total Tier 0 live spend, deposits and gas included, is capped at **100 tPOT**.
- No single deposit may exceed **60 tPOT**.
- The 2 KiB and 4 KiB probes are `eth_estimateGas` dry runs only.
- Before every live deploy, print the estimate and abort if a cap would break.
- Record every transaction hash and the balance before and after.
- The owner is funded **1 tPOT now** and, after T024 passes, **one more tranche so the owner holds
  150 tPOT in total**. HUB2 keeps the rest.

**Consequences.** The Tier 1 reserve is 150 tPOT until more tokens arrive, not 800 tPOT. The fan-out
plan is recomputed for a 500 tPOT HUB2 balance and excludes provider-1. If a live task would exceed
100 tPOT total or a 60 tPOT single deposit, it stops and reports the cost instead of spending.

**Evidence.** `evidence/raw/g07/10-fanout-plan.txt`, `evidence/raw/g07/09-funding-recon.txt`.

## DR-012 — HUB1 funding and 800 tPOT owner target (2026-10-21)

**Context.** Recon at 2026-10-21T16:30:48Z found HUB1
`5CXe6SQaDPsA9ngkmd1U63x4ktLnrkmwRJR5AneeFJdLcSQF` holding exactly 1,000 tPOT free.
HUB2 still holds 500 tPOT. The reported additional funding has not arrived. DR-012 supersedes
DR-011's owner target; the live spending caps do not change.

**Decision.**
- Total Tier 0 live spend, deposits and gas included, stays capped at **100 tPOT**.
- No single deposit may exceed **60 tPOT**; the 2 KiB and 4 KiB probes remain
  `eth_estimateGas` dry runs only.
- Before every live deploy, print the estimate and abort if a cap would break.
- Record every transaction hash and the balance before and after.
- The owner target is **800 tPOT in total**. The owner keeps an **untouched 650 tPOT reserve**
  for the Tier 1 deploy, leaving at most 150 tPOT for Tier 0 live spend inside the 100 tPOT cap.
- Provider-1 target is **60 tPOT**. HUB1 and HUB2 keep the rest.
- Fan-out: first 1 tPOT from HUB1 to the owner; after the flag and T024 pass, the remainder needed
  to bring the owner to 800 tPOT from HUB1, and 60 tPOT from HUB2 to provider-1.

**Consequences.** HUB1 is exactly at the 1,000 tPOT threshold, so no extra margin is assumed. If T024
spends gas, the second tranche is slightly above the nominal 799 tPOT so that the owner lands on
800 tPOT. If HUB1 falls below 1,000 tPOT before the fan-out, the plan stops and reports the real
balance rather than spending into the reserve.

**Evidence.** `evidence/raw/g07/11-funding-recon-2.txt`,
`evidence/raw/g07/10-fanout-plan.txt`.

## DR-013 — Close Tier 0 probes and carry the open questions into the live Makhzan run (2026-10-23)

**Context.** T026 passed and confirmed `WEI_PER_UNIT = 10_000`; the owner and provider-1 spend
proofs passed. Tier 0 has spent `70.63305145206221 tPOT` of the DR-012 `100 tPOT` cap. The G01
`CounterProbe` dry run is `37.12486675053143 tPOT`, which would take the total to
`107.75791820259364`; G02's `BehaviorProbe` alone is `76.22978090790616 tPOT`, above the
`60 tPOT` single-deposit cap, and every G01 + G02 deploy together projects to
`831.08264911946874 tPOT`. No further Tier 0 probe fits the current decision.

**Decision.**
- Tier 0 probe spending is **closed** at the current total. The `100 tPOT` cap is **not raised**,
  and no further probe is deployed.
- **G01 is closed on the T026 evidence for the `solc` EVM path.** The open `via_ir` question is no
  longer a Tier 0 gate: it becomes a **free `eth_estimateGas` dry run of the real Makhzan creation
  transaction** in the Tier 1 live runbook, recorded there.
- **G02 shrinks to the free read-only checks** in the DR-013 evidence: chain identity, block time,
  `eth_getLogs` range, pruning, the 2 KiB calldata estimate, and the reverting-call error shape. No
  probe deploy and no transaction.
- **G03, G04 and G05 are measured on the real Makhzan after its deploy**, with an
  `eth_estimateGas` dry run before every transaction. The dry-run estimate and the measured balance
  drop are recorded for each transaction.
- **G07 is closed:** factor `10000` is confirmed. Only owner and provider-1 are funded; the four
  unfunded providers are not needed for the Makhzan deploy path and remain a documented gap.

**Consequences.** `29.36694854793778 tPOT` stays unspent. There are no more Tier 0 probe
transactions. The live phase owns the Makhzan deploy budget and must stop and report if a dry run
exceeds the owner's spendable balance. G01 is a `solc` EVM-path closure, not a `via_ir` PASS.

**Evidence.** `evidence/raw/g07/14-t026.json`, `15-t026-summary.txt`,
`evidence/raw/g07/21-cap-check.txt`, `22-cap-stop.txt`, `evidence/calibration.json`.

**Status.** Active; supersedes DR-012 only for the scope of Tier 0 probes, not for the already
completed funding and spend records.
---

# Tier 1 product decisions

The branch `002-core-storage-proofs` kept its product decisions in this same file. They are reproduced
below verbatim, with their original identifiers and dates. Tier 0 and Tier 1 allocated numbers on
parallel branches, so `DR-010` to `DR-013` exist once per tier; cite them as "Tier 0 DR-010" or
"Tier 1 DR-010". No record was renumbered by this merge.

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

## DR-013 — DECIDED: one Makhzan contract, not a split (2026-10-22, Tier 1)

**Context.** Registry, deals, challenges and payments could be separate contracts, or one contract
behind `IMakhzan` as the constitution's modular rule allows.

**Decision: one contract.** The interface stays `IMakhzan`; the bond asset and identity link are
still swappable modules behind it. One address keeps the daemon's poll to one `challengeStateOf`
read, avoids cross-contract calls inside the challenge window (each one is reentrancy surface and
extra gas on the hot path), and fits the 10,240-byte runtime budget: 6,378 B measured with `via_ir`
(DR-012). A split would add linking and call overhead for no Tier-1 gain.

**Consequences.** The size budget in `contracts/size-budget.json` is the guard: a split would need a
new deployment and a new size argument. The monolith must keep the per-area tests
(`test/makhzan/*`) so a refactor into modules stays verifiable.

## DR-014 — DECIDED: the D5 fallback is the challenge index until G03 (2026-10-22, Tier 1)

**Context.** G03 (randomness) has not returned a verdict. The challenge needs an index the provider
cannot choose.

**Decision:** derive the index from parent hash, `prevrandao` and deal id (the D5 fallback). Do not
claim it is unpredictable, and do not add a beacon dependency before G03.

**Consequences.** `docs/EXPLAIN.md`, the README limits and `contracts/challenge.md` name it as a
fallback. If G03 rules in a beacon, the selector is one internal function; the vectors and the
challenge tests pin today's derivation so a change is visible. A provider that can bias block
production is out of scope for the local claim.

## DR-015 — DECIDED: budget numbers are estimates until G05 (2026-10-22, Tier 1)

**Context.** `contracts/size-budget.json` holds exact bytes (6,378 measured against 10,240), but the
tPOT cost of a deploy and the per-operation fees are estimates from the owner's planning formula
(≈ 517 tPOT for the deploy, `WEI_PER_UNIT = 10,000` wei), not live measurements.

**Decision:** label every tPOT/fee figure an estimate in `docs/`, `evidence/tier1-results.md` and the
README until G05 (fee schedule) and G07 (unit price) are measured on the live chain. Exact byte counts
may be quoted as measured.

**Consequences.** No live number may be derived from a local one. The live runbook opens with the G05
/ G07 checks, and every live evidence row carries its own timestamp. If G05 changes the unit, the
local evidence stays valid as local evidence and is not retro-edited.

## DR-016 — DECIDED: the deploy-less lens is deferred (2026-10-22, Tier 1)

**Context.** A read-only "lens" (observing chain state without deploying our contract) would let a
demo show real blocks and fees without spending funds.

**Decision: defer it.** Tier 1 verifies with a real local deployment and the local e2e. The lens adds
a second, unverified read path whose numbers could be mistaken for product evidence, and G02 (does the
live chain accept the IR bytecode) has not ruled yet.

**Consequences.** No lens code is written or claimed. If it is built later it must be labelled as an
observation tool, not a Makhzan result, and it must not be presented as a live run.

## DR-017 — DECIDED: 1,024-byte blocks as the working size, pending G04 (2026-10-22, Tier 1)

**Context.** G04 (block size / block time) has not ruled. The contract bounds the block size
(1,024–4,096 B in the deal validation), and the CLI defaults `challengeBlockSize` to 1,024.

**Decision:** ship 1,024 B as the working size for Tier 1 and the local e2e (1 MiB = 1,024 blocks,
path length 10), while keeping the on-chain bound so a deal may use up to 4,096 B. G04 decides the
live default; it is not changed by assumption.

**Consequences.** `contracts/deals.md`, the CLI default and the local evidence all say 1,024 B. If G04
rules a different size, the default and the docs change in one commit, and the e2e re-runs; the
contract bound does not need to change. Gas figures scale with the block size and are re-measured
then.

## T1-001 — Live phase opens on DR-013: read-only preparation and a free via_ir dry run (2026-10-24)

**Context.** Tier 0 is closed by DR-013 (main repository commit `320cb6d`): probe spending stopped at
`70.63305145206221 tPOT` of the `100 tPOT` cap; no further probe deploy. The owner's go for LIVE-1 is
read-only preparation plus a free `eth_estimateGas` dry run of the real Makhzan creation transaction.
**No transaction is sent in this step**; deploying needs a separate explicit go.

**Verdicts carried from Tier 0 (read-only; no renumbering of the existing gates).**

- **G01 — closed on T026 evidence** for the `solc` EVM path. The `via_ir` question is no longer a
  Tier 0 probe; it is answered only by the free Makhzan dry run recorded in `evidence/raw/t1/`.
- **G02 — partial by design.** Only the free read-only checks exist (chain identity, block time,
  `eth_getLogs` range, pruning, the 2 KiB calldata estimate, the reverting-call error shape). No
  behaviour probe was deployed and no live size/behaviour claim is made.
- **G03, G04, G05 — measured on the real Makhzan after its deploy**, with `eth_estimateGas` before
  every transaction and the measured balance drop recorded against that estimate.
- **G07 — closed.** The implied factor is exactly `10000` (`WEI_PER_UNIT = 10_000`).

**Chain and calibration facts.** Chain id `420420777`; genesis
`0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd`; measured deploy ratio
`0.984608251872` (ValueEcho, 570 creation bytes); Makhzan projection (6,566 runtime / 7,154 creation
bytes) low `521.360436729639`, expected `543.939473161567`, high `566.518509593496 tPOT`. Owner EVM
balance `729.279359108146266225 tPOT`; provider-1 about `60 tPOT`. The Tier 0 calibration file is
copied verbatim to `evidence/calibration.json`; its ratio lives under `makhzan_projection` and in the
deploy entry, so the deploy reader accepts that documented shape instead of inventing a second file.

**Consequences.** LIVE-1 may call only read-only RPC methods and `eth_estimateGas`. The deploy
transaction, the provider registration and every round are LIVE-2 and need a new go. Every LIVE-2
transaction keeps the dry-run-before-every-tx rule, the pending-record rule and its per-step cap.

**Evidence.** `evidence/calibration.json`, `evidence/raw/t1/104-live-env-red.txt`,
`105-live-env-green.txt`, `106-calibration-shape-red.txt`, `107-calibration-shape-green.txt`,
`108-doctor-owner-live.txt`, `109-doctor-provider1-live.txt`, `110-live-dry-run.txt`.

## T1-002 — OBSERVED: a 15 s receipt wait can mislabel a landed answer as unanswered (2026-10-24, Tier 1)

**Context.** LIVE-2b registered provider-1, created deal A, challenged index `451` and let the daemon
answer. The answer transaction
`0x8da1f12d9db85123e4ea3a13c8e2aa57b373981a6b6df66c57ec153cea9ce8e3` was mined in block `172295`,
36 blocks before the `172331` deadline. `chain.answer` waited with
`waitForTransactionReceipt({timeout: 15_000})`; the receipt arrived after the timeout, the hash was
lost, and the next poll saw a closed challenge with a stored `pending` record. The daemon labelled it
`unanswered`. On-chain read-back: `healthOf(1) = 1`, deal flags `0`, bond unchanged at 30 tPOT, and
the provider paid `0.162915694292617500 tPOT` of gas.

**Decision.** Stop LIVE-2b at the abort condition. The daemon's label is not trusted for this round;
do not resolve, claim or settle. The next change persists the submitted hash **before** waiting,
returns it to the state file, and polls the receipt in later cycles. A receipt timeout must stay
`submitted` (then be resolved by read-back), never become `unanswered`.

**Consequences.** The round is a passed on-chain round with a failed daemon label. README and CHECKIN
say exactly that; the live slashed round, claim and settle remain pending and need a new go after the
fix. No contract change is implied.

**Evidence.** `evidence/raw/t1/60-live-pass.txt`, `60-live-answer-receipt.json`,
`evidence/state/live/state.json`, `evidence/state/live-daemon.log`,
`evidence/receipts/live/0xd579567999dab3e34f5c6858eebff651b5d497d39995b47cabedd601a7d9cb91.json`,
`evidence/receipts/live/0x44c41e75c8e6d8a70620f07c56a6bd2a721cc6c45d0b98a314190767276c09b1.json`.

## T1-002 — FIXED and re-run live (2026-10-24, Tier 1)

**Context.** The T1-002 receipt-timeout defect was reproduced in tests first (delayed receipt, lost
response, closed challenge after a timeout, deadline while submitted). The daemon now sends and
returns the hash immediately, persists it in the state file and in `evidence/submitted/<network>/`
before any wait, then waits at least 120 s (600 s in the live run) for the receipt. A timeout with a
known hash stays `submitted`; later polls fetch the receipt, write the raw schema receipt and label
`passed`/`failed` only from the read-back. The CLI does the same persistence before its receipt wait.
The skip drill also needed a second small fix: a no-send round already recorded `unanswered` while
the window was open must still become `failed` when `resolve` slashes the bond.

**Decision.** No contract change. Both fixes are client-side and covered by tests (136 client/daemon
tests). Re-run the live path with new state directories; do not edit the LIVE-2b bug evidence
`evidence/state/live/state.json`.

**Live result.** Deal B passed with the daemon label `passed` after read-back (answer tx
`0xb1ddb1fb54e6f4c4405cfcb85640cae51808ef6ce7509f0e14acc422c3621210`, block `172585`; the raw
receipt is in `txs.json`). A skipped second challenge was resolved: the bond moved from
`3000000000000000` to `2400000000000000` units (exactly 20%) and the owner was credited exactly
`6000000000000000000` wei; the daemon labelled the round `failed`. Claim and settle then ran for both
deal A and deal B.

**Evidence.** `evidence/raw/t1/61-t1002-red.txt`, `61-t1002-green.txt`, `63-live-refusals.txt`,
`64-live-claim-a.txt` .. `72-live-summary.txt`, `evidence/receipts/live/`.

## SEC-001 — unredacted canary key material remains in public git history (2026-10-24, Tier 1) — CLOSED

**Context.** The whole-history secret scan (`evidence/raw/t1/73-secret-history.txt`) found three
key-shaped canary values in an older version of `evidence/raw/t1/55-secret-scan.txt` (commit
`2af8a44`): a PEM header, a 64-hex literal on a `PRIVATE_KEY=` line and a 12-word phrase. The current
file is redacted (commit `1ce5ab2`), and the current working tree passes `scripts/secret-scan.mjs`,
but the old blob remains in the public history of `main` and the branch. The values are not printed
anywhere in the scan output.

**Decision.** Treat the canary key material as compromised and rotate it if it ever controlled a
funded account. Do **not** rewrite public history without explicit owner approval; the repository rule
forbids a history rewrite by default. Keep the finding and the redacted evidence visible.

**Closure (2026-10-24T09:55:25Z).** The old blob was read in memory. The EVM address derived from
the 64-hex canary key and the first account derived from the 12-word canary mnemonic were compared
with six real accounts: owner, provider-1, provider-2, provider-3, provider-4 and vault-agent. Both
canary addresses matched none of them and both had zero balance on chain `420420777`. No key, phrase
or canary address was printed. The canary material is not a funded account, so no history rewrite is
needed. **Decision: close SEC-001 without a history rewrite and merge the feature branch normally.**

**Consequences.** The public history still contains the redacted-later canary blob, but it is not
linked to a real or funded account. The closure evidence is
`evidence/raw/t1/74-sec-001-closure.txt`; the result is recorded as yes/no only.

## T1-003 — MEASURED: the storage-deposit split is readable per account, not per receipt (2026-10-26, Tier 1)

**Context.** The post-check-in brief said "storage-deposit split not exposed by the RPC". A read-only
pass on `portaldot-v3` spec `3002` shows two different answers. A receipt carries
`status`/`blockNumber`/`gasUsed`/`effectiveGasPrice`/`logs` and no gas-versus-deposit line, so the
per-transaction split is indeed not exposed. But `revive.accountInfoOf(h160)` reports the contract's
`storageBaseDeposit`, `storageItemDeposit` and `storageByteDeposit`, and their sum
(`16551300000000000` planck) equals the contract's `system.account.reserved` exactly.
`revive.nativeDepositOf` is a two-key map with `0` entries, and both EOAs hold `reserved = 0`.

**Decision.** Record the measured split in `docs/V3-GOTCHAS.md` section 8 instead of repeating the
brief's wording, and do not claim any caller refund. The answer and settle deltas are fee-only
(`−162,915,694,292,617,500`, `−15,314,505,821,880,160`, `−15,314,494,987,996,050` wei, each equal to
`gasUsed × effectiveGasPrice`), so there is no keeper-refund story to tell. The deploy's total cost is
the owner's measured drop of `529.844316817465986480 tPOT`, and `165.513 tPOT` of that is the
contract's reserved deposit (the remainder, `364.331316817465986480 tPOT`, is execution fees). That
split is `[inferred from reconciliation]`; the receipt has no such field, and refundability of the
reserved deposit is not measured.

**Consequences.** The docs say "receipt-level split: not exposed; account-level split: exposed and
reconciles". No contract or CLI change follows from this entry.

**Evidence.** `evidence/raw/t1/78-chain-facts.txt`, `evidence/raw/t1/79-account-mapping-deposits.txt`,
`evidence/raw/t1/65-live-settle-a.txt`, `71-live-settle-b.txt`.

## D-11 — the Verify sample is the deal file itself, not a seeded file (2026-10-26, feature 003)

**Context.** The Verify screen needs a file a judge can load in one click whose root matches the deal
the chain holds. The request asked for a 1 MiB seeded demo file with the generator seed shown so
anyone can rebuild it.

**Reality.** Deals 1 and 2 committed the root of a 1 MiB file created on 2026-10-24 with
`dd if=/dev/urandom bs=1024 count=1024`. The chain holds
`0xd2ba07e1…70c7`; the file's sha256 is `0x7f2fd6d5…e21e`. Keccak-256 is preimage-resistant, so no
seed-derived file can reproduce that root, and a seeded sample would make the one-click check FAIL.

**Decision.** Serve the exact deal file byte-for-byte at `/samples/demo-1mib.bin`, and show its
sha256, size, block count, root and the exact command that created it, saying plainly that it has no
seed. `scripts/check-sample.mjs` re-derives all four values from the bytes on every build, so the page
cannot drift from the file. The page labels the recorded values `REPORTED` and the values it computes
from the loaded bytes `MEASURED`, with the source on every row naming which is which.

**Consequences.** A judge can check the bytes they received against the sha256, but cannot rebuild the
file from a short seed. This is recorded as a deviation from the request in the u2c checkpoint.

## D-12 — the evidence bundle gains an optional `retrieval` block (2026-10-26, feature 003)

**Context.** The Judges page needs a link for the fresh-client retrieval and the tamper rejection.
The `portaldot-live-run2` bundle recorded both in the raw run logs
(`portaldot-tier1/evidence/raw/t1/75-live-retrieval*.txt`) but had no field for them, so the page would
have shown a value with no evidence behind it.

**Decision.** Add `retrieval` as an optional top-level key (utc, dealIds, blockSize, blockCount, size,
sha256, root, sha256Match, tamper, source) to the schema, its validator, the contract document and the
run2 bundle. Absent or `null` means "not recorded", and the page shows `PENDING LIVE RUN`; the earlier
bundles stay valid and immutable. `scripts/check-evidence.mjs` re-validates the bundle on every build.

**Consequences.** The schema is no longer "all keys required, no others allowed" for this one key. It is
recorded in `specs/003-status-ui/contracts/evidence-schema.md` so the document and the code agree.

## D-13 — the secret scan skips build output (2026-10-26, feature 003)

**Context.** `node scripts/secret-scan.mjs` failed with 7 findings, all in
`apps/status-ui/dist/assets/index-*.js`: the minified viem bundle contains 32-hex error strings that
rule C (a 64-hex key shape on a line that names a key) reads as key material. `dist` is gitignored and
never committed.

**Decision.** Add `dist` to the scanner's `SKIP_DIRS`, so the scan reads source, specs and evidence —
what we actually commit. No allowlist entry was added, and the planted-secret tests still pass.

**Consequences.** A secret pasted into build output would not be caught by this scan. That output is
reproducible from the scanned source, so the risk stays with the source.
