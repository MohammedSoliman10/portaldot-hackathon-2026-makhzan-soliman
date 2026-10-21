# Implementation Plan: Core Storage Proofs

**Branch**: `002-core-storage-proofs` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-core-storage-proofs/spec.md`

## Summary

Build one accountable storage protocol on Portaldot's EVM: a single deployed contract `Makhzan`
(provider registry, bonded deals, retrieval challenges, Merkle verification, escrowed payments), a
provider daemon that answers challenges, and a client CLI that chunks a file, builds the
commitment, uploads it and opens deals. The contract is a thin, packed, interface-backed core; the
Merkle verifier is an internal inlined library; reads are served by the contract's own getters plus
a generic slot reader, with a never-deployed Lens only if a recorded deploy-less `eth_call` check
passes. The result is proven locally first (unit, fuzz and invariant suites on `anvil`), with one
live passed challenge and one live slash recorded only after the Tier 0 gates and owner funding
gate are satisfied.

## Technical Context

**Language/Version**: Solidity `0.8.28` compiled for `evm_version = paris`; TypeScript on Node
`24.20.0` (LTS, native type stripping, no build step).

**Compiler settings**: `optimizer = true`, `optimizer_runs = 1`, `bytecode_hash = "none"`,
`cbor_metadata = false`. `via_ir` is **off** unless a measured build is smaller with it on, in which
case the measured saving is recorded in the budget entry. These pins replace the provisional
`optimizer_runs = 200` in `contracts/foundry.toml`; the compiler pin itself (`solc 0.8.28` / `paris`)
is confirmed or replaced by the Tier 0 compiler gate (G02) before live work. See `research.md` §D1.

**Primary Dependencies**: Foundry `1.8.5` (`forge`, `cast`, `anvil`); `forge-std` `1.17.0` (tests
only); `viem` `2.57.7`; `typescript` `5.9.3` and `@types/node` `24.19.2` as dev-only. No
OpenZeppelin import. No new runtime library is introduced: `viem` is already a pinned project
dependency and is pinned to the same exact version in the tier-1 package. See `research.md` §D17.

**Storage**: Filesystem and chain only. No database. Tier-1 evidence under `evidence/raw/t1/` and
`evidence/tier1-results.md`; the daemon and CLI keep a plain JSON state file under a gitignored path
(`apps/makhzan/.state/`), and the challenge index and all money stay on-chain. **No off-chain state
may be the source of truth for a payout.**

**Testing**: `forge test` for contract unit, fuzz and invariant suites (tests written before their
implementation, red output kept); `node --test` for the chunker, Merkle code, CLI and daemon;
shared golden vectors read by both sides; `forge snapshot` with a committed `.gas-snapshot` and a CI
`--check`; a size-budget script wired into CI. Local `anvil` (`--chain-id 420420777`) is the first
target for every run; the Portaldot V3 testnet is used only in the final `[LIVE]` phase.

**Target Platform**: Local Foundry node first, then Portaldot V3 testnet — EVM RPC
`https://test-evm-rpc-v3.portaldot.dev` (chain id `420420777`), native test currency tPOT with 14
decimals (G07). `msg.value` is 18-decimal wei; the contract stores native units (planck) with
`WEI_PER_UNIT = 10_000` `[assumption]` until G07's measured implied factor confirms it. Block time
assumed ~6 s; all deadlines are block counts.

**Project Type**: One deployed contract plus two headless TypeScript components (daemon and CLI).
No UI, no agent, no database.

**Performance Goals**: A challenge is answered within one block of detection; the daemon's poll
cycle is ≤ 1 block worth of wall time; verification of a 1 KiB leaf at the demo tree depth costs one
digit-multiple of a keccak call and must fit a single transaction (measured by the G04 gas matrix,
not assumed here). Demo: a 1 MiB file builds its tree and uploads in well under a minute locally.

