---
description: "Task list for Tier 0 Chain Gates"
---

# Tasks: Tier 0 Chain Gates

**Input**: Design documents from `specs/001-tier0-gates/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by the constitution for every probe that touches value, and by `research.md`
§D15 for all probes. Test tasks come before their implementation task, and the failing run is kept
in `evidence/raw/<gate>/`.

**Organization**: Tasks are grouped by gate so the owner's order is preserved: G10 → G07 → G01 → G02
→ G03 → G04 → G05 → G06 → G08 → G09. Each group carries the `[USn]` label of the user story it
serves, so traceability survives even though the gate order takes precedence over story priority.
Each group ends with a record task and a commit task; no group is committed together with another.

**Run state**: every gate record carries `runState: done | blocked | not_run`. Only `done` records
carry a verdict (PASS, PARTIAL, FAIL). A gate that could not run because the RPC, the funds or an
upstream gate were unavailable is `blocked`, never `fail`; gates after a halt are `not_run`.

**Out of scope**: any Makhzan product contract, provider daemon, UI, agent, WASM/ink!, frontend,
database. Probe contracts under `contracts/src/tier0/` are disposable scaffolding.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (deploy + behavior), US2 (proof limits), US3 (funding + economics), US4
  (randomness + optional services), US5 (monitoring + records)
- Every task names the file it creates or changes.

## Path Conventions

- Foundry project: `contracts/` (`src/tier0/`, `test/tier0/`, `script/tier0/`)
- Harness: `apps/gates/` (`src/`, `src/lib/`, `src/gates/`, `test/`)
- Evidence: `evidence/` (`gates/`, `raw/`, `rpc-log/`)
- Documents: `evidence/tier0-results.md`, `docs/decisions.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Toolchain, dependency pins and configuration guards. No gate can run without these.

- [x] T001 Create `contracts/foundry.toml` with `evm_version = "paris"`, `solc = "0.8.28"` (provisional until G02), `optimizer = true`, `optimizer_runs = 200`, `src = "src"`, `test = "test"`, `script = "script"`, and a comment that the compiler pin is decided by G02.
- [x] T002 Create `apps/gates/package.json` with exact-pinned dependencies `viem`, `@polkadot/api`, `@polkadot/util-crypto`, dev-only `typescript`, and scripts `keygen`, `probe`, `gate`, `rollup`, `validate`, `typecheck`, `test`; run `npm install` once to produce `apps/gates/package-lock.json`.
- [x] T003 Create `apps/gates/tsconfig.json` with `strict: true`, `module: "nodenext"`, `target: "es2023"`, `noEmit: true`, `allowImportingTsExtensions: true`.
- [x] T004 Implement `apps/gates/src/config.ts`: load `.env` if present, require `PORTALDOT_EVM_RPC_URL` and `PORTALDOT_WS_URL`, define the chain object with id `420420777`, resolve all `evidence/` paths from the repository root derived from `import.meta.url` (never `cwd`), reject `--private-key`/`--mnemonic`/`--seed` in `process.argv` with exit 4, and expose key getters that never print values.
- [x] T005 Update `.env.example` to the CLI contract names (`PORTALDOT_EVM_RPC_URL`, `PORTALDOT_WS_URL`, `PORTALDOT_EXPLORER_URL`, `PROVIDER_1_KEY`…`PROVIDER_4_KEY`, `VAULT_AGENT_KEY`, `OWNER_KEY`) with empty values only, and confirm `.env` still matches the `.gitignore` patterns.
- [x] T006 Update `README.md` dependency table with Foundry `1.8.5`, Node `24.20.0`, `viem`, `@polkadot/api`, `@polkadot/util-crypto`, `typescript` — each with version and licence — and keep the AI-assistance section current.
- [x] T007 Run the toolchain smoke check (`cd contracts && forge build`, `cd apps/gates && npm ci && npm run typecheck`), save output to `evidence/raw/setup/01-toolchain.txt`, and commit as `chore(tier0): set up gate harness toolchain [ai]`.

**Checkpoint**: `forge build` and `tsc --noEmit` pass on an empty harness.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared libraries every gate depends on. **No gate group starts before this phase is
committed.**

