---
description: "Task list for Core Storage Proofs (Tier 1)"
---

# Tasks: Core Storage Proofs

**Input**: Design documents from `specs/002-core-storage-proofs/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by the constitution (Principle I) for every value-holding path, and by spec
FR-040/FR-041 for the Merkle and invariant suites. Test tasks come before their implementation task,
and the failing run is committed to `evidence/raw/t1/`. One commit per task; the branch is pushed
after each commit group.

**Organization**: Tasks follow the owner's mandated order — shared golden vectors and Merkle fuzz,
then the verifier, provider registry and bond, deals and escrow, challenge/answer/resolve/slash,
payments, invariants, the TypeScript components, size and gas budget checks, README and diagram, and
finally the gated `[LIVE]` phase. `[USn]` labels trace each task to the spec's user stories; the
mandated order takes precedence over story priority.

**Run state**: nothing live runs before Phase 10. Every live task is marked `[LIVE]` and is blocked
until the gate in T063 is satisfied. A blocked item is reported as `BLOCKED — <reason>`, never as
done.

**Amount units**: every stored amount is a count of native units (planck), with ONE constant
`WEI_PER_UNIT = 10_000` marked `[assumption]` until G07's measured implied factor confirms it. Every
incoming `msg.value` is an exact multiple of it or reverts `BadParams`; every payout is
`units × WEI_PER_UNIT`; slash is `floor(bondUnits × 20 / 100)`; accrual is computed in `uint256` and
stored in `uint64` units. `uint64` units cap at ≈ 184,467 tPOT. Every test amount is a multiple of
1e4 wei. Invariant (1) compares in wei.

**Size rule**: every Solidity commit records `forge build --sizes` runtime bytes in its evidence
file. If runtime exceeds 10,240 B, STOP and report instead of trimming features.

**Out of scope**: replication, erasure coding, repair, permissionless challenges, challenger bonds,
the vault, the agent, UIs, identity, ERC-20 tokens, multi-chain and mainnet.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 (provider bonds and serves), US2 (client stores and challenges), US3 (observable,
  evidenced outcomes)
- Every task names the file it creates or changes, its test, its evidence file and its commit message.

## Path Conventions

- Contracts: `contracts/src/makhzan/`, `contracts/test/makhzan/`, `contracts/script/makhzan/`
- TypeScript: `apps/makhzan/src/`, `apps/makhzan/test/`
- Shared vectors: `packages/merkle-vectors/`
- CI/scripts: `.github/workflows/`, `scripts/`
- Evidence: `evidence/raw/t1/`, `evidence/tier1-results.md`
- Docs: `README.md`, `docs/EXPLAIN.md`, `docs/decisions.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Toolchain, pins and scaffolding. No contract logic yet.

- [x] T001 Initialise the `forge-std` submodule inside this worktree (`git submodule update --init --recursive`), confirm `cd contracts && forge build` compiles the tier-0 probes, and save the command and output to `evidence/raw/t1/00-submodule.txt`; commit as `chore(tier1): init forge-std submodule in worktree [ai]` (research.md D18).
- [x] T002 Update `contracts/foundry.toml` to the pinned settings from research.md D1 (`optimizer_runs = 1`, `bytecode_hash = "none"`, `cbor_metadata = false`; keep `solc = "0.8.28"` and `evm_version = "paris"` provisional), run `forge fmt --check && forge build --sizes`, and save the output to `evidence/raw/t1/01-foundry-pins.txt`; commit as `chore(tier1): pin compiler and size-oriented optimizer settings [ai]`. **Test**: the tier-0 suites still compile and `forge fmt --check` exits 0.
- [x] T003 Create `contracts/size-budget.json` exactly as specified in `contracts/size-budget.md` (runtime 10240 B, deal 3, provider 2, challenge extra 1, round growth 0) and record its content in `evidence/raw/t1/02-size-budget.txt`; commit as `chore(tier1): add size and slot budget file [ai]`.
- [x] T004 [P] Install the tier-0 package first (`cd apps/gates && npm ci`) because `apps/makhzan` imports `apps/gates/src/lib/evidence.ts` by relative path and that file resolves `viem` from `apps/gates/node_modules`, then create `apps/makhzan/package.json` and `apps/makhzan/tsconfig.json` with the exact pins from research.md D11/D17 (`viem 2.57.7`, `typescript 5.9.3`, `@types/node 24.19.2`, scripts `daemon`, `cli`, `typecheck`, `test`, `e2e:local`), run `npm install` then `npm run typecheck` and save both installs and the typecheck output to `evidence/raw/t1/03-ts-setup.txt`; commit as `chore(tier1): scaffold makhzan TypeScript package [ai]`. **Test**: `npm ci` in `apps/gates` exits 0 and `npm run typecheck` exits 0 in `apps/makhzan`.
- [x] T005 [P] Create `.github/workflows/ci.yml` with two jobs (`contracts`: fmt, build --sizes, `node scripts/check-size.mjs`, `forge test -vvv`, `forge snapshot --check`; `typescript`: `cd apps/gates && npm ci`, `cd apps/makhzan && npm ci`, `npm run typecheck`, `npm test`, `node packages/merkle-vectors/generate.ts --check`), pin `foundry-rs/foundry-toolchain` and `actions/setup-node`, and record the file in `evidence/raw/t1/04-ci.txt`; commit as `chore(tier1): add CI workflow for contracts and TypeScript [ai]`. **Test**: both `npm ci` steps run before any typecheck or test, because the imported tier-0 helper needs its own `viem` tree.
- [x] T006 [P] Create `evidence/raw/t1/.gitkeep` and `evidence/tier1-results.md` with the report skeleton from `contracts/evidence-schema.md`, including the local and live sections and the `[LIVE]` rows rendered as `BLOCKED — Tier 0 gates and funding pending`; commit as `docs(tier1): scaffold tier-1 evidence layout [ai]`.