**Constraints**:
- One deployed contract, `Makhzan`, behind `IMakhzan`; modularity is source-level (internal
  libraries + interface), not a second deployment. `resolve` and `settle` are permissionless;
  recipients are fixed by the deal, so a caller cannot redirect value. `challenge` stays owner-only;
  `claim` stays provider-only.
- `withdrawBond`, `claim`, `settle` and `resolve` use checks-effects-interactions, no
  reentrancy-guard slot, and revert on a failed transfer. Tier 1 assumes EOA recipients; a rejecting
  contract recipient can block its own payout and, through `resolve`, the counterparty's exit.
- Deployed runtime ≤ 10 KB; deal ≤ 3 slots; provider ≤ 2 slots; active challenge ≤ 1 reused slot;
  zero storage growth per challenge round. Budgets re-set from the storage-cost gate (G05).
- Native tPOT only, through `msg.value`. No token contract. Every incoming value is an exact
  multiple of `WEI_PER_UNIT = 10_000`; payouts multiply units by that constant; amounts are `uint64`
  units (cap ≈ 184,467 tPOT) and never carry dust.
- Every Solidity commit records `forge build --sizes` runtime bytes in its evidence file. If runtime
  exceeds 10,240 B, STOP and report instead of trimming features silently.
- Burner keys only, from environment variables, signed in-process by `viem`; never on argv, never
  logged. `apps/gates/src/config.ts` argv guards are reused.
- Evidence committed in small increments; no `.env` value in any artifact.
- Nothing live in the task list until the final `[LIVE]` phase, which is explicitly gated.
- Dependencies minimal, exact-pinned, disclosed with licences in the README.

**Scale/Scope**: ~1 contract (~9 KB runtime target, measured scratch skeleton 8,926 B), ~10 Solidity
test suites, ~3,000 lines of Solidity and TypeScript, ~1 daemon, ~1 CLI, ~1 CI workflow, 2 documents
of record, 1 Mermaid architecture diagram.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate for this feature | Status |
| --- | --- | --- |
| I. Tests Before Funds (NON-NEGOTIABLE) | `Makhzan` holds bonds and escrow: every value path (register, bond top-up/withdraw, create, claim, settle, slash) gets failing unit + fuzz + invariant tests before implementation, and test tasks precede implementation tasks in `tasks.md`. | PASS — enforced by task order; invariant suite is a blocking prerequisite to the `[LIVE]` phase |
| II. Small, Daily Commits | One commit per task, module by module; no core-module batching, nothing in the freeze window. | PASS |
| III. No Secrets (NON-NEGOTIABLE) | Keys from env only; `viem` signs in-process; argv guard reused from tier 0; evidence writer sanitises before write; a secret finding stops the run. | PASS |
| IV. Bounded Agent Authority | No agent in this tier. Payouts are decided on-chain by the verifier, never by a model or a daemon report; the daemon only submits answers. | PASS — N/A by scope, stated explicitly |
| V. Evidence Over Claims | Every claim cites a test result or a tx hash under `evidence/`; the README implemented/simulated/roadmap table is generated against those artifacts. | PASS — this is the feature |
| VI. Honesty About Limits | `docs/EXPLAIN.md` names the trusted components (chain randomness source, daemon availability) and states that a passed challenge proves possession of one block, not the whole file. | PASS |
| VII. Modular Design | Core sits behind `IMakhzan`; `BondLib` is the single seam for the bond asset — every credit, debit, slash and transfer of bond value goes through it, so replacing native tPOT with a token, or attaching an identity link, changes one library and no verification or challenge logic. Single deployment is justified under Complexity Tracking. | PASS |
| VIII. Untrusted Input | Every external value is validated before use: file sizes, leaf counts, path lengths, byte lengths, durations, prices, provider ids, daemon upload envelopes. Reject, never coerce. | PASS |
| IX. Local First, Live Second | All development and every acceptance test except SC-007 run on `anvil`; the live phase is last and gated. RPC outages are logged verbatim with UTC time and retried. | PASS |
| X. One Feature Per Tier | Only `specs/002-core-storage-proofs` and the tier-1 paths named here are touched; `.specify/templates/` untouched. Tier-0 probes are not modified. | PASS |
| XI. Disclosure | README gains the tier-1 rows, the AI-assistance marking for new code, and the dependency/licence table (no new library; one same-pin `viem` install in the new package). | PASS |
| XII. Explainability | `docs/EXPLAIN.md` gains a plain-English "store a file and challenge it" walkthrough: what the user trusts, what it costs, what a pass does and does not prove. | PASS |
| XIII. Reproducibility | `quickstart.md` takes a stranger from clone to a local passed challenge and a local slash with only the README. Golden vectors are generated by a committed command. | PASS |
| XIV. Privacy by Default | Only a file's commitment and byte size are stored on-chain; file contents go only to the provider the client chose. No agent memory, no personal data. Documented as a limit. | PASS |
| XV. Proofs Carry Bytes (NON-NEGOTIABLE) | `answer` takes the challenged bytes as calldata and hashes them on-chain; an empty payload or a payload of the wrong expected length is rejected; a hash-only answer is rejected by construction. | PASS — `contracts/merkle.md`, FR-014 |
| XVI. Merkle Hardening (NON-NEGOTIABLE) | `0x00` leaf prefix / `0x01` node prefix; leaf count committed in the deal and bound to the committed byte size; directions derived on-chain from the challenged index; odd node promoted explicitly; expected path length derived from committed values; a position-binding fuzz property proves `i ≠ j`. | PASS — `contracts/merkle.md`, FR-014–FR-017 |
| XVII. Reality Over Spec, and Checkpoint Discipline | The scratch size measurement, the unproven deploy-less `eth_call` check and the pending G03/G04/G05 verdicts are recorded as hypotheses; contradictions go to `docs/decisions.md` and the checkpoint; work stops after this stage. | PASS |