- [x] T008 [P] Write failing tests for evidence validation and secret sanitization in `apps/gates/test/evidence.test.ts`: a record without `runState` rejected, `done` without a verdict rejected, `blocked`/`not_run` with a verdict rejected, `blocked`/`not_run` without a reason rejected, PASS without classification must be rejected, DESIGN-CHANGE without adaptation rejected, FALLBACK-TRIGGER without a named condition rejected, a loaded key value rejected, a recorded `--private-key` flag rejected, a missing `evidenceFiles` path rejected, timestamps out of order rejected.
- [x] T009 Implement `apps/gates/src/lib/evidence.ts` to make T008 pass: record types including `runState`, schema checks, temp-file-then-rename writes, `sanitize()` over every string, and `assertNoSecrets()`.
- [x] T010 [P] Write failing tests in `apps/gates/test/measure.test.ts` for the gas helper: method is always recorded, `receipt` requires `txRef`, `differential` requires two labelled samples, and a missing method throws.
- [x] T011 Implement `apps/gates/src/lib/measure.ts`: `eth_estimateGas` primary, receipt fallback, A/B differencing helper, unit-tagged measurements.
- [x] T012 [P] Implement `apps/gates/src/lib/evm.ts`: viem public/wallet clients, chain definition, `sendAndWait()` that records hash, block, status and receipt path, and a balance guard that refuses to spend below the configured reserve.
- [x] T013 [P] Implement `apps/gates/src/lib/substrate.ts`: `@polkadot/api` connect/disconnect, SS58 formatting via `@polkadot/util-crypto`, `system.account` balance read, extrinsic submit-and-watch with verbatim error capture.
- [x] T014 Implement `apps/gates/src/gates/runner.ts`: gate dispatch from `apps/gates/src/gates/registry.ts`, exit codes 0/1/2/3/4, raw-output capture wrapper, and record writing keyed on run state — exit 0 writes `runState: done` with a verdict, exit 2 writes `runState: blocked` with a reason and no verdict, and a halt writes `runState: not_run` for every later gate.
- [x] T015 Wire `npm run validate` in `apps/gates/src/validate.ts` over `evidence/` using the T008 rules and a fixture set under `apps/gates/test/fixtures/`; run it and confirm it rejects the bad fixtures.
- [x] T016 Run `npm test` and `npm run validate`, save output to `evidence/raw/setup/02-foundation.txt`, and commit as `feat(tier0): add evidence, measure, evm and substrate libraries [ai]`.

**Checkpoint**: Libraries tested; validators reject the bad fixtures; nothing has touched the live chain.

---

## Phase 3: G10 — RPC Probe (Priority: P1 execution order)

**Story**: US5 | **Goal**: Continuous, append-only evidence of EVM and WS reachability from before
any other gate. **Independent test**: a day file contains ticks at ~180 s spacing with reachability,
latency and block height for both endpoints, and a gap is detectable.

- [x] T017 [US5] Write failing tests in `apps/gates/test/daemon.test.ts`: a tick record has `evm.ok` xor `evm.error`, `ws.ok` xor `ws.error`, ISO-8601 UTC second precision, and a rotation helper picks the UTC date file.
- [x] T018 [US5] Implement `apps/gates/src/probe/daemon.ts`: 180 s interval, `fetch` for EVM (`eth_chainId`, `eth_blockNumber`, latency), global `WebSocket` for the node endpoint (best block via `chain_subscribeNewHeads` first; fall back to `system_health` only if the subscription errors, and record which source each tick used), verbatim error capture, atomic line append to `evidence/rpc-log/<UTC-date>.jsonl`, open→sealed rotation at UTC midnight, no backfill.
- [x] T019 [US5] Start the daemon against the live endpoints before any other gate, verify three consecutive ticks in `evidence/rpc-log/<date>.jsonl`, and save the start time, command and first lines to `evidence/raw/g10/01-started.txt`.
- [x] T020 [US5] Commit the probe start as `feat(tier0): start RPC probe daemon [ai]`, with the evidence file, and leave the daemon running for the rest of the tier.

**Checkpoint**: Probe is running and logging; G10's final coverage verdict is computed in T064.

---

## Phase 4: G07 — Funding and Mapping (Priority: P1, blocks every funded gate)

**Story**: US3 | **Goal**: Six funded burner accounts, a proven SS58 → EVM mapping, and the decimal
relationship answered with worked examples. **Independent test**: each account shows a native
balance, an EVM balance and one successful value transfer with a tx hash, and the faucet address is
written down before any request is made.

