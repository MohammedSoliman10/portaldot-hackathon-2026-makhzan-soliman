# Draft Evidence Schema — `makhzan.evidence/v0`

**Feature**: `003-status-ui` | **Status**: draft, implementation publishes it as `docs/evidence-schema.md`
**Source of truth for the fixture**: `specs/003-status-ui/contracts/fixture-local-anvil.json`

The web app is evidence-first: one versioned JSON file is the base layer that renders even when no RPC
answers. This document is the contract between the evidence writer and the app. It is deliberately
narrow: anything not listed here is rejected rather than ignored.

## Storage and versioning

```text
apps/status-ui/public/evidence/index.json          # manifest (current file, SHA-256)
apps/status-ui/public/evidence/local-anvil-2026-10-23.json
```

`index.json`:

```json
{
  "schema": "makhzan.evidence-index/v0",
  "current": "local-anvil-2026-10-23",
  "files": [
    {
      "id": "local-anvil-2026-10-23",
      "url": "/evidence/local-anvil-2026-10-23.json",
      "sha256": "0x…",
      "environment": "anvil-local",
      "generatedAt": "2026-10-23T08:21:15Z"
    }
  ]
}
```

Rules:

1. Evidence files are immutable. A new run adds a file and updates `current`; it never edits an old one.
2. The app fetches the manifest, fetches the current file, computes SHA-256 over the exact bytes and
   compares it with the manifest. A mismatch is a visible warning; the data stays readable but is
   marked unverified.
3. A missing manifest or file is an evidence notice, never a blank page.
4. The schema version is part of the file. An unknown version is rejected; no best-effort parsing.

## Top-level shape

All keys are required, and no others are allowed.

| Key | Type | Rule |
| --- | --- | --- |
| `schema` | string | exactly `makhzan.evidence/v0` |
| `id` | string | matches the manifest entry, `[a-z0-9-]+` |
| `environment` | string | `anvil-local` or `portaldot-testnet` |
| `label` | string | exactly `REPORTED`; the file's values are reported, never measured |
| `generatedAt` | string | ISO-8601 UTC, ends in `Z` |
| `source` | string | repository-relative path of the raw evidence file |
| `chain` | object | see below |
| `timing` | object | see below |
| `deployment` | object | see below |
| `config` | object | see below |
| `providers` | array | 0–64 entries |
| `deals` | array | 0–256 entries |
| `rounds` | array | 0–256 entries |
| `transactions` | array | 0–256 entries |
| `retrieval` | object or `null` | optional; see below. Absent or `null` means the run recorded no retrieval |
| `refusals` | array | 0–256 entries |
| `limits` | array of strings | 1–16 entries, each ≤ 280 characters |

Strings are limited to 280 characters unless stated. Addresses are `0x` + 40 hex characters. Hashes are
`0x` + 64 hex characters. Amounts are decimal strings of native units; `wei` amounts are decimal
strings of wei. Blocks are non-negative safe integers.

### `chain`

```json
{ "chainId": 420420777, "name": "anvil (local)", "rpcHost": "127.0.0.1:8564",
  "explorer": null, "explorerNote": "local anvil has no explorer" }
```

`chainId` must be a positive safe integer. `explorer` is `https://…` or `null`; when null the UI shows
"no explorer configured" and never fabricates a link.

### `timing`

```json
{ "blockTimeSeconds": 1, "basis": "node-default", "source": "evidence/raw/t1/87-e2e-process.txt" }
```

`basis` is one of `measured`, `node-default`, `assumption`. Only `measured` may be shown as a
measured block time. The fixture uses `node-default`, so every accrual tick is `SIMULATED` and the
replay is indexed by block number.

### `deployment`