**Post-design re-check (Phase 1)**: unchanged. Design adds one deployment, no database, no UI and no
agent. The only size-affecting choice is the single-contract layout, justified below. Merkle rules
XV/XVI are implemented exactly as specified in `contracts/merkle.md`, and every budget is re-set
from G05 rather than asserted.

## Project Structure

### Documentation (this feature)

```text
specs/002-core-storage-proofs/
├── plan.md                  # This file
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
├── contracts/               # Phase 1 output (interface, layout, algorithms, run contracts)
│   ├── imakhzan.md          # Function, event and error surface
│   ├── storage-layout.md    # Slot map and budget arithmetic
│   ├── merkle.md            # Exact tree, path and verification rules (both sides)
│   ├── state-machine.md     # Deal/challenge/payment transitions
│   ├── cli-daemon.md        # CLI commands, daemon protocol, JSON state, discovery
│   ├── evidence-schema.md   # Tier-1 evidence record and status fields
│   └── size-budget.md       # CI size check and budget source
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
contracts/                              # Foundry project (existing root)
├── foundry.toml                        # pins updated: runs=1, bytecode_hash=none, cbor_metadata=false
├── size-budget.json                    # runtime byte budget + record slot budgets
├── src/makhzan/
│   ├── IMakhzan.sol                    # stable interface: deals, challenges, bonds, views, events, errors
│   ├── Makhzan.sol                     # single deployed core
│   └── lib/
│       ├── MerkleLib.sol               # internal library, inlined at compile time
│       ├── BondLib.sol                 # provider registry, bond accounting, exit guard
│       └── PayLib.sol                  # accrual, claim, settle, slash arithmetic
├── test/makhzan/
│   ├── MerkleLib.t.sol                 # unit + fuzz: root, path, promotion, position binding
│   ├── GoldenVectors.t.sol             # reads the shared vectors file
│   ├── Verifier.t.sol                  # answer accept/reject matrix (bytes, depth, order)
│   ├── Registry.t.sol                  # register, top-up, withdraw guards
│   ├── Deals.t.sol                     # create/validate/escrow, ids, duplicates
│   ├── Challenge.t.sol                 # open, deadline, pass, retry, timeout, double resolve
│   ├── Payments.t.sol                  # accrual, claim, settle, remainder, rounding
│   ├── StorageLayout.t.sol             # asserts 3 deal slots / 1 provider element / no challenge growth
│   └── invariant/MakhzanInvariant.t.sol# handler + 6 invariants (5 FR-041 + no-trapped-value)
├── test/fixtures/vectors.json          # generated; read by GoldenVectors.t.sol
├── script/makhzan/Deploy.s.sol         # local + live deploy script (no key on argv)
└── .gas-snapshot                       # committed forge snapshot

apps/makhzan/                           # TypeScript daemon + CLI (no UI)
├── package.json                        # same exact viem/TypeScript pins as apps/gates
├── tsconfig.json                       # strict, nodenext, noEmit, allowImportingTsExtensions
├── src/
│   ├── config.ts                       # env + chain definition, reuses apps/gates guards
│   ├── abi.ts                          # typed ABI for Makhzan
│   ├── merkle.ts                       # tree, path, verify (must match contracts/merkle.md)
│   ├── chunk.ts                        # challenge-block chunking (1 KiB, last partial)
│   ├── status.ts                       # five-state transaction pipeline + finality labelling
│   ├── state.ts                        # local JSON state, atomic writes
│   ├── upload.ts                       # client → daemon envelope, validation, ack
│   ├── daemon.ts                       # persist files, poll challenges, answer, record
│   ├── cli.ts                          # upload | create | challenge | watch | claim | settle | report
│   ├── errors.ts                       # custom error → human message map shared by CLI and daemon
│   └── evidenceWriter.ts               # thin wrapper over apps/gates/src/lib/evidence.ts
└── test/                               # node:test for merkle, chunk, status, state, cli, daemon

packages/merkle-vectors/
├── generate.ts                         # writes vectors.json (leaf counts 1, 3, 7, plus a 1000-leaf case)
└── vectors.json                        # committed golden vectors shared by both sides

scripts/check-size.mjs                  # CI: deployed size vs contracts/size-budget.json, nonzero on overrun
.github/workflows/ci.yml                # contracts job, typescript job, size + parity + snapshot checks

evidence/
├── tier1-results.md                    # rounds, hashes, read-backs, budget table, blocked items
└── raw/t1/                             # verbatim command output, receipts, status records
```