- [x] T021A [US3] Implement `apps/gates/src/keygen.ts` and `npm run keygen`: generate six secp256k1 burner keys (four providers, vault/agent, owner), write them to a gitignored `.env` at repo root with mode 600, and refuse to overwrite an existing `.env` (exit 4 with the reason). Per burner, print ONLY the EVM address (`viem` `privateKeyToAccount(key).address`) and candidate A as a 32-byte hex AccountId: the 20 EVM bytes followed by twelve `0xEE` bytes. Do not derive any Substrate account from the secp256k1 public key by blake2 or ECDSA; the SS58 prefix is unknown until the chain is read. Keep private values out of stdout, logs and records.
- [x] T021 [US3] Write failing unit tests in `apps/gates/test/g07.test.ts` for balance scaling and worked-example arithmetic: `impliedFactor` must be derived from observed values, not a constant; a zero EVM balance after the documented mapping attempts is a FAIL, and a run that never reached the chain is `blocked`, never a verdict.
- [x] T022 [US3] Implement `apps/gates/src/gates/g07.ts` phase 1: read the six env keys, derive each EVM address and candidate-A AccountId32, encode candidate A to SS58 using the prefix observed from `system_properties`, and query `system.account` balances. Inspect the runtime metadata (`revive` calls, storage and constants) for the fallback-account rule and record the evidence for both candidates in `evidence/gates/g07.json` as `BurnerAccount` and `AccountMapping` entries (no keys): candidate A (primary, the EVM bytes plus twelve `0xEE`) and candidate B (a separate Substrate keypair plus `map_account`, used only if evidence disproves A). Print the derivation, the candidate-A EVM address and SS58 address, the prefix, and the recommended faucet address; record the derivation and both addresses so they can be checked against each other. Never request funds on a guess.
- [ ] T023 [US3] Request test funds, owner first, using the address recommended in T022. Record the request, the response and UTC timestamps verbatim in `evidence/raw/g07/01-owner-funding.txt`. As soon as the owner account is funded and usable, G01 and G02 may start; request the other five in parallel and record them in `evidence/raw/g07/02-provider-funding.txt`. If usable funds are not available by 2026-10-21 after asking administrators, record fallback condition 2 and stop.
- [ ] T024 [US3] Implement mapping and test candidate A first: check whether the candidate-A account (EVM bytes + twelve `0xEE` bytes) already shows the funded balance and can move value. Only if it stays at zero or an EVM transaction from it fails after funding, generate candidate-B Substrate keypairs into the same ignored `.env`, submit `pallet_revive.map_account`, and record the route as a design change that implies Substrate-signed `Revive.call` extrinsics. Record each extrinsic hash, each verbatim error, which route worked and the evidence that disproved A, then mark `mapped: true` only on evidence.
- [ ] T025 [US3] Add `contracts/src/tier0/ValueEcho.sol` (returns `msg.value`, `msg.sender`, `block.timestamp`, `block.number`) with a `forge` test in `contracts/test/tier0/ValueEcho.t.sol` written first — including a fuzz test for `msg.value == sent`.
- [ ] T026 [US3] Deploy `ValueEcho` on the live chain, send a known amount from one mapped account, and record the received `msg.value`, the EVM balance delta and the native balance delta with tx hashes; derive `impliedFactor` and one worked example at a realistic deal bond.
- [ ] T027 [US3] Finalize `evidence/gates/g07.json` (run state, verdict, transactions, measurements, and `classification`/`adaptation` only when `runState` is `done` and the verdict is not PASS), save raw receipts under `evidence/raw/g07/`, then commit as `feat(tier0): fund and map six burner accounts (G07) [ai]`.

**Checkpoint**: Every later value-carrying gate has a funded, mapped account.

---

## Phase 5: G01 — Deploy and Call (Priority: P1)

**Story**: US1 | **Goal**: A disposable contract deployed and called on the live EVM RPC, with the
exact tooling, flags and compiler path recorded. **Independent test**: a second person can repeat the
deploy from the record alone.

