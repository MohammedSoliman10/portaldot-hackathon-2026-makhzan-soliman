# Data Model — 003-status-ui

**Feature**: Makhzan Proof and Status web app | **Schema**: `makhzan.evidence/v0`

The app has two inputs: one validated evidence bundle (always) and zero or more read-only chain calls
(when live). Everything on screen is derived from those two through the types below.

## Evidence types (mirror of the draft schema)

```ts
type Hex = `0x${string}`;
type EvidenceEnvironment = "anvil-local" | "portaldot-testnet";
type DealState = "active" | "expired" | "settled";
type RoundStatus = "pending" | "submitted" | "passed" | "failed" | "unanswered";
type EvidenceStage = "submitted" | "included" | "executed" | "finalized" | "readBack";
type ReceiptState = "recorded" | "not-recorded" | "unavailable-pruned" | "unavailable-error";

interface EvidenceBundle {
  schema: "makhzan.evidence/v0";
  id: string;
  environment: EvidenceEnvironment;
  label: "REPORTED";
  generatedAt: string;
  source: string;
  chain: { chainId: number; name: string; rpcHost: string; explorer: string | null; explorerNote: string | null };
  timing: { blockTimeSeconds: number; basis: "measured" | "node-default" | "assumption"; source: string };
  deployment: DeploymentInfo;
  config: ConfigInfo;
  providers: ProviderInfo[];
  deals: DealInfo[];
  rounds: RoundInfo[];
  transactions: TransactionInfo[];
  refusals: RefusalInfo[];
  limits: string[];
}

interface DeploymentInfo {
  address: Hex;
  txHash: Hex;
  block: number | null;
  codeHash: Hex;
  runtimeBytes: number;
  creationBytes: number | null;
  compiler: string;
  codeVerified: { method: "runtime-code-hash" | "none"; sourceVerified: boolean; artifact: string; note: string };
}

interface ConfigInfo {
  challengeWindowBlocks: number;
  challengeBlockSize: number;
  slashBps: number;
  minBondUnits: string;
  nextDealId: number;
  providerCount: number;
  minDurationBlocks: number;
  maxDurationBlocks: number;
  slot0: Hex;
}

interface ProviderInfo { id: number; address: Hex; bondUnits: string; activeDeals: number; registered: boolean }

interface DealInfo {
  id: number; owner: Hex; providerId: number; root: Hex;
  leafCount: number; size: number; blockSize: number;
  startBlock: number; endBlock: number;
  priceUnits: string; claimedUnits: string;
  flags: number; state: DealState; health: 0 | 1 | 2 | 3 | null; roundIds: number[];
}

interface RoundInfo {
  id: number; dealId: number; outcome: "passed" | "slashed"; status: RoundStatus;
  index: number; startBlock: number; deadline: number; expectedPathLength: number;
  challengeTx: Hex | null; answerTx: Hex | null; resolveTx: Hex | null;
  bondBeforeUnits: string; bondAfterUnits: string; slashUnits: string; ownerCreditWei: string;
  readBack: { challengeOpenAfter: boolean; bondAfterUnits: string };
  note: string;
}

interface TransactionInfo {
  id: string; label: string; hash: Hex | null; block: number | null;
  status: "success" | "reverted" | "unknown"; receipt: ReceiptState;
  finality: { kind: "tag"; tag: "finalized" } | { kind: "heuristic"; confirmations: number } | null;
  stages: EvidenceStage[]; evidence: string; note: string;
}

interface RefusalInfo { id: string; attempted: string; error: string; reason: string; source: string; note: string }
```

Validation rejects, rather than coerces: unknown keys, missing keys, wrong types, non-hex addresses,
non-hex hashes, negative or unsafe integers, zero-padded amounts, floats, duplicate ids, a `slot0`
that does not decode to the named config, a round whose `readBack` contradicts its status, a passed
round with a bond change, and a failed round whose arithmetic does not equal `slashUnits`.

## Labels and provenance

```ts
type Label = "MEASURED" | "REPORTED" | "SIMULATED" | "PENDING LIVE RUN";

interface Metric<T> {
  value: T;                 // formatted only at the edge
  unit: string;             // "tPOT", "units", "wei", "blocks", "bytes", "s", "—"
  label: Label;
  source: string;           // evidence file, or "chain 420420777 @ block 123"
  at: string | null;        // UTC of the read or of the evidence file
  stale: boolean;           // true only on live values older than 30 s
  unavailableReason: string | null; // text instead of a value
}
```

Rules:
- `Metric` is the only path to a number; `value` is `null` when `unavailableReason` is set and the
  component renders the reason, not an empty cell.
- A `REPORTED` metric keeps the evidence file, environment and `generatedAt`.
- A `MEASURED` metric carries the block number and read time.
- `SIMULATED` carries the anchor (last read or fixture) and the basis (`1 s per block, node-default`).
- `PENDING LIVE RUN` never carries a value.

## Mode

```ts
type Mode = "RECORDED" | "LOCAL" | "LIVE";

interface ModeState {
  mode: Mode;
  requested: Mode | null;
  address: Hex | null;
  rpcUrl: string | null;
  expectedChainId: number;
  observedChainId: number | null;
  clientEnabled: boolean;      // false in RECORDED, or before the chain check passes
  blocking: { kind: "config" | "chain-mismatch" | "no-code" | "evidence-mismatch"; detail: string } | null;
}
```

Resolution:
- `requested` is `VITE_MAKHZAN_MODE` when it is one of the three values; an unknown value is a config
  error, not a silent fallback.