**Structure Decision**: The core lives in `contracts/src/makhzan/` so tier-0 probes under
`src/tier0/` stay disposable and untouched. Tier-1 TypeScript is a new `apps/makhzan/` package
because tier 0's rule is that its harness is disposable scaffolding and product code must not reuse
the `tier0` namespace; it imports the tier-0 evidence writer and transaction helpers by relative path
rather than copying them. The shared vectors live under `packages/merkle-vectors/` because they are
the one artifact both languages must agree on, and neither owns it. The size check lives in
`scripts/` because CI, not the contract, enforces the budget.

## Phase 0: Research (output: `research.md`)

All open technical choices are resolved there: compiler pins and size policy; single contract with
internal modules; packed storage layout and the measured budget; the Merkle scheme in full; the
challenge-selection source and its fallback; the payment and slash arithmetic; the evidence/status
pipeline and finality handling; challenge discovery by polling; CI composition; the size-budget
check; golden-vector generation; live-script fee policy; dependency pins and licences; and the
tier-1-specific note that this git worktree has an uninitialised `forge-std` submodule.

**No `NEEDS CLARIFICATION` marker remains.** The randomness source is deliberately *not* settled by
planning: the plan implements a documented selector with a reserve commit-reveal alternative and a
single swap point, per the specification's neutrality and the pending randomness gate.