- [X] T028 [US1] Write `contracts/test/tier0/CounterProbe.t.sol` first (set/get, event, revert) against a not-yet-existing `contracts/src/tier0/CounterProbe.sol`; run `forge test` and save the failing run to `evidence/raw/g01/01-red.txt`.
- [X] T029 [US1] Implement `contracts/src/tier0/CounterProbe.sol` (uint storage, `set`, `get`, `Set` event, `boom()` that reverts with a reason) until T028 passes.
- [X] T029A [US1] Before attempting a deploy, determine which bytecode this chain accepts and prepare both toolchains: inspect the runtime metadata for the Revive code-type rules, run `eth_getCode` on any existing contract on the chain, and read public Portaldot deploy recipes. Prepare solc-to-EVM through `forge` and resolc-to-PolkaVM, record the evidence for which path is more likely first, and pin/disclose any extra compiler or Foundry build in `README.md`.
- [ ] T030 [US1] Implement `apps/gates/src/gates/g01.ts` to build and deploy the more likely path first — per T029A — via a viem wallet client (no key on argv), call `set(7)` and read `get()`, and capture the exact compiler version, `evm_version`, flags and bytecode size in the record.
- [ ] T031 [US1] In the same session, attempt the other toolchain from T029A (resolc/PolkaVM or solc/EVM), recording the attempt, the verbatim rejection and which path produced a working deployment; update `contracts/foundry.toml` only after G02.
- [ ] T032 [US1] Finalize `evidence/gates/g01.json` and `evidence/raw/g01/`, and commit as `feat(tier0): deploy and call probe contract (G01) [ai]`. On a hard failure (two toolchain paths, 48h), write the fallback condition, mark every later gate `not_run` with G01 as the halt point, and stop the sequence.

**Checkpoint**: A working compiler path and deploy recipe exist, or the tier has stopped with a
recorded fallback trigger.

---

## Phase 6: G02 — Chain Behavior (Priority: P1)

**Story**: US1 | **Goal**: Storage, events, revert, value, timestamp and block number exercised live,
with every difference from Ethereum listed, plus the size limit, hash cost and compiler-path verdict.
**Independent test**: each behavior has a tx hash and an observed-vs-expected row.

- [X] T033 [US1] Write `contracts/test/tier0/BehaviorProbe.t.sol` first: storage write/read, event emission with indexed args, revert reason propagation, payable value acceptance, `block.timestamp` monotonicity, `block.number` monotonicity; run and keep the failing output in `evidence/raw/g02/01-red.txt`.
- [X] T034 [US1] Implement `contracts/src/tier0/BehaviorProbe.sol` until T033 passes.
- [X] T035 [US1] Implement `contracts/src/tier0/SizeProbe.sol` with a padding parameter and `apps/gates/src/gates/g02.ts` size ladder (ascending runtime size, binary search, stop at first rejection, verbatim error).
- [ ] T036 [US1] Measure the two hash ratios on the live chain and record them with their method and units: gas(`keccak256` over 32 bytes) / gas(one new storage-slot write), and gas(`keccak256` over 32 bytes) / gas(the reference event: one indexed topic plus 32 bytes of data). State the event shape in the measurement conditions. No threshold is applied and no verdict depends on them; the G04 ladder (T045) is the authoritative hash-cost measurement, and this task cross-references it.
- [ ] T037 [US1] Run all behaviors live, produce the differences table (every observed deviation, with expected Ethereum behavior and consequence), record the compiler-path conclusion, finalize `evidence/gates/g02.json`, pin `solc` in `contracts/foundry.toml`, and commit as `feat(tier0): measure chain behavior and limits (G02) [ai]`.

**Checkpoint**: The chain's behavior profile is documented; later gates use the proven compiler path.

---

## Phase 7: G03 — Randomness (Priority: P2)

**Story**: US4 | **Goal**: 30+ consecutive blocks sampled by read call and at least 10 values emitted
by real transactions, compared, with a usability verdict or a commit-reveal recommendation.
**Independent test**: both sample files exist, the comparison is stated, and the verdict cites
variation and readability.

- [ ] T038 [US4] Write `contracts/test/tier0/RandomnessProbe.t.sol` first: a read path returns `blockhash(block.number - 1)`, `block.prevrandao`, number and timestamp, and a write path records the same values in an event so real transactions can be sampled.
- [ ] T039 [US4] Implement `contracts/src/tier0/RandomnessProbe.sol` with a `record()` transaction that emits the values, and `apps/gates/src/gates/g03.ts` sampler: read once per block for 30+ consecutive blocks into `evidence/raw/g03/samples-call.json`, and send at least 10 real `record()` transactions, decoding the event values from receipts into `evidence/raw/g03/samples-tx.json`.
- [ ] T040 [US4] Compare the call samples and the transaction samples and report any disagreement explicitly (a read call may not reflect on-chain execution); analyze distinct values, repeats, zero values, readability of `blockhash(n-1)` and predictability one block ahead; write the verdict and, if unusable, the commit-reveal alternative with its extra hash, storage write, reveal window and added latency; finalize `evidence/gates/g03.json` and commit as `feat(tier0): sample on-chain randomness (G03) [ai]`.