**Checkpoint**: Build, typecheck and CI skeleton exist; no product logic yet.

---

## Phase 2: Foundational — Golden Vectors, Merkle and Verifier (blocking)

**Purpose**: The commitment scheme both sides must agree on, and the verifier every later feature
depends on. **No user-story phase starts before this phase is committed.**

- [x] T007 Write `packages/merkle-vectors/generate.ts` (deterministic leaf data; leaf counts 1, 3, 7, 1000; emits leaves, leaf hashes, root and every path) so one run writes **both** `packages/merkle-vectors/vectors.json` and the byte-identical fixture `contracts/test/fixtures/vectors.json`; verify `--check` compares both copies against the generator, passes on a second run, and fails when either copy is edited; save the output plus that negative check to `evidence/raw/t1/05-vectors.txt`; commit as `feat(tier1): add shared merkle golden vector generator [ai]`. **Test**: `node packages/merkle-vectors/generate.ts --check` exits 0, is stable across two runs, and the two copies cannot drift (research.md D15).
- [x] T008 [P] Write `contracts/test/makhzan/MerkleLib.t.sol` first, against `contracts/src/makhzan/lib/MerkleLib.sol` reduced in the same commit to the documented signatures that revert `NotImplemented` (so the red run is behavioural, not a compile error): single-leaf root is the leaf hash; 3-leaf and 7-leaf roots and path lengths; the odd node is promoted at each level; a valid proof for index `i` fails for every `j ≠ i`; a reordered, shortened or extended path is rejected; wrong bytes are rejected. Run `forge test --match-path 'test/makhzan/MerkleLib.t.sol'` and save the failing output to `evidence/raw/t1/06-merkle-red.txt`; commit as `test(tier1): add failing MerkleLib suite [ai]`. **Test**: red on assertions for the missing implementation, not for compile or setup errors.
- [x] T009 Implement `contracts/src/makhzan/lib/MerkleLib.sol` exactly as `contracts/merkle.md` specifies until T008 passes with default and increased fuzz runs (`[fuzz] runs = 1000` recorded in `contracts/foundry.toml`), and save the green output to `evidence/raw/t1/07-merkle-green.txt`; commit as `feat(tier1): implement domain-separated Merkle library [ai]`. **Test**: T008 green, including the position-binding property.
- [x] T009a [P] Write `contracts/test/makhzan/MerkleFuzz.t.sol` with property tests at 1,000 runs each for FR-040/SC-003: bounded random leaf count (1..64) and leaf bytes (1..40 bytes, varied length), using a test-local tree builder that never calls `MerkleLib.root`: (a) a correct `(data, index, path)` verifies; (b) the same proof at every other index `j != i` is rejected; (c) flipping any one byte of the data is rejected; (d) a path with one element removed, one appended, or two distinct elements swapped is rejected; (e) `verifyLeaf` rejects data one byte short and one byte long; (f) the proof does not verify against a different root. Then run a three-way mutation check on `MerkleLib.verify` (drop the `p == path.length` check, invert the direction parity, skip the leaf prefix), show each mutation is caught by at least one fuzz test, restore, and show `git diff` on `MerkleLib.sol` is empty; save every run to `evidence/raw/t1/15a-fuzz.txt`; commit as `test(tier1): add Merkle fuzz properties and mutation check [ai]`. **Test**: all seven properties pass 1,000 runs each and each mutation fails at least one property.
- [x] T010 Write `contracts/test/makhzan/GoldenVectors.t.sol` reading `contracts/test/fixtures/vectors.json` (written by T007, the contract-side copy of the shared vectors) via `vm.readFile`/`vm.parseJson` and verifying every path on-chain for leaf counts 1, 3, 7 and 1000; save the failing run to `evidence/raw/t1/08-golden-red.txt`; commit as `test(tier1): add failing on-chain golden vector suite [ai]`. **Test**: red on assertions until the parser and vector walk are wired; the file itself already exists from T007, so the red is behavioural.
- [x] T011 Wire the fixture and parser in `contracts/test/makhzan/GoldenVectors.t.sol` (and any test helper) until T010 passes; save the green output to `evidence/raw/t1/09-golden-green.txt`; commit as `test(tier1): verify on-chain golden vectors [ai]`. **Test**: on-chain verification agrees with the generator for all four leaf counts.
- [x] T012 [P] Write `apps/makhzan/test/merkle.test.ts` first against `apps/makhzan/src/merkle.ts` reduced in the same commit to the documented exports that throw `not implemented` (so the red run is behavioural, not a module-resolution error): build the tree and paths for the four vector leaf counts, compare with `vectors.json`, and reject wrong position, wrong bytes, wrong depth, reordered path and empty bytes. Run `npm test` and save the failing output to `evidence/raw/t1/10-ts-merkle-red.txt`; commit as `test(tier1): add failing TypeScript merkle suite [ai]`. **Test**: red on assertions for the missing implementation.
- [x] T013 Implement `apps/makhzan/src/merkle.ts` to match `contracts/merkle.md` until T012 passes, then run `node packages/merkle-vectors/generate.ts --check` and save both outputs to `evidence/raw/t1/11-ts-merkle-green.txt`; commit as `feat(tier1): implement TypeScript merkle builder [ai]`. **Test**: T012 green and the parity check passes (spec SC-005).
- [x] T014 [P] Write `contracts/test/makhzan/Verifier.t.sol` plus test-only `contracts/test/makhzan/harness/VerifyHarness.sol` calling the verifier entry point with an expected byte length: correct answer accepted; a 32-byte hash used as the payload rejected; empty payload rejected; payload one byte short and one byte long rejected; path one element short and one long rejected; path for another index rejected; reordered path rejected. Save the failing output to `evidence/raw/t1/12-verifier-red.txt`; commit as `test(tier1): add failing verifier acceptance matrix [ai]`. **Test**: red for the missing length rule.
- [x] T015 Add the expected-byte-length rule to the verifier entry point in `contracts/src/makhzan/lib/MerkleLib.sol` (`verifyLeaf(root, data, index, leafCount, expectedLen, path)`) until T014 passes; save the green output to `evidence/raw/t1/13-verifier-green.txt`; commit as `feat(tier1): enforce expected leaf length in verifier [ai]`. **Test**: T014 green; hash-only and wrong-length answers are rejected (FR-014).

