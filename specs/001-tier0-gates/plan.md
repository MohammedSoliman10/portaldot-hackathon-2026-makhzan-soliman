# Implementation Plan: Tier 0 Chain Gates

**Branch**: `001-tier0-gates` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-tier0-gates/spec.md`

## Summary

Build a measurement harness that answers ten questions about the Portaldot V3 testnet with committed
evidence, before any Makhzan product code exists. The harness is one Foundry project of disposable
probe contracts plus one TypeScript CLI in which each gate is a single command that writes a JSON
record and a raw log. A background probe runs from the first minute and keeps logging reachability,
latency and block height every three minutes. The output is a gate table in
`evidence/tier0-results.md`, a decision record in `docs/decisions.md`, and a recommended challenge
block size derived from measured payload and verification costs.

No product contract, provider daemon, UI or agent is built. Every probe contract is disposable and
is labelled as tier-0 scaffolding.

## Technical Context

**Language/Version**: Solidity (compiled with the path proven in G2; `solc` pinned provisionally at
`0.8.28`, `evm_version = paris`, re-pinned or replaced by `resolc` after G2), TypeScript on Node
`24.20.0` (LTS, native type stripping — no build step)

**Primary Dependencies**: Foundry `1.8.5` (`forge`, `cast`, `anvil`); `viem` (pinned exact) for
EVM RPC, signing and keccak; `@polkadot/api` (pinned exact) for the Substrate side and
`pallet_revive`/`identity`/`assets` extrinsics; `@polkadot/util-crypto` (pinned exact) for SS58
handling; `typescript` as a dev-only dependency for `tsc --noEmit`. Node's built-in `fetch`,
`WebSocket` and `node:test` cover HTTP, WS and unit tests, so no HTTP, WS or test-runner package is
added.

**Storage**: Filesystem only. JSON gate records under `evidence/gates/`, raw command output under
`evidence/raw/<gate>/`, JSON Lines probe logs under `evidence/rpc-log/<YYYY-MM-DD>.jsonl`. No
database.

**Testing**: `forge test` for probe contracts (unit and fuzz, written before the probes) and
`node --test` for evidence/schema validators. Live gate runs are manual, one command per gate, and
each run is captured verbatim.

**Target Platform**: Portaldot V3 testnet — EVM RPC `https://test-evm-rpc-v3.portaldot.dev`
(chain ID claimed `420420777`) and Substrate WS `wss://test-node-v3.portaldot.dev`. Local `anvil`
is used to develop and debug every probe before it is pointed at the testnet.

**Project Type**: Measurement harness — disposable probe contracts plus a CLI of gate scripts.

**Performance Goals**: Each gate completes in minutes, not hours, except G4's payload ladder and the
30-block randomness sampling. The probe daemon holds a steady 3-minute cadence with sub-second
overhead per tick.

**Constraints**:
- Burner keys only, read from environment variables, signed in-process by `viem` — never passed as
  command-line flags, never logged.
- Evidence committed in small increments as each gate finishes.
- RPC outages: record the verbatim error and UTC time, keep working locally, retry later.
- Stop and report on the first hard failure of G1 (two toolchain attempts / 48h per FR-009).
- No product features; no WASM/ink!; no frontend; no database.
- Dependencies minimal, pinned exact, and disclosed in the README with versions and licences.