**Checkpoint**: Challenge selection either has an entropy source or a documented replacement.

---

## Phase 8: G04 — Proof Limits (Priority: P2)

**Story**: US2 | **Goal**: A byte-carrying Merkle proof measured at real depths and sizes, plus the
calldata ceiling and the recommended challenge block size. **Independent test**: the recommendation's
arithmetic uses only values present in the record.

- [ ] T041 [US2] Write `contracts/test/tier0/MerkleProbe.t.sol` first: leaf hash is `keccak256(0x00 || bytes)`, node hash is `keccak256(0x01 || left || right)`, leaf count is committed, directions derive from index, odd nodes are promoted, a proof for index `i` fails at index `j`, and a hash-only response is rejected. Fuzz leaf sets and non-power-of-two counts; keep the failing run in `evidence/raw/g04/01-red.txt`.
- [ ] T042 [US2] Implement `contracts/src/tier0/MerkleProbe.sol` (root builder in the script, verifier on-chain taking `bytes leaf`, `uint256 index`, `bytes32[] path`) until T041 passes.
- [ ] T043 [US2] Write `contracts/test/tier0/HashCostProbe.t.sol` first, then implement `contracts/src/tier0/HashCostProbe.sol` with a `hash(bytes)` entry point that cannot be optimized away.
- [ ] T044 [US2] Implement `apps/gates/src/gates/g04.ts` calldata ladder against a no-op sink: start at 1 KiB, step up, binary search at the first rejection, record the verbatim node error and the last accepted size.
- [ ] T045 [US2] Measure `keccak256` gas for 1, 4, 16 and 64 KiB payloads on the live chain, recording method and conditions for each. This ladder is the authoritative hash-cost measurement; G02's ratios are cross-references only.
- [ ] T046 [US2] Measure full Merkle verification for 1 KiB and 4 KiB leaf blocks at depths 10, 14 and 20 (six combinations), recording gas, calldata size and tx hash in `evidence/raw/g04/merkle-matrix.json`.
- [ ] T047 [US2] Compute the largest byte-carrying response that fits both the calldata ceiling and the gas budget, choose the largest size in 1–4 KiB with a stated margin, write `ChallengeBlockRecommendation` (size, depth, margin, arithmetic, `fallbackTriggered`), finalize `evidence/gates/g04.json`, and commit as `feat(tier0): measure merkle and calldata limits (G04) [ai]`.

**Checkpoint**: A challenge block size is recommended from measurements, or the smallest proof's
failure is recorded as a fallback trigger.

---

## Phase 9: G05 — Storage Cost (Priority: P3)

**Story**: US3 | **Goal**: The deposit for a realistic deal record and the marginal cost of one more
stored value. **Independent test**: the two numbers are separable and both cite a tx or a query.

- [ ] T048 [US3] Write `contracts/test/tier0/StorageProbe.t.sol` first: writes and reads a deal record (identifier, provider, root, leaf count, size, bond, deadline, state) and asserts field round-trip; keep the failing run in `evidence/raw/g05/01-red.txt`.
- [ ] T049 [US3] Implement `contracts/src/tier0/StorageProbe.sol` and `apps/gates/src/gates/g05.ts`: write the realistic record, capture gas and any deposit reported separately, then add one value and capture the marginal cost.
- [ ] T050 [US3] Separate deposit from fee using balance deltas where the chain exposes a deposit, record both in `evidence/gates/g05.json`, and commit as `feat(tier0): measure storage deposit (G05) [ai]`.

**Checkpoint**: The per-deal storage assumption is stated with a number and a method.

---

## Phase 10: G06 — Challenge Round Cost (Priority: P3)

**Story**: US3 | **Goal**: Issue, answer and resolve measured, and the 14-day requirement at 10, 20
and 30 minute intervals for three providers. **Independent test**: each 14-day figure is recomputed
from the per-round costs by hand.