**Checkpoint**: Both languages agree on vectors; the verifier rejects every malformed answer.

---

## Phase 3: US1 — Provider Registry, Bond, Deals and Escrow (Priority: P1)

**Story**: US1 | **Goal**: A provider can bond and serve a deal; a client can create an escrowed deal
against a registered provider. **Independent test**: register, top up, create a deal, read provider
and deal state back, and have a test helper produce a valid block-and-path for a chosen position.

- [x] T016 [US1] Create `contracts/src/makhzan/IMakhzan.sol` exactly as `contracts/imakhzan.md` specifies and `contracts/src/makhzan/Makhzan.sol` with the packed state from `contracts/storage-layout.md`, implementing only the read surface (`providerOf`, `dealOf`, `challengeStateOf`, `accruedOf`, `peek`) and reverting `NotImplemented` stubs for every state-changing function; run `forge build --sizes` and save the output to `evidence/raw/t1/14-interface-skeleton.txt`; commit as `feat(tier1): add Makhzan contract skeleton and interface [ai]`. **Test**: compiles inside the size budget; no value path is added here (the stubs revert and move no value), so the red/green rule starts with T018.
- [x] T017 [US1] Write `contracts/test/makhzan/Interface.t.sol` first: every selector in `contracts/imakhzan.md` exists on `Makhzan` and the ABI has no undocumented external function; every state-changing stub reverts `NotImplemented` rather than returning empty data; `peek` returns the raw slot values of a seeded deal in request order and zero for an unallocated slot; `providerOf`, `dealOf`, `challengeStateOf` and `accruedOf` for an unknown id are asserted explicitly. Save the run to `evidence/raw/t1/15-interface-green.txt`; commit as `test(tier1): add interface conformance suite [ai]`. **Test**: structural conformance passes, so it carries no red run by design — it guards the ABI against drift and proves the `peek` read path; the first value-path red is T018's.
- [x] T018 [US1] Write `contracts/test/makhzan/Registry.t.sol` first: registration below `minBond` reverts `BondTooSmall`; a valid registration stores the bond and returns a stable id; a second registration reverts `AlreadyRegistered`; `addBond` by a stranger reverts `NotRegistered`; top-up updates the bond read-back; a value that is not a multiple of `WEI_PER_UNIT` reverts `BadParams` in both `registerProvider` and `addBond`; units above the `uint64` cap revert `BadParams`; `withdrawBond` succeeds with no open deal, clears registration and pays `bond × WEI_PER_UNIT`; the event fires with the documented fields. Save the failing run to `evidence/raw/t1/16-registry-red.txt`; commit as `test(tier1): add failing provider registry suite [ai]`. **Test**: red for the unimplemented registry.
- [x] T019 [US1] Implement `contracts/src/makhzan/lib/BondLib.sol` and the registry entry points in `Makhzan.sol` until T018 passes; save the green output to `evidence/raw/t1/17-registry-green.txt`; commit as `feat(tier1): implement provider registry and bond accounting [ai]`. **Test**: T018 green (FR-001–FR-004).
- [x] T020 [US1] Write `contracts/test/makhzan/Deals.t.sol` first: rejection matrix — zero root, size zero, `leafCount ≠ ceil(size/blockSize)`, last-leaf length zero or greater than the block size, duration below the minimum and above the maximum, `msg.value` not a multiple of `WEI_PER_UNIT` reverts `BadParams`, `msg.value` above the `uint64` unit cap reverts `BadParams`, `msg.value ≠ price × WEI_PER_UNIT`, unknown provider id, provider bond below `minBond`; acceptance — a valid deal stores every field, escrow equals `price × WEI_PER_UNIT`, ids are unique and monotone, the provider's open-deal count rises, and the event fires. Save the failing run to `evidence/raw/t1/18-deals-red.txt`; commit as `test(tier1): add failing deal creation and escrow suite [ai]`. **Test**: red for the unimplemented `createDeal`.
- [x] T021 [US1] Implement `createDeal` and its validation in `Makhzan.sol` until T020 passes; save the green output to `evidence/raw/t1/19-deals-green.txt`; commit as `feat(tier1): implement deal creation and escrow [ai]`. **Test**: T020 green (FR-005–FR-008).
- [x] T022 [US1] Extend `contracts/test/makhzan/StorageLayout.t.sol` first: populate a provider and a deal with maximal realistic values, compute the provider element slot and the deal slot, and assert the provider uses 2 slots and the deal exactly 3 (the next slot is zero). Save the failing run to `evidence/raw/t1/20-slots-red.txt`; commit as `test(tier1): add failing storage slot budget suite [ai]`. **Test**: red until slot assertions are wired.
- [x] T023 [US1] Fix the struct packing and field order in `Makhzan.sol` until T022 passes, and save the green output to `evidence/raw/t1/21-slots-green.txt`; commit as `feat(tier1): pack deal and provider records to budget [ai]`. **Test**: T022 green (FR-036, `contracts/storage-layout.md`).
- [x] T024 [US1] Add the test helper `contracts/test/makhzan/harness/TreeHarness.sol` (build leaves, root and path for a given size and block size) and extend `Deals.t.sol` with a case proving a produced path verifies against the stored root at a tester-chosen position; save the output to `evidence/raw/t1/22-us1-independent.txt`; commit as `test(tier1): prove US1 independently with a served deal [ai]`. **Test**: US1's independent test — register, create, produce and verify one challenged block.

