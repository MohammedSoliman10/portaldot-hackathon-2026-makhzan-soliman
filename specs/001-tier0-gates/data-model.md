# Data Model: Tier 0 Chain Gates

**Feature**: `001-tier0-gates` | **Date**: 2026-10-20

All records are files. There is no database and no server. Every entity below maps to a JSON object
or a file on disk, and every validation rule is enforced by `apps/gates/src/lib/evidence.ts` before a
file is written.

## Entity overview

```text
StartingFact ──verifiedBy──> Gate ──produces──> GateRecord ──cites──> EvidenceArtifact
                               │                     │
                               │                     ├──< CostMeasurement
                               │                     ├──< TransactionRef
                               │                     └──< ErrorRecord
                               │
                               └──< ProbeEntry (from the daemon, referenced by time window)
BurnerAccount ──has──> AccountMapping ──measuredBy──> Gate G07
GateRecord ──classifiedAs──> Classification ──writtenTo──> DecisionEntry
```

## StartingFact

A claim supplied with the brief, held as unverified until a gate evidences it.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | `SF-01` … `SF-08`, unique |
| `claim` | string | the claim as stated, not paraphrased into truth |
| `source` | string | `owner-brief` or `observed` |
| `status` | enum | `unverified`, `confirmed`, `corrected`, `unconfirmed` |
| `observedValue` | string \| null | required when `status` is `confirmed` or `corrected` |
| `evidenceRef` | string \| null | required when `status` is not `unverified` |
| `gate` | string | `G01`…`G10` that touches this fact |

Validation: a fact may not be `confirmed` without an `evidenceRef` that resolves to a file under
`evidence/`. A `corrected` fact must state both the claim and the observed value so the contradiction
survives in the record.

Starting facts to carry: chain ID, EVM RPC URL, node WS URL, token name and decimals, presence of
pallet-revive and pallet-contracts, address-mapping requirement, faucet behavior.

## Gate

The static description of one question and its measurement procedure.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | `G01`…`G10`, matches the brief |
| `order` | integer | 1…10 in the brief's order (G10 first) |
| `title` | string | short label, e.g. "Deploy and call a trivial contract" |
| `question` | string | one sentence ending in `?` |
| `assumption` | string | the belief the gate tests |
| `requiredMeasurements` | string[] | at least one; each becomes a check in the record |
| `optional` | boolean | true for G09 only |
| `haltOnHardFailure` | boolean | true for G01 only |

Validation: order values are unique and contiguous; `optional` is true only for `G09`; G10 has
order 1. The static registry lives in `apps/gates/src/gates/registry.ts`, and both the validator and
`rollup` read it from there so ids, order and required measurements have one source.

## GateRecord

One JSON file per gate at `evidence/gates/<id-lowercase>.json` (for example `g07.json`).

| Field | Type | Rules |
| --- | --- | --- |
| `gateId` | string | matches a Gate (`G01`…`G10`) |
| `runState` | enum | `done`, `blocked`, `not_run` |
| `verdict` | enum \| null | `PASS`, `PARTIAL`, `FAIL`; required when `runState` is `done`, null otherwise |
| `reason` | string \| null | required when `runState` is `blocked` or `not_run`; why the gate could not run |
| `startedAt` | string | ISO-8601 UTC, e.g. `2026-10-20T09:14:02Z` |
| `finishedAt` | string | ISO-8601 UTC, not before `startedAt`; for `not_run` equals the halt time |
| `endpoint` | string | RPC URL used, no credentials |
| `chainIdObserved` | string \| null | decimal string as returned |
| `commands` | CommandRef[] | at least one for `done`, may be empty for `not_run` |
| `measurements` | CostMeasurement[] | may be empty only for blocked or not-run gates |
| `transactions` | TransactionRef[] | required for gates that send transactions |
| `errors` | ErrorRecord[] | required when any command failed |
| `verdictReason` | string \| null | required when `runState` is `done`; states why this verdict rather than another |
| `classification` | enum \| null | `FALLBACK-TRIGGER`, `DESIGN-CHANGE`, null when PASS or when not `done` |
| `adaptation` | string \| null | required when classification is `DESIGN-CHANGE` |
| `evidenceFiles` | string[] | paths under `evidence/`, must exist |

Validation:
- `runState` is the primary state. A record without `runState` is malformed and is rejected by
  `validate`; there is no default.
