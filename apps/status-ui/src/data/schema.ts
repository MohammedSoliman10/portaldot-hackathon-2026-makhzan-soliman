/**
 * Evidence types for `makhzan.evidence/v0`.
 *
 * These mirror `specs/003-status-ui/contracts/evidence-schema.md` exactly. Validation lives in
 * `parseEvidence` (added with its tests); these declarations are the shared vocabulary.
 */

import { decodeSlot0 } from "./peek.ts";

export type Hex = `0x${string}`;
export type EvidenceEnvironment = "anvil-local" | "portaldot-testnet";
export type DealState = "active" | "expired" | "settled";
export type RoundStatus = "pending" | "submitted" | "passed" | "failed" | "unanswered";
export type EvidenceStage = "submitted" | "included" | "executed" | "finalized" | "readBack";
export type ReceiptState = "recorded" | "not-recorded" | "unavailable-pruned" | "unavailable-error";
export type RoundOutcome = "passed" | "slashed";
export type TransactionStatus = "success" | "reverted" | "unknown";
export type Finality =
  | { kind: "tag"; tag: "finalized" }
  | { kind: "heuristic"; confirmations: number }
  | null;

export interface ChainInfo {
  chainId: number;
  name: string;
  rpcHost: string;
  explorer: string | null;
  explorerNote: string | null;
}

export interface TimingInfo {
  blockTimeSeconds: number;
  basis: "measured" | "node-default" | "assumption";
  source: string;
}

export interface DeploymentInfo {
  address: Hex;
  txHash: Hex;
  block: number | null;
  codeHash: Hex;
  runtimeBytes: number;
  creationBytes: number | null;
  compiler: string;
  codeVerified: {
    method: "runtime-code-hash" | "none";
    sourceVerified: boolean;
    artifact: string;
    note: string;
  };
}