**Scale/Scope**: 10 gates, 6 burner accounts, ~380 `forge`/`cast`/CLI invocations, ~5 disposable
probe contracts, 1 background daemon, 2 documents of record.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate for this feature | Status |
| --- | --- | --- |
| I. Tests Before Funds | Probe contracts that accept value (G2 transfer, G4/G6 cost probes) get `forge` unit + fuzz tests written and failing before implementation. No product custody exists in this tier. | PASS — planned, task order enforced |
| II. Small, Daily Commits | One commit per gate plus one for skeleton, probe daemon and documents. | PASS |
| III. No Secrets | Keys from env only; `viem` signs in-process; evidence sanitizer rejects known env values before commit; no `--private-key` on any recorded command. | PASS |
| IV. Bounded Agent Authority | No agent and no custody in this tier; nothing can authorize a payout. | PASS — N/A by scope |
| V. Evidence Over Claims | Every verdict cites a committed JSON record, raw output and tx hash; results doc mirrors the records. | PASS — this is the feature |
| VI. Honesty About Limits | Results doc separates possible / not possible / design change; unverified starting facts are marked unconfirmed. | PASS |
| VII. Modular Design | No product contracts, so `IMakhzan` does not apply yet. Probes stay isolated under `contracts/src/tier0/`. | PASS — N/A by scope |
| VIII. Untrusted Input | All RPC and Substrate responses are validated (shape, type, range) before being written into evidence; decimal and hex parsing is explicit. | PASS |
| IX. Local First, Live Second | Every probe runs on `anvil` first; live runs happen only because the gates are questions about the live chain. Outages are logged, not worked around. | PASS |
| X. One Feature Per Tier | Only `specs/001-tier0-gates` is touched; `.specify/` templates untouched. | PASS |
| XI. Disclosure | README dependency table updated with `viem`, `@polkadot/api`, `@polkadot/util-crypto`, `typescript`, Foundry and their licences; AI-assisted marking maintained. | PASS |
| XII. Explainability | No user-visible product flow exists in this tier, so `docs/EXPLAIN.md` gains only a short "how we verified the chain" section at checkpoint time. | PASS — limited scope |
| XIII. Reproducibility | `quickstart.md` gives a stranger the install, env, probe and per-gate commands, and each gate record names its exact command. | PASS |
| XIV. Privacy by Default | No agent memory, no personal data stored. | PASS — N/A by scope |
| XV. Proofs Carry Bytes | The G4 Merkle probe takes the challenged leaf bytes as calldata and verifies them; a hash-only path is never accepted, and the measured "largest response" includes the bytes. | PASS |
| XVI. Merkle Hardening | G4 probe uses `0x00`-prefixed leaves and `0x01`-prefixed nodes, commits the leaf count, derives path directions on-chain from the index, handles odd nodes by promotion, and a position-binding test proves a proof for `i` fails for `j`. | PASS |
| XVII. Reality Over Spec | Starting facts are recorded as unverified; contradictions go to `docs/decisions.md` and the checkpoint. | PASS |

No violations, so Complexity Tracking stays empty.

**Post-design re-check (Phase 1)**: unchanged. The design adds no custody beyond disposable probes,
no database, no frontend and no agent. The only new dependency surface (`viem`, `@polkadot/api`,
`@polkadot/util-crypto`, `typescript`) is disclosed in `research.md` §D14 and will be mirrored in the
README during implementation. Merkle rules XV and XVI are implemented in the probe per
`research.md` §D8.

## Project Structure

### Documentation (this feature)

```text
specs/001-tier0-gates/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (interface contracts, not Solidity)
│   ├── gate-cli.md      # Command surface, exit codes, output paths
│   ├── evidence-schema.md  # JSON record + probe log schemas
│   └── results-format.md   # Gate table + decision record requirements
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
contracts/                      # Foundry project root
├── foundry.toml                # evm_version = paris; solc pinned after G2
├── src/tier0/                  # disposable probes, deleted or quarantined before product tier
│   ├── BehaviorProbe.sol       # G2: storage, events, revert, value, time, block number
│   ├── HashCostProbe.sol       # G4b: keccak over 1/4/16/64 KiB
│   ├── MerkleProbe.sol         # G4c: domain-separated root + byte-carrying verification
│   ├── StorageProbe.sol        # G5: deal-record deposit and marginal slot cost
│   ├── ChallengeProbe.sol      # G6: issue / answer / resolve cost
│   └── SizeProbe.sol           # G2: deployment size ladder
├── test/tier0/                 # unit + fuzz tests, written first
└── script/tier0/               # forge script deploys (no key on argv)

apps/gates/                     # TypeScript harness (CLI, no UI)
├── package.json                # exact-pinned deps
├── tsconfig.json
├── src/
│   ├── config.ts               # env loading, chain definition, guards
│   ├── lib/
│   │   ├── evm.ts              # viem client, signing, tx helpers
│   │   ├── substrate.ts        # @polkadot/api connection, extrinsics
│   │   ├── evidence.ts         # record writer, sanitizer, schema checks
│   │   └── measure.ts          # gas ladder helpers, estimate/receipt fallback
│   ├── probe/daemon.ts         # G10 background probe
│   └── gates/g01..g10.ts       # one entry point per gate
└── test/                       # node:test for validators and formatting

evidence/
├── tier0-results.md            # gate table + possible/not possible/design change
├── gates/G01.json … G10.json   # one machine-readable record per gate
├── raw/<gate>/                 # verbatim command output, tx receipts
└── rpc-log/YYYY-MM-DD.jsonl    # G10 daily JSON Lines

docs/
└── decisions.md                # verified/contradicted assumptions + consequences
```

**Structure Decision**: `contracts/` was reserved for Solidity from the first commit, so the Foundry
project lives there and tier-0 probes are namespaced under `src/tier0/` to keep them separable from
future product contracts. Gate scripts live in `apps/gates/` as a headless CLI: `apps/` already
exists for non-contract code, and keeping the harness out of `packages/` avoids implying it is a
reusable library. Evidence is committed under `evidence/` as the constitution requires, with one
JSON record per gate and raw output beside it so a verdict can be re-read without re-running
anything.

## Complexity Tracking

No constitution violations; this section is intentionally empty.