```json
{
  "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "txHash": "0xc64eb00add8705bfc73238fef584584b3e9938796c2bfc518cacacd6f1fb66f2",
  "block": 1,
  "codeHash": "0x115036eac836fca78bef7824fb0d0834ccf3d9d7f9663fe154c36e91f7d26a98",
  "runtimeBytes": 6566,
  "creationBytes": 7154,
  "compiler": "solc 0.8.28, via_ir, optimizer runs 1",
  "codeVerified": {
    "method": "runtime-code-hash",
    "sourceVerified": false,
    "artifact": "contracts/out/Makhzan.sol/Makhzan.json",
    "note": "runtime length and code hash matched the artifact at deploy time"
  }
}
```

`codeVerified.method` is `runtime-code-hash` or `none`. `sourceVerified` must be `false` unless an
explorer actually verified the source; the local fixture has no explorer. The UI must not print
"verified contract".

### `config`

```json
{
  "challengeWindowBlocks": 10,
  "challengeBlockSize": 1024,
  "slashBps": 2000,
  "minBondUnits": "10000000000000000",
  "nextDealId": 3,
  "providerCount": 1,
  "minDurationBlocks": 10,
  "maxDurationBlocks": 1000,
  "slot0": "0x0000000003e80000000a000100000003002386f26fc1000007d004000000000a"
}
```

`slot0` is the raw packed value of storage slot 0, least-significant byte first for the first field:
`challengeWindow (4) | challengeBlockSize (2) | slashBps (2) | minBond (8) | nextDealId (4) |
providerCount (2) | minDurationBlocks (4) | maxDurationBlocks (4)` = 30 bytes. `slot0` must be exactly
32 bytes and must decode to the named fields; a disagreement is a schema error.

### `providers[]`

```json
{ "id": 1, "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "bondUnits": "8000000000000000", "activeDeals": 0, "registered": true }
```

### `deals[]`

```json
{
  "id": 2, "owner": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "providerId": 1,
  "root": "0xd6bcfc4d0c933f0680ec2e7b1c0ea8aecba797de45bf726ae0ca4c8c286325b7",
  "leafCount": 8, "size": 8192, "blockSize": 1024,
  "startBlock": 34, "endBlock": 54,
  "priceUnits": "5000000000000000", "claimedUnits": "5000000000000000",
  "flags": 1, "state": "settled", "health": 0, "roundIds": [2]
}
```

`state` is `active | expired | settled`, derived from `flags` and the end block by the evidence writer.
`health` is `0..3`, or `null` when the run did not read `healthOf`; `null` is rendered as "not recorded
by the run", never as healthy and never as zero. `roundIds` must reference rounds.

### `rounds[]`

```json
{
  "id": 2, "dealId": 2, "outcome": "slashed", "status": "failed",
  "index": 1, "startBlock": 35, "deadline": 45, "expectedPathLength": 3,
  "challengeTx": "0x3d957e93adb353a444daeedd3839053cfec30c450067960737d3eb28bc8a6f09",
  "answerTx": null, "resolveTx": "0x9ec3e2ffbc6c9d0861be8334c0d67756ab2b87a6670002bbabad586b2d706d18",
  "bondBeforeUnits": "10000000000000000", "bondAfterUnits": "8000000000000000",
  "slashUnits": "2000000000000000", "ownerCreditWei": "20000000000000000000",
  "readBack": { "challengeOpenAfter": false, "bondAfterUnits": "8000000000000000" },
  "note": "daemon ran in skip drill; resolve performed by the provider, owner credited"
}
```

`status` uses the five round labels: `pending | submitted | passed | failed | unanswered`.
`outcome` is `passed | slashed`. A `passed` status requires `readBack.challengeOpenAfter == false` and
an unchanged bond; a `failed` status requires an observed slash. A hash may be `null` only when the
run did not record it; the UI then says "not recorded in evidence".

### `transactions[]`

```json
{
  "id": "settle-2", "label": "settle", "hash": "0x548f083e9ddbb444e6b54fc0f21d20ab32b46e2de45306cf94f4f63042139457",
  "block": 56, "status": "success", "receipt": "recorded",
  "finality": { "kind": "heuristic", "confirmations": 1 },
  "stages": ["submitted", "included", "executed", "finalized", "readBack"],
  "evidence": "evidence/raw/t1/87-e2e-process.txt",
  "note": "flags 1, claimed = price"
}
```