- `done` requires a non-null `verdict` from `PASS`, `PARTIAL`, `FAIL`.
- `blocked` and `not_run` require a non-empty `reason` and MUST NOT carry a verdict. A gate that could
  not run because the RPC, the funds or an upstream gate was unavailable is `blocked`, never `FAIL`.
- `verdict` values follow the clarified boundary: PASS requires every required measurement present;
  PARTIAL requires a stated caveat or missing measurement; FAIL requires the assumption to be
  disproved.
- `classification` must be null unless `runState` is `done` and `verdict` is `PARTIAL` or `FAIL`.
- A `FALLBACK-TRIGGER` may only be used for the five conditions in the brief; the record carries the
  matched condition in `verdictReason`.
- `adaptation` is mandatory for `DESIGN-CHANGE`.
- A `not_run` record is emitted only when the sequence halts; every gate after the halt gets one, with
  `reason` naming the halted gate.

## CommandRef

| Field | Type | Rules |
| --- | --- | --- |
| `command` | string | exact command as run, env var names only, no values |
| `cwd` | string | repo-relative |
| `exitCode` | integer | 0 or non-zero |
| `rawOutput` | string | path under `evidence/raw/` |
| `ranAt` | string | ISO-8601 UTC |

Validation: `command` is rejected if it contains `PRIVATE_KEY=`, `0x` followed by 64 hex characters,
or any loaded secret value.

## CostMeasurement

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | e.g. `keccak-4KiB`, `merkle-depth-14-leaf-1KiB` |
| `value` | number | non-negative |
| `unit` | enum | `gas`, `wei`, `tPOT`, `ms`, `bytes`, `count` |
| `method` | enum | `estimateGas`, `receipt`, `differential`, `substrate-query`, `direct` |
| `conditions` | object | depth, leaf size, payload size, timestamp as applicable |
| `txRef` | string \| null | required when `method` is `receipt` |

Validation: `method` is always recorded; a measurement without a method is rejected, because
numbers produced by different methods are not comparable.

## TransactionRef

| Field | Type | Rules |
| --- | --- | --- |
| `hash` | string | `0x` + 64 hex |
| `kind` | enum | `deploy`, `call`, `transfer`, `extrinsic` |
| `from` | string | address, never a key |
| `to` | string \| null | null for deploys |
| `blockNumber` | number \| null | null until mined |
| `status` | enum | `pending`, `success`, `reverted` |
| `explorerUrl` | string \| null | null when no explorer exists |
| `receiptPath` | string \| null | raw receipt under `evidence/raw/` |

## ErrorRecord

| Field | Type | Rules |
| --- | --- | --- |
| `at` | string | ISO-8601 UTC |
| `context` | string | what was being attempted |
| `verbatim` | string | unchanged error text, no rewriting |
| `kind` | enum | `rpc-unreachable`, `rejected`, `reverted`, `timeout`, `parse` |

Validation: `verbatim` must be non-empty and must not be replaced with a summary; summaries go in
`context`.

## ProbeEntry

One JSON Lines record in `evidence/rpc-log/<YYYY-MM-DD>.jsonl`.

| Field | Type | Rules |
| --- | --- | --- |
| `at` | string | ISO-8601 UTC, second precision |
| `evm.ok` | boolean | reachability |
| `evm.latencyMs` | number \| null | null on failure |
| `evm.chainId` | string \| null | decimal |
| `evm.blockNumber` | number \| null | |
| `evm.error` | string \| null | verbatim, required when not ok |
| `ws.ok` | boolean | |
| `ws.latencyMs` | number \| null | |
| `ws.bestBlock` | number \| null | |
| `ws.error` | string \| null | verbatim |

Validation: exactly one of `ok`/`error` is populated per side. Files are append-only; no line is
edited after write. A missing interval is a gap and is reported, never backfilled.

State: a day file moves `open` → `sealed` at UTC midnight; sealed files are never modified.

## BurnerAccount

| Field | Type | Rules |
| --- | --- | --- |
| `role` | enum | `provider-1`…`provider-4`, `vault-agent`, `owner` |
| `ss58` | string | public address only |
| `evm` | string \| null | mapped H160, null until mapping is proven |
| `nativeBalance` | string | planck string, as returned |
| `evmBalance` | string \| null | wei string, as returned |
| `mapped` | boolean | true only after `map_account` succeeds and is evidenced |
| `fundedAt` | string \| null | ISO-8601 UTC |
| `keyOrigin` | string | always `local-.env-600`; keys are generated locally, never imported |