- [ ] T051 [US3] Write `contracts/test/tier0/RoundCostProbe.t.sol` first: issue stores a deadline and a seed, answer verifies a byte-carrying Merkle proof through the MerkleProbe logic, resolve moves a fixed amount, double-resolve reverts and a late answer reverts; keep the failing run in `evidence/raw/g06/01-red.txt`.
- [ ] T052 [US3] Implement `contracts/src/tier0/RoundCostProbe.sol` until T051 passes. Its file header MUST state that it is a disposable cost stub: no bond accounting, no reputation, no health state, no slashing percentage — a fixed amount moves on resolve. It measures round cost and is not a Makhzan product contract.
- [ ] T053 [US3] Run one full round live (issue → answer → resolve) and one resolve-after-deadline round, recording gas for each phase and the tx hashes in `evidence/raw/g06/rounds.json`.
- [ ] T054 [US3] Compute the 14-day requirement for 3 providers at 10, 20 and 30 minute intervals from the measured per-round cost, show the arithmetic, finalize `evidence/gates/g06.json`, and commit as `feat(tier0): measure challenge round cost (G06) [ai]`.

**Checkpoint**: The demo's test-fund budget is known and comparable to the funded balance.

---

## Phase 11: G08 — Identity (Priority: P3)

**Story**: US4 | **Goal**: Whether the identity pallet exists and whether a provider can set and read
back an identity. **Independent test**: a read result and a write result, each with evidence.

- [ ] T055 [US4] Implement `apps/gates/src/gates/g08.ts`: query `identity.identityOf` for an account, then submit `identity.setIdentity` with a burner, capture any deposit requirement and the verbatim extrinsic error, then read it back.
- [ ] T056 [US4] Finalize `evidence/gates/g08.json` with the existence answer and the write outcome, and commit as `feat(tier0): probe identity pallet (G08) [ai]`.

**Checkpoint**: The identity-link module is known to be available or unavailable.

---

## Phase 12: G09 — Assets (Optional) (Priority: P3)

**Story**: US4 | **Goal**: Whether an assets precompile responds, and what ERC-20 calls return.
**Independent test**: raw return data per candidate address, or an explicit "no precompile".

- [ ] T057 [US4] Implement `apps/gates/src/gates/g09.ts`: probe candidate precompile addresses for asset ids 0–3 using the pattern 4-byte id + 12 zero bytes + `0x01200000` (asset 1 → `0x0000000100000000000000000000000001200000`), plus any precompile the runtime metadata lists; for each, `eth_call` `name()`, `symbol()`, `decimals()`, `totalSupply()` and `balanceOf(address)`, capture raw return data and errors, and query the `assets` pallet metadata on the Substrate side.
- [ ] T058 [US4] Finalize `evidence/gates/g09.json` as `done` with PASS (responds) or PARTIAL (absent/errors, optional), and commit as `feat(tier0): probe assets precompile (G09) [ai]`; absence is recorded, never treated as `fail`.

**Checkpoint**: The bond-asset module's options are known.

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Turn records into the two documents of record, validate, checkpoint, stop.