**Checkpoint**: US1 is independently testable: provider bonded, deal escrowed, one block provable.

---

## Phase 4: US2 — Challenge, Answer, Resolve, Slash and Payments (Priority: P2)

**Story**: US2 | **Goal**: The deal owner challenges a random block; a correct answer passes, a wrong
or missing answer slashes; payment accrues and settles. **Independent test**: one passed round with an
unchanged bond and one failed round with a 20% bond slash, all read back from state.

- [x] T025 [US2] Write `contracts/test/makhzan/Challenge.t.sol` first: only the owner may challenge; a second challenge while one is open reverts `ChallengeOpen`; the recorded index `< leafCount` and the deadline equals `challengeStart + challengeWindow`; only the deal's provider may answer; a valid answer before the deadline passes and clears the open flag; an invalid answer reverts `ProofRejected` and leaves the challenge open so the provider can retry; an answer after the deadline reverts `WindowOpen`; `resolve` before the deadline reverts; `resolve` after the deadline slashes exactly 20% of the bond to the owner and clears the flag; a second `resolve` reverts `NoChallenge`; a challenge on an expired deal reverts `DealExpired`; an open challenge remains resolvable after `endBlock`; the events fire with the documented fields. Save the failing run to `evidence/raw/t1/23-challenge-red.txt`; commit as `test(tier1): add failing challenge and slash suite [ai]`. **Test**: red for the unimplemented challenge path.
- [x] T026 [US2] Implement `challenge`, `answer` and `resolve` in `Makhzan.sol` (using the D5 selector and the T015 verifier) until T025 passes; save the green output to `evidence/raw/t1/24-challenge-green.txt`; commit as `feat(tier1): implement challenge, answer and slash [ai]`. **Test**: T025 green (FR-010–FR-023).
- [x] T027 [US2] Extend `contracts/test/makhzan/StorageLayout.t.sol` first with the challenge cases: the four deal slots are unchanged while a challenge is open, and two consecutive rounds on one deal add no slot; save the failing run to `evidence/raw/t1/25-challenge-slots-red.txt`; commit as `test(tier1): add failing challenge storage growth suite [ai]`. **Test**: red until the assertions run against a real challenge.
- [x] T028 [US2] Fix any growth found in the challenge path until T027 passes and save the green output to `evidence/raw/t1/26-challenge-slots-green.txt`; commit as `fix(tier1): keep challenge rounds storage-free [ai]`. **Test**: T027 green (0 new slots, 0 round growth).
- [x] T029 [US2] Write `contracts/test/makhzan/Payments.t.sol` first: accrual is zero at the start block, `floor(price × elapsed / duration)` in units at the midpoint, capped at the full price after the end block; `claim` by a stranger reverts `NotProvider`; `claim` before any accrual reverts `ZeroClaim`; a mid-deal provider claim pays exactly `(accrued − claimed) × WEI_PER_UNIT` and updates `claimed`; a second immediate claim reverts; `settle` before the end reverts `BeforeEnd`; `settle` with an open challenge reverts `ChallengeOpen`; a stranger can settle and the recipients and amounts are identical to an owner settle (provider gets the unpaid accrued amount, owner gets the remainder, not the caller); a valid `settle` decrements the open-deal count and marks the deal settled; a second `settle` reverts `AlreadySettled`; `claimed` never exceeds `price`. Also add a matching stranger-`resolve` case in `Challenge.t.sol`: the slash goes to the deal owner, not the caller. Save the failing run to `evidence/raw/t1/27-payments-red.txt`; commit as `test(tier1): add failing payment and settlement suite [ai]`. **Test**: red for the unimplemented payment path.
- [x] T030 [US2] Implement `contracts/src/makhzan/lib/PayLib.sol` and `claim`/`settle` in `Makhzan.sol` until T029 passes; save the green output to `evidence/raw/t1/28-payments-green.txt`; commit as `feat(tier1): implement accrual, claim and settlement [ai]`. **Test**: T029 green (FR-024–FR-028).
- [x] T031 [US2] Write `contracts/test/makhzan/Guards.t.sol` first: `withdrawBond` reverts `HasOpenDeal` while a deal is unsettled and succeeds after settlement; a provider whose bond falls below `minBond` after a slash is refused a new deal but keeps an existing one; every custom error in `contracts/imakhzan.md` is reachable by at least one case; and a test-only malicious receiver contract re-enters `claim`, `settle`, `resolve` and `withdrawBond` from its `receive` function, with no double payout and no broken balance. CEI is required, no reentrancy-guard slot; a failed transfer reverts. Save the failing run to `evidence/raw/t1/29-guards-red.txt`; commit as `test(tier1): add failing guard and error coverage suite [ai]`. **Test**: red for the missing guards.
- [x] T032 [US2] Implement the exit guard and the below-minimum rule in `Makhzan.sol` until T031 passes; save the green output to `evidence/raw/t1/30-guards-green.txt`; commit as `feat(tier1): enforce exit and minimum-bond guards [ai]` (no pause: DR-010). **Test**: T031 green (FR-003, FR-004, FR-043).
- [x] T033 [US2] Add a US2 independent test in `contracts/test/makhzan/Rounds.t.sol`: one full passed round and one full failed round on the same deal, asserting bond deltas, owner credit, deal survival after the failure and settlement at the end; save the output to `evidence/raw/t1/31-us2-independent.txt`; commit as `test(tier1): prove US2 independently with one pass and one slash [ai]`. **Test**: US2's independent test end to end in Solidity.