`receipt` is `recorded | not-recorded | unavailable-pruned | unavailable-error`. The last two exist so
an exported bundle can record a cross-check result; the static fixture only uses the first two.
`stages` is an ordered subset of `submitted, included, executed, finalized, readBack`; anything not
listed is rendered as "not observed". `status` is `success | reverted | unknown`; it is `unknown`
when the run did not capture the transaction at all. `finality` is
`{ "kind": "tag", "tag": "finalized" }`, `{ "kind": "heuristic", "confirmations": N }` with N ≥ 1, or
`null` when it was not observed. A heuristic is never rendered as protocol finality; it is rendered
as `heuristic(confirmations = N)`.

### `retrieval` (optional)

```json
{
  "utc": "2026-10-24T10:12:07Z",
  "dealIds": [1, 2],
  "blockSize": 1024, "blockCount": 1024, "size": 1048576,
  "sha256": "0x7f2f…e21e", "root": "0xd2ba…70c7",
  "sha256Match": true,
  "tamper": { "rejected": true, "firstMismatchingBlock": 0, "error": "ProofRejected: …" },
  "source": "evidence/raw/t1/75-live-retrieval.txt"
}
```

The fresh-client retrieval: a second client fetched the payload for `dealIds`, wrote it to disk and
compared its sha256 with the upload. `blockCount` must equal `ceil(size / blockSize)`.
`tamper.rejected` is the result of replaying the original path for the block whose bytes changed, so
`firstMismatchingBlock` names that block. `null` (or a missing key) means the run recorded none, and
the Judges page shows `PENDING LIVE RUN` rather than a zero. Bundles written before this key existed
stay valid.

### `refusals[]`

```json
{
  "id": "resolve-before-deadline", "attempted": "resolve(1)", "error": "WindowOpen",
  "reason": "response window has not closed yet, or the answer arrived after its deadline",
  "source": "contracts/test/makhzan/Challenge.t.sol::test_resolveBeforeDeadlineRevertsWindowOpen"
}
```

`error` MUST be one of the custom errors in `specs/002-core-storage-proofs/contracts/imakhzan.md`.
A refusal is not a transaction; `hash` is not part of this object.

## Cross-field validation (rejected, not repaired)

- `config.slot0` must decode to the eight named fields exactly.
- Every `deals[].providerId` must exist in `providers[]`.
- Every `deals[].roundIds[]` must reference a round whose `dealId` matches.
- A `passed` round must have `bondBeforeUnits == bondAfterUnits` and `slashUnits == "0"`.
- A `failed` round must have `slashUnits > 0`, `bondAfterUnits == bondBeforeUnits - slashUnits`, and
  `ownerCreditWei == slashUnits * 10000` (the `WEI_PER_UNIT` assumption).
- `ownerCreditWei` and all `*Units` strings parse as non-negative integers without leading zeros
  (except `"0"`).
- Duplicate ids anywhere are a schema error.
- Amounts are not floats and are not rounded at load time.

## Labelling

The file is `REPORTED` as a whole. The app adds `MEASURED` only when it reads the chain itself, and
`SIMULATED` only for values it extrapolates between reads. `PENDING LIVE RUN` is never stored in an
evidence file; it is a UI state for a value the evidence does not contain.

## Fixture provenance

`fixture-local-anvil.json` transcribes `evidence/raw/t1/87-e2e-process.txt` (UTC 2026-10-23T08:21Z)
and `evidence/deployments/local-e2e-process-2026-10-23T08-21-15-210Z.json`. Blocks and hashes are
copied; nothing is inferred. The fixture SHA-256 is
`fec974a18e7471bc51249b37494ec2a9b19deaf92c4a711289bb03e90fbff323` (recompute after any copy; the
manifest must carry the hash of the exact published bytes). The provider registration block and hash were not printed by that run,
so they are recorded as missing (`hash: null`, `block: null`) rather than guessed.