- [ ] T059 [P] Write and test `apps/gates/src/rollup.ts` (`npm run rollup`): generate the gate table from `apps/gates/src/gates/registry.ts` and `evidence/gates/*.json`, compute probe coverage and gaps from `rpc-log/`, and render a missing record as `NOT RUN — halted at <gate>` or `BLOCKED — <reason>`. It never refuses because a record is absent; it refuses only on a malformed record, so the table still emits after a G01 halt.
- [ ] T060 Generate `evidence/tier0-results.md`: gate table with run state and verdict, per-gate prose with commands and numbers, "what this makes possible", "what this makes impossible" (explicit "nothing" if empty), "what changes in the design", and the eight starting facts with status. Blocked and not-run rows state the reason and claim no verdict.
- [ ] T061 Write `docs/decisions.md`: classification rules restated at the top (including that blocked and not-run gates are unclassified), one `D-00x` entry per `done` non-PASS gate and per contradicted starting fact, each with evidence path, consequence and status.
- [ ] T062 Add the short "how we verified the chain" section to `docs/EXPLAIN.md`, update `README.md` with the final dependency versions/licences and the implemented/simulated/roadmap table rows for tier 0, and mark AI-assisted parts.
- [ ] T062A Verify scope: list every file added since `45ad119` and confirm none is a Makhzan product contract, provider daemon, UI or agent, that `contracts/src/tier0/` contains only probes, and that `.specify/templates/` is unchanged (`git diff --stat 45ad119 -- .specify/templates`); save the output to `evidence/raw/final/00-scope.txt`.
- [ ] T063 Run `npm run validate` over the whole of `evidence/`, `docs/` and `specs/001-tier0-gates/`; confirm zero secret findings and zero schema findings; save to `evidence/raw/final/01-validate.txt`, then commit as `docs(tier0): publish tier 0 results and decisions [ai]`.
- [ ] T064 Stop the probe deliberately, record the stop time and final coverage in `evidence/gates/g10.json`, and commit as `chore(tier0): seal probe log (G10) [ai]`.
- [ ] T065 Build the checkpoint bundle in `/mnt/e/obsidian.md/SOLLY/makhzan-sync/`: `CHECKPOINT.md` (feature, stage, UTC time, `git log --oneline -15`, task status, deviations, risks, test and gas summary, exact next step), `constitution.md`, `spec.md`, `plan.md`, `tasks.md`, the stored analyze report, `tier0-results.md`, `decisions.md` and the gate records; re-run `validate` on the bundle and confirm no `.env` value appears, then STOP for owner approval. The bundle MUST be produced after a G01 halt too, with not-run gates rendered rather than skipped.

---

## Dependencies

```text
T001–T007 (setup) → T008–T016 (foundation) → T017–T020 (G10 probe) → T021A (keygen) → T022–T023 (owner funding)
owner funded → G01 → G02 → G03 → G04 → G05 → G06 → G08 → G09 → T059–T065 (rollup, documents, checkpoint)
remaining five accounts funded in parallel; required from G06 and G08
```

- One funded, usable owner account unblocks G01 and G02. The other five must exist by G06 and G08;
  G07 completes only when all six are funded and at least one mapping is proven.
- A gate that cannot run because the RPC, the funds or an upstream gate were unavailable is
  `blocked`, never `fail`; gates after a halt are `not_run`.
- G01's compiler verdict blocks G02's behavior run; G02's pin is used by G03–G06.
- G03 is independent of G04–G06 and may run while G04's payload ladder is being debugged locally.
- G04's recommendation is an input to G06's per-round cost narrative, not a blocker for its
  measurement.
- G08 and G09 are independent of each other and of G05/G06 once funding exists.
- The final documents (T060–T061) depend on every gate record; the checkpoint (T065) depends on all
  of the above.

## Parallel Execution Examples

- **Foundation**: T008 + T010 + T012 + T013 touch different files and can be written in parallel.
- **G02**: T033/T034 (behavior) and T035 (size ladder contract) touch different files; T036 needs
  the deployed probe.
- **G04**: T043 (hash probe) can be prepared while T041/T042 (Merkle) is still red; T044 (calldata
  ladder) needs only a sink contract, not the Merkle probe.
- **G05/G06**: contract tests T048 and T051 are independent files and can be written in parallel once
  funding exists.
- **G07**: T021A (keygen) and the T022 metadata inspection are independent of the faucet request in
  T023, which waits for T022's recommended address.
- **Polish**: T059 (rollup code) and T061 (decision prose) can proceed in parallel with T060's
  prose, but T060 must regenerate from records after every gate record change.

## Implementation Strategy

**MVP first**: T001–T032 (setup, foundation, G10 probe, G07 funding, G01 deploy, G02 behavior) is
the smallest slice that answers "does this chain work for us at all". Everything after it is
measurement depth, and the tier can be reported honestly from the MVP alone if time runs out.

**Incremental delivery**: one gate group per commit, evidence committed with the gate, no batching.
Docs and rollup come last so they cannot drift ahead of the records.

**Stop rules**: G01 hard failure stops the sequence and every later gate is recorded as `not_run`;
a dry faucet after 2026-10-21 stops the funded gates; any secret finding stops everything and is
reported for rotation. A blocked gate never becomes a failure: it is retried and re-recorded.

## Notes

- Every `forge test` red run is captured before implementation, satisfying the constitution's
  tests-before-funds rule and proving the tests were not written to fit the result.
- Probe contracts are disposable and live under `contracts/src/tier0/`; product contracts come later
  and must not reuse this namespace.
- No task in this list creates a Makhzan product contract, provider daemon, UI or agent.