**Checkpoint**: US2 is independently testable: pass, slash, retry, timeout, claim, settle all read back.

---

## Phase 5: Invariants (Cross-Cutting, Blocking for [LIVE])

**Purpose**: The five required invariants (spec FR-041) fuzzed over the whole value surface.

- [x] T034 Write `contracts/test/makhzan/invariant/MakhzanHandler.sol` and `contracts/test/makhzan/invariant/MakhzanInvariant.t.sol` first with the five invariants: (1) balance in wei ≥ Σ `bond × WEI_PER_UNIT` + Σ `(price − claimed) × WEI_PER_UNIT` + unclaimed payouts; (2) a slash never exceeds the bond; (3) a challenge resolves at most once; (4) accrued ≤ price and claimed ≤ accrued; (8) a proof valid for `i` never verifies for `j`. Configure `[invariant] runs = 256`, `depth = 50` in `contracts/foundry.toml`. Save the failing run to `evidence/raw/t1/32-invariant-red.txt`; commit as `test(tier1): add failing invariant suite [ai]`. **Test**: red for the missing handler.
- [x] T035 Implement the handler's actor actions (register, top-up, withdraw, create, challenge, answer, resolve, claim, settle with bounded values, every actor value a multiple of `WEI_PER_UNIT`, and a `vm.assume` on `uint64` unit representability); add the malicious receiver as a recipient actor in the T034 handler; until T034 passes with zero violations; save the green output to `evidence/raw/t1/33-invariant-green.txt`; commit as `feat(tier1): add invariant handler and prove conservation [ai]`. **Test**: T034 green, 256 sequences × 50 calls, zero violations (SC-004).
- [x] T036 [P] Add targeted boundary tests in `contracts/test/makhzan/InvariantEdges.t.sol` first: slash exactly at a bond of `minBond`; slash at the `uint64` bond cap; claim at the exact end block; settle in the same block that a challenge fails; conservation with two deals and one provider. Save the failing run to `evidence/raw/t1/34-edges-red.txt`; commit as `test(tier1): add failing invariant boundary cases [ai]`. **Test**: red until the boundaries are exercised.
- [x] T037 Fix any boundary violation found in `Makhzan.sol` until T036 passes; save the green output to `evidence/raw/t1/35-edges-green.txt`; commit as `fix(tier1): correct invariant boundary behaviour [ai]`. **Test**: T036 green; invariants 2 and 4 hold at their extremes.

**Checkpoint**: No value path can break conservation, the slash cap, single resolution, accrual caps or
position binding.

---

## Phase 6: US2 Off-Chain — Chunker, Status, State, Upload, Daemon, CLI (Priority: P2)

**Story**: US2 | **Goal**: The client CLI stores a file and challenges; the daemon answers.
**Independent test**: a local end-to-end run produces one passed and one slashed round with the five
statuses recorded.