export interface ConfigInfo {
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

export interface ProviderInfo {
  id: number;
  address: Hex;
  bondUnits: string;
  activeDeals: number;
  registered: boolean;
}

export interface DealInfo {
  id: number;
  owner: Hex;
  providerId: number;
  root: Hex;
  leafCount: number;
  size: number;
  blockSize: number;
  startBlock: number;
  endBlock: number;
  priceUnits: string;
  claimedUnits: string;
  flags: number;
  state: DealState;
  health: 0 | 1 | 2 | 3 | null;
  roundIds: number[];
}

export interface RoundInfo {
  id: number;
  dealId: number;
  outcome: RoundOutcome;
  status: RoundStatus;
  index: number;
  startBlock: number;
  deadline: number;
  expectedPathLength: number;
  challengeTx: Hex | null;
  answerTx: Hex | null;
  resolveTx: Hex | null;
  bondBeforeUnits: string;
  bondAfterUnits: string;
  slashUnits: string;
  ownerCreditWei: string;
  readBack: { challengeOpenAfter: boolean; bondAfterUnits: string };
  note: string;
}

export interface TransactionInfo {
  id: string;
  label: string;
  hash: Hex | null;
  block: number | null;
  status: TransactionStatus;
  receipt: ReceiptState;
  finality: Finality;
  stages: EvidenceStage[];
  evidence: string;
  note: string;
}

export interface RefusalInfo {
  id: string;
  attempted: string;
  error: string;
  reason: string;
  source: string;
  note: string;
}

export interface EvidenceBundle {
  schema: "makhzan.evidence/v0";
  id: string;
  environment: EvidenceEnvironment;
  label: "REPORTED";
  generatedAt: string;
  source: string;
  chain: ChainInfo;
  timing: TimingInfo;
  deployment: DeploymentInfo;
  config: ConfigInfo;
  providers: ProviderInfo[];
  deals: DealInfo[];
  rounds: RoundInfo[];
  transactions: TransactionInfo[];
  refusals: RefusalInfo[];
  limits: string[];
}

export interface EvidenceManifestEntry {
  id: string;
  url: string;
  sha256: Hex;
  environment: EvidenceEnvironment;
  generatedAt: string;
}

export interface EvidenceManifest {
  schema: "makhzan.evidence-index/v0";
  current: string;
  files: EvidenceManifestEntry[];
}

/** A loaded evidence layer. `bundle` is null only while loading or after a hard failure. */
export interface EvidenceState {
  bundle: EvidenceBundle | null;
  verified: boolean;
  error: string | null;
  loading: boolean;
}

// ---------------------------------------------------------------------------------------------
// Strict validation. Anything the schema does not name is rejected, never coerced.
// ---------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

const isObject = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function object(value: unknown, path: string, keys: readonly string[]): Obj {
  if (!isObject(value)) return fail(path, "must be an object");
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(path, `unknown key: ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(path, `missing key: ${key}`);
  }
  return value;
}

function string(value: unknown, path: string, options: { max?: number; oneOf?: readonly string[] } = {}): string {
  if (typeof value !== "string") return fail(path, "must be a string");
  if (value.length === 0) fail(path, "must not be empty");
  if (value.length > (options.max ?? 280)) fail(path, "is longer than 280 characters");
  if (options.oneOf && !options.oneOf.includes(value)) {
    fail(path, `must be one of ${options.oneOf.join(", ")}`);
  }
  return value;
}

function integer(value: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) fail(path, "must be an integer");
  if (value < min || value > max) fail(path, `must be between ${min} and ${max}`);
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return fail(path, "must be a boolean");
  return value;
}

function nullable<T>(value: unknown, parse: (input: unknown) => T): T | null {
  return value === null ? null : parse(value);
}

function hex(value: unknown, path: string, bytes: number): Hex {
  if (typeof value !== "string") return fail(path, "must be a hex string");
  const pattern = bytes === 20 ? /^0x[0-9a-fA-F]{40}$/ : /^0x[0-9a-f]{64}$/;
  if (!pattern.test(value)) fail(path, `must be 0x followed by ${bytes * 2} hex characters`);
  return value as Hex;
}

function decimal(value: unknown, path: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    fail(path, "must be a non-negative decimal integer without leading zeros");
  }
  return BigInt(value);
}

function array(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value)) return fail(path, "must be an array");
  if (value.length < min || value.length > max) fail(path, `must hold ${min}..${max} entries`);
  return value;
}

const CHAIN_KEYS = ["chainId", "name", "rpcHost", "explorer", "explorerNote"] as const;
const TIMING_KEYS = ["blockTimeSeconds", "basis", "source"] as const;
const DEPLOYMENT_KEYS = [
  "address", "txHash", "block", "codeHash", "runtimeBytes", "creationBytes", "compiler", "codeVerified",
] as const;
const VERIFIED_KEYS = ["method", "sourceVerified", "artifact", "note"] as const;
const CONFIG_KEYS = [
  "challengeWindowBlocks", "challengeBlockSize", "slashBps", "minBondUnits", "nextDealId",
  "providerCount", "minDurationBlocks", "maxDurationBlocks", "slot0",
] as const;
const PROVIDER_KEYS = ["id", "address", "bondUnits", "activeDeals", "registered"] as const;
const DEAL_KEYS = [
  "id", "owner", "providerId", "root", "leafCount", "size", "blockSize", "startBlock", "endBlock",
  "priceUnits", "claimedUnits", "flags", "state", "health", "roundIds",
] as const;
const ROUND_KEYS = [
  "id", "dealId", "outcome", "status", "index", "startBlock", "deadline", "expectedPathLength",
  "challengeTx", "answerTx", "resolveTx", "bondBeforeUnits", "bondAfterUnits", "slashUnits",
  "ownerCreditWei", "readBack", "note",
] as const;
const READ_BACK_KEYS = ["challengeOpenAfter", "bondAfterUnits"] as const;
const TRANSACTION_KEYS = [
  "id", "label", "hash", "block", "status", "receipt", "finality", "stages", "evidence", "note",
] as const;
const REFUSAL_KEYS = ["id", "attempted", "error", "reason", "source", "note"] as const;
const BUNDLE_KEYS = [
  "schema", "id", "environment", "label", "generatedAt", "source", "chain", "timing", "deployment",
  "config", "providers", "deals", "rounds", "transactions", "refusals", "limits",
] as const;
const MANIFEST_KEYS = ["schema", "current", "files"] as const;
const MANIFEST_FILE_KEYS = ["id", "url", "sha256", "environment", "generatedAt"] as const;

const ROUND_STATUSES = ["pending", "submitted", "passed", "failed", "unanswered"] as const;
const STAGES = ["submitted", "included", "executed", "finalized", "readBack"] as const;
const RECEIPT_STATES = ["recorded", "not-recorded", "unavailable-pruned", "unavailable-error"] as const;

function parseChain(value: unknown): ChainInfo {
  const raw = object(value, "chain", CHAIN_KEYS);
  const explorer = raw.explorer === null ? null : string(raw.explorer, "chain.explorer");
  if (explorer !== null && !/^https:\/\//.test(explorer)) fail("chain.explorer", "must be https:// or null");
  return {
    chainId: integer(raw.chainId, "chain.chainId", 1),
    name: string(raw.name, "chain.name"),
    rpcHost: string(raw.rpcHost, "chain.rpcHost"),
    explorer,
    explorerNote: nullable(raw.explorerNote, (item) => string(item, "chain.explorerNote")),
  };
}

function parseTiming(value: unknown): TimingInfo {
  const raw = object(value, "timing", TIMING_KEYS);
  return {
    blockTimeSeconds: integer(raw.blockTimeSeconds, "timing.blockTimeSeconds", 0, 3600),
    basis: string(raw.basis, "timing.basis", { oneOf: ["measured", "node-default", "assumption"] }) as TimingInfo["basis"],
    source: string(raw.source, "timing.source"),
  };
}

function parseDeployment(value: unknown): DeploymentInfo {
  const raw = object(value, "deployment", DEPLOYMENT_KEYS);
  const verified = object(raw.codeVerified, "deployment.codeVerified", VERIFIED_KEYS);
  return {
    address: hex(raw.address, "deployment.address", 20),
    txHash: hex(raw.txHash, "deployment.txHash", 32),
    block: nullable(raw.block, (item) => integer(item, "deployment.block")),
    codeHash: hex(raw.codeHash, "deployment.codeHash", 32),
    runtimeBytes: integer(raw.runtimeBytes, "deployment.runtimeBytes", 1),
    creationBytes: nullable(raw.creationBytes, (item) => integer(item, "deployment.creationBytes", 1)),
    compiler: string(raw.compiler, "deployment.compiler"),
    codeVerified: {
      method: string(verified.method, "deployment.codeVerified.method", {
        oneOf: ["runtime-code-hash", "none"],
      }) as DeploymentInfo["codeVerified"]["method"],
      sourceVerified: boolean(verified.sourceVerified, "deployment.codeVerified.sourceVerified"),
      artifact: string(verified.artifact, "deployment.codeVerified.artifact"),
      note: string(verified.note, "deployment.codeVerified.note"),
    },
  };
}

function parseConfig(value: unknown): ConfigInfo {
  const raw = object(value, "config", CONFIG_KEYS);
  const slot0 = hex(raw.slot0, "config.slot0", 32);
  const config: ConfigInfo = {
    challengeWindowBlocks: integer(raw.challengeWindowBlocks, "config.challengeWindowBlocks", 1),
    challengeBlockSize: integer(raw.challengeBlockSize, "config.challengeBlockSize", 1),
    slashBps: integer(raw.slashBps, "config.slashBps", 0, 10000),
    minBondUnits: decimal(raw.minBondUnits, "config.minBondUnits").toString(),
    nextDealId: integer(raw.nextDealId, "config.nextDealId", 1),
    providerCount: integer(raw.providerCount, "config.providerCount", 0),
    minDurationBlocks: integer(raw.minDurationBlocks, "config.minDurationBlocks", 1),
    maxDurationBlocks: integer(raw.maxDurationBlocks, "config.maxDurationBlocks", 1),
    slot0,
  };
  const decoded = decodeSlot0(slot0);
  for (const [key, decodedValue] of Object.entries(decoded)) {
    if (String(decodedValue) !== String(config[key as keyof Omit<ConfigInfo, "slot0">])) {
      fail("config.slot0", `disagrees with config.${key}`);
    }
  }
  return config;
}

function parseProvider(value: unknown, index: number): ProviderInfo {
  const path = `providers[${index}]`;
  const raw = object(value, path, PROVIDER_KEYS);
  return {
    id: integer(raw.id, `${path}.id`, 1, 65535),
    address: hex(raw.address, `${path}.address`, 20),
    bondUnits: decimal(raw.bondUnits, `${path}.bondUnits`).toString(),
    activeDeals: integer(raw.activeDeals, `${path}.activeDeals`),
    registered: boolean(raw.registered, `${path}.registered`),
  };
}

function parseDeal(value: unknown, index: number): DealInfo {
  const path = `deals[${index}]`;
  const raw = object(value, path, DEAL_KEYS);
  const roundIds = array(raw.roundIds, `${path}.roundIds`, 0, 256).map((item, position) =>
    integer(item, `${path}.roundIds[${position}]`),
  );
  return {
    id: integer(raw.id, `${path}.id`, 1),
    owner: hex(raw.owner, `${path}.owner`, 20),
    providerId: integer(raw.providerId, `${path}.providerId`, 1),
    root: hex(raw.root, `${path}.root`, 32),
    leafCount: integer(raw.leafCount, `${path}.leafCount`, 1),
    size: integer(raw.size, `${path}.size`, 1),
    blockSize: integer(raw.blockSize, `${path}.blockSize`, 1),
    startBlock: integer(raw.startBlock, `${path}.startBlock`),
    endBlock: integer(raw.endBlock, `${path}.endBlock`),
    priceUnits: decimal(raw.priceUnits, `${path}.priceUnits`).toString(),
    claimedUnits: decimal(raw.claimedUnits, `${path}.claimedUnits`).toString(),
    flags: integer(raw.flags, `${path}.flags`, 0, 255),
    state: string(raw.state, `${path}.state`, { oneOf: ["active", "expired", "settled"] }) as DealState,
    health:
      raw.health === null ? null : (integer(raw.health, `${path}.health`, 0, 3) as 0 | 1 | 2 | 3),
    roundIds,
  };
}

function parseRound(value: unknown, index: number): RoundInfo {
  const path = `rounds[${index}]`;
  const raw = object(value, path, ROUND_KEYS);
  const readBackRaw = object(raw.readBack, `${path}.readBack`, READ_BACK_KEYS);
  return {
    id: integer(raw.id, `${path}.id`, 1),
    dealId: integer(raw.dealId, `${path}.dealId`, 1),
    outcome: string(raw.outcome, `${path}.outcome`, { oneOf: ["passed", "slashed"] }) as RoundOutcome,
    status: string(raw.status, `${path}.status`, { oneOf: ROUND_STATUSES }) as RoundStatus,
    index: integer(raw.index, `${path}.index`),
    startBlock: integer(raw.startBlock, `${path}.startBlock`),
    deadline: integer(raw.deadline, `${path}.deadline`),
    expectedPathLength: integer(raw.expectedPathLength, `${path}.expectedPathLength`),
    challengeTx: nullable(raw.challengeTx, (item) => hex(item, `${path}.challengeTx`, 32)),
    answerTx: nullable(raw.answerTx, (item) => hex(item, `${path}.answerTx`, 32)),
    resolveTx: nullable(raw.resolveTx, (item) => hex(item, `${path}.resolveTx`, 32)),
    bondBeforeUnits: decimal(raw.bondBeforeUnits, `${path}.bondBeforeUnits`).toString(),
    bondAfterUnits: decimal(raw.bondAfterUnits, `${path}.bondAfterUnits`).toString(),
    slashUnits: decimal(raw.slashUnits, `${path}.slashUnits`).toString(),
    ownerCreditWei: decimal(raw.ownerCreditWei, `${path}.ownerCreditWei`).toString(),
    readBack: {
      challengeOpenAfter: boolean(readBackRaw.challengeOpenAfter, `${path}.readBack.challengeOpenAfter`),
      bondAfterUnits: decimal(readBackRaw.bondAfterUnits, `${path}.readBack.bondAfterUnits`).toString(),
    },
    note: string(raw.note, `${path}.note`),
  };
}

function parseFinality(value: unknown, path: string): Finality {
  if (value === null) return null;
  if (!isObject(value)) return fail(path, "must be an object or null");
  const kind = string(value.kind, `${path}.kind`, { oneOf: ["tag", "heuristic"] });
  if (kind === "tag") {
    object(value, path, ["kind", "tag"]);
    return { kind: "tag", tag: string(value.tag, `${path}.tag`, { oneOf: ["finalized"] }) as "finalized" };
  }
  object(value, path, ["kind", "confirmations"]);
  return { kind: "heuristic", confirmations: integer(value.confirmations, `${path}.confirmations`, 1) };
}

function parseTransaction(value: unknown, index: number): TransactionInfo {
  const path = `transactions[${index}]`;
  const raw = object(value, path, TRANSACTION_KEYS);
  const stages = array(raw.stages, `${path}.stages`, 0, 5).map((item, position) =>
    string(item, `${path}.stages[${position}]`, { oneOf: STAGES }),
  ) as EvidenceStage[];
  const expectedOrder = stages.map((stage) => STAGES.indexOf(stage));
  for (let i = 1; i < expectedOrder.length; i += 1) {
    if (expectedOrder[i]! <= expectedOrder[i - 1]!) fail(`${path}.stages`, "must be in pipeline order");
  }
  if (new Set(stages).size !== stages.length) fail(`${path}.stages`, "must not repeat a stage");
  return {
    id: string(raw.id, `${path}.id`),
    label: string(raw.label, `${path}.label`),
    hash: nullable(raw.hash, (item) => hex(item, `${path}.hash`, 32)),
    block: nullable(raw.block, (item) => integer(item, `${path}.block`)),
    status: string(raw.status, `${path}.status`, {
      oneOf: ["success", "reverted", "unknown"],
    }) as TransactionStatus,
    receipt: string(raw.receipt, `${path}.receipt`, { oneOf: RECEIPT_STATES }) as ReceiptState,
    finality: parseFinality(raw.finality, `${path}.finality`),
    stages,
    evidence: string(raw.evidence, `${path}.evidence`),
    note: string(raw.note, `${path}.note`),
  };
}

function parseRefusal(value: unknown, index: number): RefusalInfo {
  const path = `refusals[${index}]`;
  const raw = object(value, path, REFUSAL_KEYS);
  return {
    id: string(raw.id, `${path}.id`),
    attempted: string(raw.attempted, `${path}.attempted`),
    error: string(raw.error, `${path}.error`),
    reason: string(raw.reason, `${path}.reason`),
    source: string(raw.source, `${path}.source`),
    note: string(raw.note, `${path}.note`),
  };
}

function parseGeneratedAt(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(parsed) || Number.isNaN(Date.parse(parsed))) {
    fail(path, "must be an ISO-8601 UTC timestamp ending in Z");
  }
  return parsed;
}

function assertUnique<T>(items: T[], key: (item: T) => string | number, label: string): void {
  const seen = new Set<string | number>();
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) fail("bundle", `duplicate ${label} id ${id}`);
    seen.add(id);
  }
}

export function parseEvidence(value: unknown): EvidenceBundle {
  const raw = object(value, "bundle", BUNDLE_KEYS);
  if (raw.schema !== "makhzan.evidence/v0") {
    fail("bundle.schema", `unsupported schema ${String(raw.schema)}`);
  }
  const id = string(raw.id, "bundle.id");
  if (!/^[a-z0-9-]+$/.test(id)) fail("bundle.id", "must match [a-z0-9-]+");

  const providers = array(raw.providers, "providers", 0, 64).map(parseProvider);
  const deals = array(raw.deals, "deals", 0, 256).map(parseDeal);
  const rounds = array(raw.rounds, "rounds", 0, 256).map(parseRound);
  const transactions = array(raw.transactions, "transactions", 0, 256).map(parseTransaction);
  const refusals = array(raw.refusals, "refusals", 0, 256).map(parseRefusal);
  const limits = array(raw.limits, "limits", 1, 16).map((item, index) =>
    string(item, `limits[${index}]`),
  );

  assertUnique(providers, (item) => item.id, "provider");
  assertUnique(deals, (item) => item.id, "deal");
  assertUnique(rounds, (item) => item.id, "round");
  assertUnique(transactions, (item) => item.id, "transaction");
  assertUnique(refusals, (item) => item.id, "refusal");

  const providerIds = new Set(providers.map((provider) => provider.id));
  const roundsById = new Map(rounds.map((round) => [round.id, round]));
  for (const deal of deals) {
    if (!providerIds.has(deal.providerId)) {
      fail(`deals[${deal.id}]`, `references missing provider ${deal.providerId}`);
    }
    for (const roundId of deal.roundIds) {
      const round = roundsById.get(roundId);
      if (!round) fail(`deals[${deal.id}]`, `references missing round ${roundId}`);
      if (round.dealId !== deal.id) fail(`deals[${deal.id}]`, `round ${roundId} belongs to another deal`);
    }
  }

  for (const round of rounds) {
    const path = `rounds[${round.id}]`;
    if (round.status === "passed") {
      if (round.bondBeforeUnits !== round.bondAfterUnits || round.slashUnits !== "0") {
        fail(path, `passed round ${round.id} cannot change the bond or slash`);
      }
      if (round.readBack.challengeOpenAfter) fail(path, `passed round ${round.id} cannot leave the challenge open`);
      if (round.outcome !== "passed") fail(path, "a passed status needs a passed outcome");
    }
    if (round.status === "failed") {
      const before = BigInt(round.bondBeforeUnits);
      const slash = BigInt(round.slashUnits);
      if (slash <= 0n) fail(path, `failed round ${round.id} needs a positive slash`);
      if (before - slash !== BigInt(round.bondAfterUnits)) fail(path, "slash arithmetic does not balance");
      if (BigInt(round.ownerCreditWei) !== slash * 10000n) {
        fail(path, "owner credit must equal slash * 10000 wei per unit");
      }
      if (round.outcome !== "slashed") fail(path, "a failed status needs a slashed outcome");
      if (round.readBack.bondAfterUnits !== round.bondAfterUnits) {
        fail(path, "read-back bond disagrees with the recorded bond");
      }
    }
  }

  return {
    schema: "makhzan.evidence/v0",
    id,
    environment: string(raw.environment, "bundle.environment", {
      oneOf: ["anvil-local", "portaldot-testnet"],
    }) as EvidenceEnvironment,
    label: string(raw.label, "bundle.label", { oneOf: ["REPORTED"] }) as "REPORTED",
    generatedAt: parseGeneratedAt(raw.generatedAt, "bundle.generatedAt"),
    source: string(raw.source, "bundle.source"),
    chain: parseChain(raw.chain),
    timing: parseTiming(raw.timing),
    deployment: parseDeployment(raw.deployment),
    config: parseConfig(raw.config),
    providers,
    deals,
    rounds,
    transactions,
    refusals,
    limits,
  };
}

export function parseManifest(value: unknown): EvidenceManifest {
  const raw = object(value, "manifest", MANIFEST_KEYS);
  if (raw.schema !== "makhzan.evidence-index/v0") {
    fail("manifest.schema", `unsupported manifest schema ${String(raw.schema)}`);
  }
  const files = array(raw.files, "manifest.files", 1, 64).map((item, index) => {
    const path = `manifest.files[${index}]`;
    const file = object(item, path, MANIFEST_FILE_KEYS);
    const url = string(file.url, `${path}.url`);
    if (!url.startsWith("/")) fail(`${path}.url`, "must be an absolute same-origin path");
    return {
      id: string(file.id, `${path}.id`),
      url,
      sha256: (() => {
        const digest = string(file.sha256, `${path}.sha256`, { max: 66 });
        if (!/^0x[0-9a-f]{64}$/.test(digest)) fail(`${path}.sha256`, "must be 0x followed by 64 hex characters");
        return digest as Hex;
      })(),
      environment: string(file.environment, `${path}.environment`, {
        oneOf: ["anvil-local", "portaldot-testnet"],
      }) as EvidenceEnvironment,
      generatedAt: parseGeneratedAt(file.generatedAt, `${path}.generatedAt`),
    };
  });
  const current = string(raw.current, "manifest.current");
  if (!files.some((file) => file.id === current)) fail("manifest.current", "is not listed in files");
  return { schema: "makhzan.evidence-index/v0", current, files };
}