## Phase 1: Design (outputs: `data-model.md`, `contracts/`, `quickstart.md`)

- `data-model.md`: Provider, Deal, Challenge (embedded in Deal), Escrow, Bond, Config; field tables
  with byte offsets and slot assignment; validation rules; lifecycle transitions; the five required
  invariants mapped to the code paths that can violate them.
- `contracts/imakhzan.md`: the external surface, including events and short custom errors, and the
  off-chain message mapping.
- `contracts/storage-layout.md`: the slot map and the arithmetic that keeps a deal at 3 slots, a
  provider at 2 slots and an active challenge at 0 new slots.
- `contracts/merkle.md`: the normative algorithm (prefixes, pairing, promotion, direction rule,
  expected path length, expected leaf length, position binding) plus worked vectors.
- `contracts/state-machine.md`: legal transitions and the guards that make an illegal transition
  revert, including at-most-one resolution and no-challenge-after-expiry.
- `contracts/cli-daemon.md`: commands, upload envelope and acknowledgement, polling discovery,
  JSON state schema, restart behaviour.
- `contracts/evidence-schema.md`: the record written per transaction and per round, with the
  five-state status and the finality field.
- `contracts/size-budget.md`: the budget file, the check, and the overrun-justification rule.
- `quickstart.md`: clone → toolchain → local deploy → upload/create/answer/slash → tests → CI.

## Cost and Footprint Budgets

Measured on a scratch project with the pinned settings (planning evidence only,
`/tmp/opencode/t1-notes/00-size-feasibility.txt`; to be reproduced inside the repo by the first
implementation tasks): a skeleton carrying every planned entry point and nine events compiled to
**8,926 B runtime** with a **3-slot deal**, verified by a slot probe test.