- [ ] T038 [US2] Write `apps/makhzan/test/chunk.test.ts` first against `apps/makhzan/src/chunk.ts` reduced in the same commit to the documented exports that throw `not implemented`: a 1 MiB file yields `ceil(size/blockSize)` blocks, every block except the last is exactly `blockSize`, the last matches the remainder, a file smaller than one block yields one leaf, a zero-length file is rejected, and the block size must be in range. Save the failing output to `evidence/raw/t1/36-chunk-red.txt`; commit as `test(tier1): add failing chunker suite [ai]`. **Test**: red on assertions, not on module resolution.
- [ ] T039 [US2] Implement `apps/makhzan/src/chunk.ts` until T038 passes and save the green output to `evidence/raw/t1/37-chunk-green.txt`; commit as `feat(tier1): implement challenge-block chunker [ai]`. **Test**: T038 green (FR-008, FR-030).
- [ ] T040 [US2] Write `apps/makhzan/test/status.test.ts` first against `apps/makhzan/src/status.ts` reduced in the same commit to the documented exports that throw `not implemented`: the five states are produced in order, `finalized` is only set after observation (tag or labelled heuristic), a record refuses to act before `executed`, a reverted transaction keeps the verbatim reason and produces no success read-back. Save the failing output to `evidence/raw/t1/38-status-red.txt`; commit as `test(tier1): add failing transaction status suite [ai]`. **Test**: red on assertions, not on module resolution.
- [ ] T041 [US2] Implement `apps/makhzan/src/status.ts` until T040 passes and save the green output to `evidence/raw/t1/39-status-green.txt`; commit as `feat(tier1): implement five-state transaction pipeline [ai]`. **Test**: T040 green (FR-031, FR-033).
- [ ] T042 [US2] Write `apps/makhzan/test/state.test.ts` first against `apps/makhzan/src/state.ts` reduced in the same commit to the documented exports that throw `not implemented`: atomic write leaves no partial file, a corrupt state file is reported and not silently replaced, a missing file is treated as empty and rebuilt, and a restart re-derives paths from stored blocks. Save the failing output to `evidence/raw/t1/40-state-red.txt`; commit as `test(tier1): add failing local state suite [ai]`. **Test**: red on assertions, not on module resolution.
- [ ] T043 [US2] Implement `apps/makhzan/src/state.ts` until T042 passes and save the green output to `evidence/raw/t1/41-state-green.txt`; commit as `feat(tier1): implement atomic JSON state store [ai]`. **Test**: T042 green (FR-032).
- [ ] T044 [US2] Write `apps/makhzan/test/upload.test.ts` first against `apps/makhzan/src/upload.ts` and the upload half of `apps/makhzan/src/daemon.ts`, both reduced in the same commit to the documented exports that throw `not implemented`: the envelope validation matrix from `contracts/cli-daemon.md` — extra field, missing field, wrong block size, index out of range, wrong data length, out-of-order block, declared root that does not match the recomputed root — each rejected with a verbatim reason; a complete valid file is acknowledged with `(root, size, leafCount)`. Save the failing output to `evidence/raw/t1/42-upload-red.txt`; commit as `test(tier1): add failing upload envelope suite [ai]`. **Test**: red on assertions, not on module resolution.
- [ ] T045 [US2] Implement `apps/makhzan/src/upload.ts` and the daemon's upload endpoint in `apps/makhzan/src/daemon.ts` until T044 passes and save the green output to `evidence/raw/t1/43-upload-green.txt`; commit as `feat(tier1): implement validated upload and acknowledgement [ai]`. **Test**: T044 green (FR-009, FR-043).
- [ ] T046 [US2] Write `apps/makhzan/test/daemon.test.ts` first, against a `daemon.ts` whose polling half is still the throwing stub from T044: the poll cycle reads `challengeStateOf` and never calls a log query (asserted by the injected client), an open challenge on a known deal produces the block and path and submits `answer`, drill mode produces a wrong answer or a skipped answer, a challenge on an unknown deal is reported `unanswerable: unknown deal`, and a restart resumes without re-answering a resolved round. Save the failing output to `evidence/raw/t1/44-daemon-red.txt`; commit as `test(tier1): add failing daemon answer suite [ai]`. **Test**: red on assertions, not on module resolution.
- [ ] T047 [US2] Implement the daemon's polling, answer building and drill mode in `apps/makhzan/src/daemon.ts` until T046 passes and save the green output to `evidence/raw/t1/45-daemon-green.txt`; commit as `feat(tier1): implement provider daemon challenge answering [ai]`. **Test**: T046 green (FR-029, FR-032).
- [ ] T048 [US2] Write `apps/makhzan/test/cli.test.ts` and `apps/makhzan/test/errors.test.ts` first, against `apps/makhzan/src/cli.ts` and `apps/makhzan/src/errors.ts` reduced in the same commit to the documented exports that throw `not implemented`: `upload`, `create`, `challenge`, `watch`, `claim`, `settle` and `report` parse their documented arguments; missing or extra arguments are rejected; an invalid root, size, leaf count, duration or price is rejected before any transaction; a decimal tPOT price is converted to wei with integer math only and rejected when it is not an exact multiple of `WEI_PER_UNIT` or when its unit value exceeds the `uint64` cap; a key passed on argv is refused; a command that needs finality waits for it; each of the 17 short custom errors in `contracts/imakhzan.md` maps to its documented message and an unknown error string is surfaced verbatim rather than swallowed (FR-045); a node-level revert reason and an RPC failure are reported, never treated as success; and the fee policy is asserted on the built transaction (`gas = estimate × 1.2`, `maxFeePerGas` = chain gas price, `maxPriorityFeePerGas = 0`, research.md D16). Save the failing output to `evidence/raw/t1/46-cli-red.txt`; commit as `test(tier1): add failing CLI and error mapping suite [ai]`. **Test**: red on assertions, not on module resolution.
- [ ] T049 [US2] Implement `apps/makhzan/src/cli.ts` and `apps/makhzan/src/errors.ts` (the shared error mapper used by both CLI and daemon) until T048 passes and save the green output to `evidence/raw/t1/47-cli-green.txt`; commit as `feat(tier1): implement client CLI and error mapping [ai]`. **Test**: T048 green (FR-030, FR-031, FR-043, FR-045).
- [ ] T050 [US2] Write `apps/makhzan/scripts/e2e-local.mjs`: start `anvil --chain-id 420420777`, deploy `Makhzan`, register a provider, upload a 1 MiB file, create a deal, run a passed round, run a drill-mode failed round and resolve it, settle, and assert the bond delta is exactly 20% and the owner was credited; run it and save the full output plus both round records to `evidence/raw/t1/48-e2e-local.txt`; commit as `test(tier1): add local end-to-end pass and slash run [ai]`. **Test**: SC-001 and SC-002 on a local chain, with two round records in the evidence schema.

**Checkpoint**: A stranger can produce a pass and a slash locally with no live funds.

---

## Phase 7: Size and Gas Budget Checks (Cross-Cutting)

**Purpose**: Make the budgets enforceable rather than asserted.

- [ ] T051 Write `scripts/check-size.mjs` as specified in `contracts/size-budget.md`, run it against `contracts/out/Makhzan.sol/Makhzan.json`, and save the passing output to `evidence/raw/t1/49-size-check.txt`; commit as `feat(tier1): add deployed size budget check [ai]`. **Test**: prints actual vs budget and exits 0 inside the budget.
- [ ] T052 Prove the check fails on an overrun: run it once with `contracts/size-budget.json` temporarily set to exactly the measured runtime size **minus one byte** (the contract is then one byte over budget) and once at the real budget, saving both outputs with their exit codes to `evidence/raw/t1/50-size-check-red.txt`, and restore the real budget in the same commit; commit as `test(tier1): prove the size check fails on overrun [ai]`. **Test**: exit non-zero with the actual and budgeted bytes for a one-byte overrun, exit 0 at the real budget (SC-006).
- [ ] T053 Run `forge snapshot` to create `contracts/.gas-snapshot`, then `forge snapshot --check`, and save both outputs to `evidence/raw/t1/51-gas-snapshot.txt`; commit as `chore(tier1): record gas snapshot for tier-1 operations [ai]`. **Test**: `--check` exits 0 and the snapshot contains register, create, challenge, answer, resolve, claim and settle.
- [ ] T054 Finish `.github/workflows/ci.yml` so both jobs run the full command list from research.md D13 (including `npm ci` in `apps/gates` before `apps/makhzan`, because the imported tier-0 helper resolves `viem` from its own tree), and run every one of those commands locally (recording exit codes) into `evidence/raw/t1/52-ci-local.txt`; commit as `chore(tier1): wire size, snapshot and parity checks into CI [ai]`. **Test**: each CI command exits 0 locally and the workflow references only existing files.