Validation: never stores a private key, mnemonic, seed or keystore. Six entries exactly, one per
role. The key file is gitignored and mode 600; the keygen step prints only public addresses and
refuses to overwrite an existing `.env`.

## AccountMapping

| Field | Type | Rules |
| --- | --- | --- |
| `ss58` | string | source account |
| `evm` | string | H160 |
| `method` | string | e.g. `pallet_revive.map_account` |
| `txRef` | string | extrinsic hash |
| `nativeBalance` | string | before and after recorded in `measurements` |
| `evmBalance` | string | |
| `impliedFactor` | string | decimal string, e.g. `10000` |
| `msgValueSeen` | string \| null | value observed by a contract call |
| `workedExample` | object | `{native, evm, sentValue, receivedValue}` |
| `faucetAddress` | string | the SS58 address the faucet must pay, with the candidate rule that produced it |
| `candidateEvidence` | object | `{fallbackAccount, mappedAccount, metadataSource, chosen}`, each with the observed value |

Validation: `impliedFactor` must be derived from the observed balances, not from docs; the
worked example must use a realistic magnitude for a deal bond. `faucetAddress` must be chosen from
inspected runtime metadata and recorded candidates, never guessed; funds are not requested until it
is written down.

## ChallengeBlockRecommendation

| Field | Type | Rules |
| --- | --- | --- |
| `blockSizeBytes` | number | within 1024…4096 |
| `leafCount` | number | consistent with block size and deal size |
| `depth` | number | one of the measured depths |
| `maxResponseBytes` | number | measured calldata ceiling |
| `verificationGas` | number | measured at the chosen size/depth |
| `roundCost` | number | measured issue + answer + resolve |
| `marginPct` | number | stated headroom against both size and gas limits |
| `arithmetic` | string | the inequality that produced the choice |
| `fallbackTriggered` | boolean | true if nothing in range fits |

Validation: `blockSizeBytes` must be the largest measured size that satisfies both limits with the
stated margin; the arithmetic must reference measured values by `name`.

## Classification

| Value | Allowed when |
| --- | --- |
| `FALLBACK-TRIGGER` | a `done` gate meets one of: no deploy after two toolchain attempts / 48h; no usable funds by 2026-10-21 after asking admins; RPC unusable several consecutive days; value/state unreliable; smallest Merkle proof cannot be verified within limits |
| `DESIGN-CHANGE` | any other `done` gate with a non-passing verdict, with a written adaptation |

Validation: the five fallback conditions are enumerated in one place in code; a record claiming
`FALLBACK-TRIGGER` must match one by id. Blocked and not-run gates carry no classification; they carry
a reason.

## DecisionEntry

One entry in `docs/decisions.md`.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | `D-001` upward, never reused |
| `date` | string | ISO date |
| `assumption` | string | what was believed |
| `finding` | string | what was observed |
| `evidenceRef` | string | gate record or raw file |
| `consequence` | string | what changes in the design, or "none" |
| `status` | enum | `confirmed`, `contradicted`, `unconfirmed` |

Validation: every `done` gate with a non-passing verdict produces at least one entry; a
`contradicted` entry must name the adaptation or the fallback condition.

## State transitions

```text
Gate: pending → running → done(verdict) | blocked(reason)
       blocked → running (retry) → done(verdict)
       pending → not_run(reason) when an earlier gate halts the sequence
done(PARTIAL|FAIL) → classified → DecisionEntry written → results table updated
Probe day file: open → sealed (UTC midnight)
BurnerAccount: created → funded → mapped (irreversible in this tier)
```

Rules:
- `runState` is the authoritative state; a `done` record always has a verdict, and `blocked`/`not_run`
  records never do.
- A blocked gate may be retried; a completed gate is never moved back to `running`. A rerun writes a
  new record with a new timestamp and keeps the previous file as `gxx.<timestamp>.json`.
- `FAIL` on G01 halts the sequence (FR-009); every later gate receives a `not_run` record naming G01
  as the halt point, so `rollup` can still render a full table.
- The results table is derived from the records; it is never edited by hand to disagree with them.