| Operation | Deployed bytes | Record slots | tPOT attributable to deposit (estimate) |
| --- | --- | --- | --- |
| One-time deploy + 1 config slot | 8,926 planning baseline; 5,523 B measured (DR-010) | 1 config | ≈ 722 (≈ 705 code + 13 contract + 3.9 config) |
| Register provider | — | 2 | ≈ 7.8 |
| Add to bond | — | 0 | — |
| Create deal | — | 3 | ≈ 11.7 |
| Open challenge | — | 0 new (reuses the deal's record slot) | — |
| Answer (pass) | — | 0 | — |
| Resolve (slash) | — | 0 | — |
| Claim / settle | — | 0 | — |
| Withdraw bond | — | −2 (cleared, refunded) | −7.8 if refunded |

Rates used are the reported chain numbers (0.079 tPOT per deployed byte, 13 tPOT per contract,
3.9 tPOT per new slot, slots refunded when cleared). **They are planning estimates and G05 must
confirm them**; the budgets in the spec are re-set from the confirmed numbers before the `[LIVE]`
phase. A conservative demo total with one provider, one deal and the single config slot is ≈ 741 tPOT
plus gas. The config slot is ≈ 3.9 tPOT at the planning rate.

Budget compliance so far: deal 3 ≤ 3; provider 1 element + 1 id entry = 2 ≤ 2; active challenge 0
≤ 1; per-round growth 0; runtime 8,926 ≤ 10,240 with a 1,314-byte margin that the real
implementation must defend (the skeleton omits a few validations and any lens; the unused admin and
pause flag were removed under DR-010, which frees 19 runtime bytes).
Overrun policy: `contracts/size-budget.json` is the single source of the number, CI fails the build
on overrun, and any accepted overrun requires a written justification in this plan's Complexity
Tracking plus an owner-approved budget change.

## Live Phase Gate

The `[LIVE]` phase tasks are marked `[LIVE]` and MUST NOT start until all of the following are
recorded in `evidence/`:

1. Tier 0 G01 verdict: a successful deployment and call on the target chain, with the working
   compiler path and flags.
2. Tier 0 G02 verdict: the pinned compiler and `evm_version` confirmed on the live chain.
3. Tier 0 G04 verdict: the challenge block size fixed, with the arithmetic.
4. Tier 0 G05 verdict: the real code-deposit and slot-deposit numbers, and the budgets re-set.
5. The owner account is funded and can move value (the funding gate), and the five remaining
   accounts are available for providers.

Until then, live tasks are `blocked` and every local acceptance item is still provable.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Runtime exceeds 10 KB once validation and the challenge/payment paths land | Keep events minimal and use auto-generated getters; `runs=1`; custom errors; measure at every commit; if still over, shrink the read surface before touching verification logic, and record a justification |
| Randomness source unusable (constant `prevrandao`/unreadable parent hash) | Selector is one internal function with a reserve commit-reveal path; the gate verdict picks, the spec stays neutral, the change is recorded in `docs/decisions.md` |
| Public RPC prunes history | Challenge discovery polls current state only; no `eth_getLogs` history; daemon records the block hash of every observation |
| Finality is not exposed by the RPC | `status.ts` tries the `finalized` block tag; if absent it labels the observation as a confirmation heuristic with its depth, and no payout decision depends on it |
| Live deposit exceeds faucet funds | Budgets are computed before the live phase and compared with the funded balance; if insufficient, the live phase is reported `blocked` with the shortfall, not faked with a smaller demo |
| `forge-std` submodule absent in this worktree | First setup task initialises submodules locally (`git submodule update --init --recursive`) and records the command; nothing about the submodule is committed |
| `viem` installed twice (gates + makhzan) | Same exact pin, disclosed in the README, and the tier-1 package imports tier-0 helpers by path; no version skew possible |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| One contract holds bonds, escrow and verification (Principle VII asks for modular, swappable parts) | A single deployment keeps the live code-deposit cost near the 10 KB budget and avoids cross-contract calls on a gas model that is still being measured (G04/G05). Modularity is delivered at source level: `IMakhzan` is the stable surface, `MerkleLib` and `PayLib` are separate internal libraries, and **`BondLib` is the bond-asset seam** — it owns the bond ledger, the exit guard and every value movement for bonds, so replacing native tPOT with a token asset (or adding an identity check) is a change to that one library with no edit to verification, challenge or payment code. The asset type is deliberately not exposed through `IMakhzan`. | A registry/bond contract plus a challenge contract plus a payment contract would multiply the per-contract deposit (≈ 13 tPOT each) and the deployed-byte budget, and would turn a local invariant (conservation of funds) into a cross-contract one before the chain's cost model is known. |
| `optimizer_runs = 1` (worst execution gas, smallest code) | Deployed bytes are charged to the operator and are a published budget; execution gas is paid by the caller per operation and is not the binding constraint at demo volume. | `runs = 200` (tier-0 default) produces larger runtime code for a call-frequency assumption the demo does not need; it is likely to breach the 10 KB budget. |

No other constitution violations. The budgets are re-set from G05 before any live claim, so the
estimates in this plan are labelled as estimates everywhere they appear.

## Phase Gates and Dependency Order

```text
toolchain + submodule + pins (setup)
  └─ shared vectors + MerkleLib + TS merkle  (both sides agree first)
       └─ verifier (answer accept/reject)
            ├─ registry + bond
            │    └─ deals + escrow
            │         └─ challenge / answer / resolve / slash
            │              └─ payments (claim / settle)
            │                   └─ invariants over all value paths
            └─ TypeScript chunker / CLI / daemon
                 └─ size + gas budget checks
                      └─ README + diagram + demo script
                           └─ [LIVE] phase (gated on G01, G02, G04, G05 + funding)
```

Every arrow is a task dependency in `tasks.md`; a task is committed on its own and pushes after its
commit group.

**Output**: research.md, data-model.md, contracts/, quickstart.md