**Checkpoint**: The 10 KB budget, the slot budgets, the vector parity and gas drift are machine-checked.

---

## Phase 8: US3 — Observable, Evidenced Outcomes, README and Diagram (Priority: P3)

**Story**: US3 | **Goal**: An observer can see one passed and one failed-and-slashed challenge with
transaction references and read-backs, in a README that matches the evidence.

- [ ] T055 [US3] Write `apps/makhzan/test/evidence.test.ts` first against `apps/makhzan/src/evidenceWriter.ts` reduced in the same commit to the documented exports that throw `not implemented`: a round record without any one of the five statuses is rejected; a record with a `finalized` heuristic is required to label its depth; a record containing a key-like value is rejected by the sanitiser; a blocked item renders as `BLOCKED — <reason>`; local and live records are labelled distinctly. Save the failing output to `evidence/raw/t1/53-evidence-red.txt`; commit as `test(tier1): add failing round evidence suite [ai]`. **Test**: red on assertions, not on module resolution.
- [ ] T056 [US3] Implement `apps/makhzan/src/evidenceWriter.ts` (thin wrapper over `apps/gates/src/lib/evidence.ts`) and the `report` command until T055 passes, and save the green output to `evidence/raw/t1/54-evidence-green.txt`; commit as `feat(tier1): implement sanitised round evidence writer [ai]`. **Test**: T055 green (FR-033, FR-034).
- [ ] T057 [US3] Generate `evidence/tier1-results.md` from the T050 local run: both rounds with transaction records, before/after balances, deltas, the budget table (labelled estimate where G05 has not measured), the slot facts, and every `[LIVE]` row rendered as `BLOCKED`; commit as `docs(tier1): publish local pass and slash results [ai]`. **Test**: every number in the report appears in `evidence/raw/t1/`.
- [ ] T058 [US3] Update `README.md` with the tier-1 implemented / simulated / roadmap table (rows match the evidence), a Mermaid architecture diagram (client CLI → provider daemon → Makhzan → chain), the demo script capped at 3 minutes, a known-limits line stating that identical blocks are interchangeable by design (FR-017, DR-011), the AI-assistance marking for the new code, and the dependency/licence table (no new library; the same-pin `viem` install disclosed); commit as `docs(tier1): document tier-1 architecture, demo and disclosures [ai]`. **Test**: every "implemented" row cites an evidence path; the demo script matches `quickstart.md` (SC-008, SC-009, FR-042).
- [ ] T059 [US3] Write the `docs/EXPLAIN.md` tier-1 flow in plain English (what a deal is, what the user trusts, what a pass proves and does not prove, what it costs) and add `docs/decisions.md` entries: single-contract choice, randomness source pending G03, budget numbers are estimates pending G05, deploy-less lens deferred, block size pending G04; commit as `docs(tier1): explain the storage flow and record decisions [ai]`. **Test**: the explainer states the "one block is not the whole file" limit, names the trusted components (constitution VI), and records the Tier 1 limit: a contract owner or provider that rejects incoming value can block its own payout and, through `resolve`, the counterparty's exit; Tier 1 assumes EOAs and pull payments are a Tier 2 item.

**Checkpoint**: US3 is independently verifiable from `evidence/tier1-results.md` alone.

---

## Phase 9: Polish and Gates

- [ ] T060 [P] Run a secret scan over every new artifact (the tier-0 `assertNoSecrets` rules plus a grep for key shapes and `.env` variable names), confirm zero findings, and save the output to `evidence/raw/t1/55-secret-scan.txt`; commit as `chore(tier1): verify no secrets in tier-1 artifacts [ai]`. **Test**: zero findings; a deliberate canary value in a scratch file is caught by the same scan.
- [ ] T061 [P] Verify scope: `git diff --stat` against `main` shows only tier-1 paths, `contracts/src/tier0/` is unchanged, `.specify/templates/` is unchanged, and no tier-0 probe was modified; save the output to `evidence/raw/t1/56-scope.txt`; commit as `chore(tier1): verify tier-1 scope boundaries [ai]`. **Test**: the diff contains no file outside `contracts/src/makhzan`, `contracts/test/makhzan`, `contracts/script/makhzan`, `apps/makhzan`, `packages/merkle-vectors`, `scripts`, `.github`, `evidence`, `specs/002-core-storage-proofs`, `README.md`, `docs`.
- [ ] T062 Run the final local gate exactly as the constitution requires and paste the real output into `evidence/raw/t1/57-final-local.txt`: `forge fmt --check`, `forge build --sizes`, `node scripts/check-size.mjs`, `forge test -vvv`, `forge snapshot --check`, `npm ci && npm run typecheck && npm test` (in both packages), `node packages/merkle-vectors/generate.ts --check`, `node apps/makhzan/scripts/e2e-local.mjs`; also assert no `NotImplemented` stub and no undocumented external function remains in `Makhzan.sol` (the scaffold error from T016 must be gone); commit as `chore(tier1): run final local gate [ai]`. **Test**: every command exits 0; the report names the exact commands and their real results.

**Checkpoint**: All local acceptance items (SC-001–SC-006, SC-010) are provable without live funds.

---

## Phase 10: `[LIVE]` — Portaldot Evidence (GATED)