- No request + valid address → `LIVE`; otherwise `RECORDED`.
- `clientEnabled` is false in `RECORDED`, when the address is invalid, when `eth_chainId` ≠ expected,
  or when `eth_getCode` returns `0x`.
- A blocking condition never removes the recorded base layer.

## Live reads

```ts
interface ReadResult<T> {
  value: T | null;
  block: number | null;
  at: string | null;
  label: "MEASURED";
  stale: boolean;
  error: { kind: "timeout" | "rpc" | "chain-mismatch" | "reverted" | "malformed"; message: string } | null;
}
```

The seven view calls (ABI copied from `apps/makhzan/src/chain.ts`, outputs decoded as there):

| Call | Returns | Used for |
| --- | --- | --- |
| `peek([0])` | `bytes32` | config, `nextDealId`, `providerCount` |
| `providerOf(address)` | `(uint16 id, uint64 bond, uint24 activeDeals, bool registered)` | bond and registration |
| `dealOf(id)` | 12 fields | every deal field |
| `challengeStateOf(id)` | `(bool open, uint32 index, uint32 start, uint32 deadline, uint32 pathLength)` | timeline |
| `accruedOf(id)` | `(uint64 accrued, uint64 claimable)` | accrual anchor |
| `healthOf(id)` | `uint8` | health chip |
| `eth_getCode(address)` | `bytes` | code hash comparison |

Plus transport calls: `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber` (timestamps for block
time), `eth_getTransactionReceipt` (proof cross-check). No other method is allowed.

## Deal view

```ts
interface DealView {
  id: number;
  state: DealState;                 // settled if flags & 1; expired if head > endBlock; else active
  health: { value: 0 | 1 | 2 | 3 | null; metric: Metric<string> };
  terms: { root; leafCount; size; blockSize; startBlock; endBlock; price; claimed };
  bond: { before: Metric<string>; after: Metric<string>; slash: Metric<string>; ownerCredit: Metric<string> };
  accrual: { anchor: Metric<string>; displayed: Metric<string>; perBlock: string; cap: string };
  rounds: RoundView[];
  transactions: TransactionView[];
  provider: ProviderInfo;
}
```

Deal state derivation is shared with the evidence writer: `flags & 1` (settled) wins; otherwise
`head > endBlock` is `expired`; otherwise `active`. The UI never takes the evidence's `state` on trust
in live mode.

## Accrual

```text
duration = endBlock - startBlock
accruedAt(block) = min(price, floor(price * (min(block, endBlock) - startBlock) / duration))
tick(now, anchor) = accruedAt(anchor.block + floor((now - anchor.at) / blockTime))
displayed = min(price, max(anchor.accrued, tick))
```

- `anchor` is the latest successful `accruedOf` read (or, in `RECORDED`, the deal's recorded anchor).
- Ticks are `SIMULATED`, at most once per second, and stop at `endBlock` or when settled.
- The next anchor replaces the tick; the display animates or snaps (reduced motion) without ever
  going backwards.
- On a recorded deal that is active, the block scrubber sets `block` explicitly and the value is
  `SIMULATED`; on a settled deal the value is the final `REPORTED`/`MEASURED` amount.

## Round view

| Evidence | UI |
| --- | --- |
| `status = passed` and `readBack.challengeOpenAfter = false` and bonds equal | passed, no inference beyond the read-back |
| `status = failed` and slash > 0 and bond delta matches | failed, slash shown |
| `status = submitted` | submitted, with "not resolved" wording |
| `status = pending` / `unanswered` | pending / unanswered, never passed |
| `answerTx = null` | "answer transaction not recorded in evidence" |
| `error` on a refusal | the refusal section, not a failed transaction |

The live overlay may confirm `open`, `deadline` and `index` from `challengeStateOf`; it does not
rewrite a recorded outcome.

## Transaction stages

| Stage | Evidence source | Live overlay |
| --- | --- | --- |
| submitted | hash present | hash present |
| included | block present | receipt block |
| executed | status present | receipt status |
| finalized | the record's `finality` field (`heuristic(1)` in the fixture); live: observed `finalized` tag or labelled heuristic | observed tag or labelled heuristic |
| read back | `stages` includes `readBack` | a fresh view call performed by the app |

Stages not observed are rendered hatched and labelled "not observed". A hash with no receipt is not a
failure; see receipt classification.

## Receipt classification

| Input | Type | UI |
| --- | --- | --- |
| `status`, `blockNumber` returned | `recorded` now | measured status + block + gas |
| node says receipt/block unknown or state discarded | `unavailable-pruned` | `unavailable (pruned by RPC)` |
| timeout, HTTP, CORS, connection | `unavailable-error` | `unavailable (RPC error)` + retry |
| evidence has `hash = null` | `not-recorded` | `not recorded in evidence` |

## Health

| `healthOf` | Meaning | UI |
| --- | --- | --- |
| 0 | no such deal or settled | "settled / not available" |
| 1 | healthy, no open challenge | "healthy" |
| 2 | challenge open inside the window, including the deadline block | "challenge pending" |
| 3 | open and past the deadline, unresolved | "in default" |
| `null` in evidence | the run did not call `healthOf` | "not recorded by the run" |
| revert | old deployment or no deal | "not available on this deployment" |

## Evidence manifest

```ts
interface EvidenceManifest {
  schema: "makhzan.evidence-index/v0";
  current: string;
  files: { id: string; url: string; sha256: Hex; environment: EvidenceEnvironment; generatedAt: string }[];
}
```

The loader verifies `schema`, `current` membership, `sha256` length and the hash over the raw bytes.
A hash mismatch is a warning (`unverified evidence`), not a parse failure.