**Gate (T063)**: this phase MUST NOT start until `evidence/` contains T0/G01, T0/G02, T0/G04 and
T0/G05 verdicts and the owner account is funded and can move value. Until then every task below is
`BLOCKED` and is rendered as such.

- [ ] T063 [LIVE] Verify the gate: read the recorded G01, G02, G04 and G05 verdicts and the owner funding evidence; assert that G07's measured implied factor equals `WEI_PER_UNIT = 10_000` and STOP if it does not; re-set `contracts/size-budget.json` and the budget table from the G05 numbers; if any verdict or the funding is missing, record each live task as `BLOCKED — <reason>` in `evidence/tier1-results.md` and stop without deploying; save the check to `evidence/raw/t1/58-live-gate.txt`; commit as `chore(tier1): check live gate preconditions [ai]`. **Test**: the gate is either satisfied with references or the phase is recorded blocked.
- [ ] T064 [LIVE] Deploy `Makhzan` to Portaldot V3 via `contracts/script/makhzan/Deploy.s.sol` with the fee policy from research.md D16, record the five statuses, the chain id, the deployed address and the measured deposit and size, and save it to `evidence/raw/t1/59-live-deploy.txt`; commit as `feat(tier1): deploy Makhzan to Portaldot testnet [ai]`. **Test**: `executed` is success, `finalized` is observed and the read-back matches.
- [ ] T065 [LIVE] Run the live passed round: register the provider, upload the 1 MiB file, create the deal, challenge, watch the daemon answer, and confirm the passed outcome with an unchanged bond; save the round record and hashes to `evidence/raw/t1/60-live-pass.txt`; commit as `feat(tier1): record live passed challenge [ai]`. **Test**: the challenge is passed and read back; if any step cannot be funded or the RPC fails, record the verbatim error and UTC time and mark the item blocked.
- [ ] T066 [LIVE] Run the live slashed round with the drill daemon (wrong or missing answer), resolve after the window, and confirm the bond fell by exactly 20% and the owner was credited; save the round record and hashes to `evidence/raw/t1/61-live-slash.txt`; commit as `feat(tier1): record live slashed challenge [ai]`. **Test**: SC-007 with transaction references, inclusion blocks, execution results, finality observations and read-backs.
- [ ] T067 [LIVE] Update `evidence/tier1-results.md` and the README rows that depend on live evidence with the live addresses and hashes, replacing the `BLOCKED` rows only where the evidence exists; commit as `docs(tier1): publish live tier-1 evidence [ai]`. **Test**: no row claims live evidence without a matching record.
- [ ] T068 Write the tier-1 checkpoint bundle to the sync folder (`/mnt/e/obsidian.md/SOLLY/makhzan-sync/002-core-storage-proofs/`) per the owner's checkpoint format, confirm no `.env` value appears in anything copied, push the branch and stop for the owner's "go". **Test**: the bundle validates with the same secret scan and contains `CHECKPOINT-T1.md`, spec, plan, tasks, the analyze report and the budgets table.

---

## Dependencies

```text
T001–T006 (setup) → T007–T015 (vectors, Merkle, verifier) → T016–T024 (US1) → T025–T033 (US2)
  → T034–T037 (invariants) → T038–T050 (TypeScript, US2) → T051–T054 (budgets) → T055–T059 (US3)
  → T060–T062 (polish) → T063 (live gate) → T064–T068 ([LIVE], T068 always runs)
```

- T007–T015 blocks every contract phase: without agreed vectors and a verifier, no proof can be
  accepted or tested.
- T034–T037 blocks the `[LIVE]` phase and the README rows that claim fund safety.
- T051–T054 blocks the `[LIVE]` phase: the budget must be enforceable before a paid deployment.
- T063 blocks T064–T067. T068 (checkpoint) runs whether the live phase ran or was blocked.
- No task in this list creates a second deployment, a UI, an agent, a vault or any token contract.

## Parallel Execution Examples

- **Setup**: T004, T005 and T006 touch different files and can be done together.
- **Foundational**: T008 (Solidity Merkle test) and T012 (TypeScript Merkle test) are separate files
  and can be written in parallel; T014 (verifier matrix) needs only the Merkle library.
- **US1**: T018 (registry test) and T020 (deals test) can be written in parallel; both must pass
  before T022's slot suite is meaningful.
- **US2**: T029 (payments test) can be written while T025's challenge implementation is still red.
- **Invariants**: T036 (boundary tests) is an independent file and can be written in parallel with
  T035's handler work.
- **TypeScript**: T038, T040, T042 and T044 are separate modules and suites; only T050's end-to-end
  run needs all of them.
- **US3**: T058 (README) and T059 (explanations) can be written in parallel, but both must read the
  final `evidence/tier1-results.md` before their last edit.

## Implementation Strategy

**MVP first**: T001–T033 (setup, shared vectors and verifier, US1 and US2 with tests) is the smallest
slice that proves bonded, challenged storage works locally. It satisfies the check-in's core claim
without any live dependency.

**Incremental delivery**: one task per commit, tests before their implementation, evidence committed
with the task, and the branch pushed after each commit group. Invariants, budgets and documents come
after the value paths they constrain, never before.

**Stop rules**: a red test that fails for the wrong reason (compile or setup error) is fixed before
the implementation task starts; an invariant violation stops the phase until the violating path is
fixed; a size overrun fails CI and needs a written justification; a missing live gate stops Phase 10
with a `blocked` record; a secret finding stops everything and is reported for rotation.

## Notes

- Every red run is committed before its implementation, satisfying Principle I and proving the tests
  were not written to fit the result.
- The `[LIVE]` tasks are the only tasks that touch the target network, and T063 is the only task
  allowed to decide whether they may start.
- The budget numbers are estimates until G05; the tasks that write them say so in the artifact.
