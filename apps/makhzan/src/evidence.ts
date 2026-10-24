/**
 * Evidence bundle writer and validator for `makhzan.evidence/v0` (feature 003 contract).
 *
 * The raw layer is `evidence/receipts/<network>/<hash>.json`, written as soon as a receipt arrives.
 * `addresses.json` and `txs.json` are derived views over that layer; the published bundle is the
 * immutable file named by `index.json` (`makhzan.evidence-index/v0`). The schema is deliberately
 * strict: anything not listed is rejected rather than ignored.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BUNDLE_SCHEMA = "makhzan.evidence/v0";
export const INDEX_SCHEMA = "makhzan.evidence-index/v0";
export const RECEIPT_SCHEMA = "makhzan.receipt/v0";

export const CUSTOM_ERRORS = new Set([
  "NotRegistered", "AlreadyRegistered", "BondTooSmall", "HasOpenDeal", "NoDeal", "NotOwner",
  "NotProvider", "BadParams", "DealExpired", "ChallengeOpen", "NoChallenge", "ProofRejected",
  "WindowOpen", "ZeroClaim", "AlreadySettled", "BeforeEnd", "TransferFailed",
]);

export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, jsonSafe(inner)]));
  }
  return value;
}

export class EvidenceSchemaError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join("; "));
    this.name = "EvidenceSchemaError";
    this.issues = issues;
  }
}

type Json = Record<string, unknown>;

const TOP_KEYS = [
  "schema", "id", "environment", "label", "generatedAt", "source", "chain", "timing", "deployment",
  "config", "providers", "deals", "rounds", "transactions", "refusals", "limits",
];
const ENVIRONMENTS = new Set(["anvil-local", "portaldot-testnet"]);
const ROUND_STATUS = new Set(["pending", "submitted", "passed", "failed", "unanswered"]);
const RECEIPT_STATES = new Set(["recorded", "not-recorded", "unavailable-pruned", "unavailable-error"]);
const STAGES = ["submitted", "included", "executed", "finalized", "readBack"];
const AMOUNT = /^(0|[1-9][0-9]*)$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function iso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isObj(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkKeys(obj: Json, required: string[], optional: string[], path: string, issues: string[]): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!(key in obj)) issues.push(`${path} is missing ${key}`);
  }
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) issues.push(`${path} has an unknown key ${key}`);
  }
}

function str(v: unknown, path: string, issues: string[], re?: RegExp): void {
  if (typeof v !== "string") issues.push(`${path} must be a string`);
  else if (v.length > 280) issues.push(`${path} is longer than 280 characters`);
  else if (re && !re.test(v)) issues.push(`${path} has an invalid format`);
}

function int(v: unknown, path: string, issues: string[], min = 0): void {
  if (!Number.isSafeInteger(v) || (v as number) < min) {
    issues.push(`${path} must be a ${min === 0 ? "non-negative" : "positive"} safe integer`);
  }
}

function amount(v: unknown, path: string, issues: string[]): void {
  if (typeof v !== "string" || !AMOUNT.test(v)) {
    issues.push(`${path} must be a canonical non-negative decimal string without leading zeros`);
  }
}

function hash(v: unknown, path: string, issues: string[], nullable = false): void {
  if (v === null && nullable) return;
  if (typeof v !== "string" || !HASH.test(v)) issues.push(`${path} must be 0x + 64 hex characters`);
}

function address(v: unknown, path: string, issues: string[]): void {
  if (typeof v !== "string" || !ADDRESS.test(v)) issues.push(`${path} must be 0x + 40 hex characters`);
}

function slot0Fields(hex: string): number[] | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  const word = hex.slice(2).toLowerCase();
  const at = (end: number, len: number) => Number(BigInt(`0x${word.slice(end - len, end)}`));
  if (BigInt(`0x${word.slice(0, 4)}`) !== 0n) return null;
  // Fields are packed from the first field in the least-significant bytes.
  return [
    at(64, 8), at(56, 4), at(52, 4), at(48, 16), at(32, 8), at(24, 4), at(20, 8), at(12, 8),
  ];
}

function uniqueIds(rows: unknown, field: string, path: string, issues: string[]): Set<number> {
  const seen = new Set<number>();
  if (!Array.isArray(rows)) {
    issues.push(`${path} must be an array`);
    return seen;
  }
  for (const row of rows) {
    const id = isObj(row) ? row[field] : undefined;
    if (typeof id === "number") {
      if (seen.has(id)) issues.push(`duplicate ${field} ${id} in ${path}`);
      seen.add(id);
    }
  }
  return seen;
}

export function validateBundle(value: unknown): string[] {
  const issues: string[] = [];
  if (!isObj(value)) return ["the evidence bundle must be an object"];

  checkKeys(value, TOP_KEYS, [], "bundle", issues);
  if (value.schema !== BUNDLE_SCHEMA) issues.push(`schema must be exactly ${BUNDLE_SCHEMA}`);
  if (typeof value.id !== "string" || !/^[a-z0-9-]+$/.test(value.id)) {
    issues.push("id must match [a-z0-9-]+");
  } else if (value.id.length > 280) {
    issues.push("id is longer than 280 characters");
  }
  if (!ENVIRONMENTS.has(value.environment as string)) {
    issues.push("environment must be anvil-local or portaldot-testnet");
  }
  if (value.label !== "REPORTED") issues.push("label must be exactly REPORTED");
  str(value.generatedAt, "generatedAt", issues, UTC);
  str(value.source, "source", issues);

  // chain
  if (!isObj(value.chain)) {
    issues.push("chain must be an object");
  } else {
    checkKeys(value.chain, ["chainId", "name", "rpcHost", "explorer", "explorerNote"], [], "chain", issues);
    int(value.chain.chainId, "chain.chainId", issues, 1);
    str(value.chain.name, "chain.name", issues);
    str(value.chain.rpcHost, "chain.rpcHost", issues);
    if (value.chain.explorer !== null && typeof value.chain.explorer === "string") {
      if (!/^https:\/\//.test(value.chain.explorer)) issues.push("chain.explorer must be https or null");
    } else if (value.chain.explorer !== null) {
      issues.push("chain.explorer must be an https URL or null");
    }
    str(value.chain.explorerNote, "chain.explorerNote", issues);
  }

  // timing
  if (!isObj(value.timing)) {
    issues.push("timing must be an object");
  } else {
    checkKeys(value.timing, ["blockTimeSeconds", "basis", "source"], [], "timing", issues);
    if (typeof value.timing.blockTimeSeconds !== "number" || !(value.timing.blockTimeSeconds > 0)) {
      issues.push("timing.blockTimeSeconds must be a positive number");
    }
    if (!["measured", "node-default", "assumption"].includes(value.timing.basis as string)) {
      issues.push("timing.basis must be measured, node-default or assumption");
    }
    str(value.timing.source, "timing.source", issues);
  }

  // deployment
  const deployment = value.deployment;
  if (!isObj(deployment)) {
    issues.push("deployment must be an object");
  } else {
    checkKeys(
      deployment,
      ["address", "txHash", "block", "codeHash", "runtimeBytes", "creationBytes", "compiler", "codeVerified"],
      [],
      "deployment",
      issues,
    );
    address(deployment.address, "deployment.address", issues);
    hash(deployment.txHash, "deployment.txHash", issues);
    int(deployment.block, "deployment.block", issues);
    hash(deployment.codeHash, "deployment.codeHash", issues);
    int(deployment.runtimeBytes, "deployment.runtimeBytes", issues, 1);
    int(deployment.creationBytes, "deployment.creationBytes", issues, 1);
    str(deployment.compiler, "deployment.compiler", issues);
    const verified = deployment.codeVerified;
    if (!isObj(verified)) {
      issues.push("deployment.codeVerified must be an object");
    } else {
      checkKeys(verified, ["method", "sourceVerified", "artifact", "note"], [], "deployment.codeVerified", issues);
      if (!["runtime-code-hash", "none"].includes(verified.method as string)) {
        issues.push("deployment.codeVerified.method must be runtime-code-hash or none");
      }
      if (verified.sourceVerified !== false) {
        issues.push("deployment.codeVerified.sourceVerified must be false unless an explorer verified the source");
      }
      str(verified.artifact, "deployment.codeVerified.artifact", issues);
      str(verified.note, "deployment.codeVerified.note", issues);
    }
  }

  // config + slot0
  const config = value.config;
  if (!isObj(config)) {
    issues.push("config must be an object");
  } else {
    checkKeys(
      config,
      ["challengeWindowBlocks", "challengeBlockSize", "slashBps", "minBondUnits", "nextDealId",
        "providerCount", "minDurationBlocks", "maxDurationBlocks", "slot0"],
      [],
      "config",
      issues,
    );
    for (const key of ["challengeWindowBlocks", "challengeBlockSize", "slashBps", "nextDealId",
      "providerCount", "minDurationBlocks", "maxDurationBlocks"]) {
      int(config[key], `config.${key}`, issues);
    }
    amount(config.minBondUnits, "config.minBondUnits", issues);
    const decoded = typeof config.slot0 === "string" ? slot0Fields(config.slot0) : null;
    if (!decoded) {
      issues.push("config.slot0 must be exactly 32 bytes with the high 2 bytes zero");
    } else {
      const named = [
        config.challengeWindowBlocks, config.challengeBlockSize, config.slashBps,
        Number(config.minBondUnits), config.nextDealId, config.providerCount,
        config.minDurationBlocks, config.maxDurationBlocks,
      ];
      const labels = ["challengeWindowBlocks", "challengeBlockSize", "slashBps", "minBondUnits",
        "nextDealId", "providerCount", "minDurationBlocks", "maxDurationBlocks"];
      decoded.forEach((actual, i) => {
        if (actual !== named[i]) issues.push(`config.slot0 does not decode to ${labels[i]}`);
      });
    }
  }

  // providers
  const providerIds = uniqueIds(value.providers, "id", "providers", issues);
  if (Array.isArray(value.providers)) {
    if (value.providers.length > 64) issues.push("providers has more than 64 entries");
    value.providers.forEach((provider, i) => {
      const path = `providers[${i}]`;
      if (!isObj(provider)) return issues.push(`${path} must be an object`);
      checkKeys(provider, ["id", "address", "bondUnits", "activeDeals", "registered"], [], path, issues);
      int(provider.id, `${path}.id`, issues, 1);
      address(provider.address, `${path}.address`, issues);
      amount(provider.bondUnits, `${path}.bondUnits`, issues);
      int(provider.activeDeals, `${path}.activeDeals`, issues);
      if (typeof provider.registered !== "boolean") issues.push(`${path}.registered must be a boolean`);
    });
  }

  // deals
  const dealIds = uniqueIds(value.deals, "id", "deals", issues);
  if (Array.isArray(value.deals)) {
    if (value.deals.length > 256) issues.push("deals has more than 256 entries");
    value.deals.forEach((deal, i) => {
      const path = `deals[${i}]`;
      if (!isObj(deal)) return issues.push(`${path} must be an object`);
      checkKeys(deal, [
        "id", "owner", "providerId", "root", "leafCount", "size", "blockSize", "startBlock",
        "endBlock", "priceUnits", "claimedUnits", "flags", "state", "health", "roundIds",
      ], [], path, issues);
      int(deal.id, `${path}.id`, issues, 1);
      address(deal.owner, `${path}.owner`, issues);
      int(deal.providerId, `${path}.providerId`, issues, 1);
      if (providerIds.size > 0 && !providerIds.has(deal.providerId as number)) {
        issues.push(`${path} has provider ${String(deal.providerId)} which does not exist in providers[]`);
      }
      hash(deal.root, `${path}.root`, issues);
      int(deal.leafCount, `${path}.leafCount`, issues, 1);
      int(deal.size, `${path}.size`, issues, 1);
      int(deal.blockSize, `${path}.blockSize`, issues, 1);
      int(deal.startBlock, `${path}.startBlock`, issues);
      int(deal.endBlock, `${path}.endBlock`, issues);
      if (typeof deal.endBlock === "number" && typeof deal.startBlock === "number" && deal.endBlock < deal.startBlock) {
        issues.push(`${path}.endBlock is before startBlock`);
      }
      amount(deal.priceUnits, `${path}.priceUnits`, issues);
      amount(deal.claimedUnits, `${path}.claimedUnits`, issues);
      int(deal.flags, `${path}.flags`, issues);
      if (!["active", "expired", "settled"].includes(deal.state as string)) {
        issues.push(`${path}.state must be active, expired or settled`);
      }
      if (deal.health !== null && (!Number.isInteger(deal.health) || (deal.health as number) < 0 || (deal.health as number) > 3)) {
        issues.push(`${path}.health must be 0..3 or null`);
      }
      if (!Array.isArray(deal.roundIds)) {
        issues.push(`${path}.roundIds must be an array`);
      } else if (deal.roundIds.length > 256) {
        issues.push(`${path}.roundIds has more than 256 entries`);
      }
    });
  }

  // rounds
  const roundIds = uniqueIds(value.rounds, "id", "rounds", issues);
  const roundById = new Map<number, Json>();
  if (Array.isArray(value.rounds)) {
    if (value.rounds.length > 256) issues.push("rounds has more than 256 entries");
    value.rounds.forEach((round, i) => {
      const path = `rounds[${i}]`;
      if (!isObj(round)) return issues.push(`${path} must be an object`);
      checkKeys(round, [
        "id", "dealId", "outcome", "status", "index", "startBlock", "deadline",
        "expectedPathLength", "challengeTx", "answerTx", "resolveTx", "bondBeforeUnits",
        "bondAfterUnits", "slashUnits", "ownerCreditWei", "readBack",
      ], ["note"], path, issues);
      int(round.id, `${path}.id`, issues, 1);
      if (typeof round.id === "number") roundById.set(round.id, round);
      int(round.dealId, `${path}.dealId`, issues, 1);
      if (!["passed", "slashed"].includes(round.outcome as string)) {
        issues.push(`${path}.outcome must be passed or slashed`);
      }
      if (!ROUND_STATUS.has(round.status as string)) issues.push(`${path}.status is not a known round label`);
      int(round.index, `${path}.index`, issues);
      int(round.startBlock, `${path}.startBlock`, issues);
      int(round.deadline, `${path}.deadline`, issues);
      int(round.expectedPathLength, `${path}.expectedPathLength`, issues);
      hash(round.challengeTx, `${path}.challengeTx`, issues, true);
      hash(round.answerTx, `${path}.answerTx`, issues, true);
      hash(round.resolveTx, `${path}.resolveTx`, issues, true);
      amount(round.bondBeforeUnits, `${path}.bondBeforeUnits`, issues);
      amount(round.bondAfterUnits, `${path}.bondAfterUnits`, issues);
      amount(round.slashUnits, `${path}.slashUnits`, issues);
      amount(round.ownerCreditWei, `${path}.ownerCreditWei`, issues);
      if (isObj(round.readBack)) {
        checkKeys(round.readBack, ["challengeOpenAfter", "bondAfterUnits"], [], `${path}.readBack`, issues);
        if (typeof round.readBack.challengeOpenAfter !== "boolean") {
          issues.push(`${path}.readBack.challengeOpenAfter must be a boolean`);
        }
        amount(round.readBack.bondAfterUnits, `${path}.readBack.bondAfterUnits`, issues);
      } else {
        issues.push(`${path}.readBack must be an object`);
      }
      if (round.note !== undefined) str(round.note, `${path}.note`, issues);

      if (round.status === "passed") {
        if (round.bondBeforeUnits !== round.bondAfterUnits || round.slashUnits !== "0") {
          issues.push(`${path} is passed but has a slash or a changed bond`);
        }
      }
      if (round.status === "failed") {
        if (typeof round.slashUnits === "string" && (round.slashUnits === "0" || !AMOUNT.test(round.slashUnits))) {
          issues.push(`${path} is failed without a positive slash`);
        }
        if (AMOUNT.test(String(round.bondBeforeUnits)) && AMOUNT.test(String(round.bondAfterUnits)) &&
          AMOUNT.test(String(round.slashUnits))) {
          if (BigInt(String(round.bondAfterUnits)) !== BigInt(String(round.bondBeforeUnits)) - BigInt(String(round.slashUnits))) {
            issues.push(`${path} slash does not equal bondBefore - bondAfter`);
          }
          if (BigInt(String(round.ownerCreditWei)) !== BigInt(String(round.slashUnits)) * 10_000n) {
            issues.push(`${path} ownerCreditWei does not equal slashUnits * 10000`);
          }
        }
      }
    });
  }

  // deal -> round links
  if (Array.isArray(value.deals)) {
    value.deals.forEach((deal, i) => {
      if (!isObj(deal) || !Array.isArray(deal.roundIds)) return;
      for (const id of deal.roundIds) {
        if (typeof id !== "number" || !roundIds.has(id)) {
          issues.push(`deals[${i}].roundIds references a missing round ${String(id)}`);
          continue;
        }
        const round = roundById.get(id);
        if (round && round.dealId !== deal.id) {
          issues.push(`deals[${i}].roundIds round ${id} belongs to deal ${String(round.dealId)}`);
        }
      }
    });
  }

  // transactions
  const txIds = new Set<string>();
  if (Array.isArray(value.transactions)) {
    if (value.transactions.length > 256) issues.push("transactions has more than 256 entries");
    value.transactions.forEach((tx, i) => {
      const path = `transactions[${i}]`;
      if (!isObj(tx)) return issues.push(`${path} must be an object`);
      checkKeys(tx, [
        "id", "label", "hash", "block", "status", "receipt", "finality", "stages", "evidence",
      ], ["note"], path, issues);
      if (typeof tx.id === "string") {
        if (txIds.has(tx.id)) issues.push(`duplicate transaction id ${tx.id}`);
        txIds.add(tx.id);
      } else {
        issues.push(`${path}.id must be a string`);
      }
      str(tx.label, `${path}.label`, issues);
      hash(tx.hash, `${path}.hash`, issues, true);
      if (tx.block !== null) int(tx.block, `${path}.block`, issues);
      if (!["success", "reverted", "unknown"].includes(tx.status as string)) {
        issues.push(`${path}.status must be success, reverted or unknown`);
      }
      if (!RECEIPT_STATES.has(tx.receipt as string)) issues.push(`${path}.receipt is not a known receipt state`);
      if (tx.finality !== null) {
        if (!isObj(tx.finality)) {
          issues.push(`${path}.finality must be null or an object`);
        } else if (tx.finality.kind === "tag") {
          if (tx.finality.tag !== "finalized") issues.push(`${path}.finality.tag must be finalized`);
        } else if (tx.finality.kind === "heuristic") {
          int(tx.finality.confirmations, `${path}.finality.confirmations`, issues, 1);
        } else {
          issues.push(`${path}.finality.kind must be tag or heuristic`);
        }
      }
      if (!Array.isArray(tx.stages)) {
        issues.push(`${path}.stages must be an array`);
      } else {
        let last = -1;
        for (const stage of tx.stages) {
          const at = STAGES.indexOf(stage as string);
          if (at < 0) issues.push(`${path}.stages has an unknown stage ${String(stage)}`);
          else if (at <= last) issues.push(`${path}.stages is not an ordered subset`);
          else last = at;
        }
      }
      str(tx.evidence, `${path}.evidence`, issues);
      if (tx.note !== undefined) str(tx.note, `${path}.note`, issues);
    });
  }

  // refusals
  const refusalIds = new Set<string>();
  if (Array.isArray(value.refusals)) {
    if (value.refusals.length > 256) issues.push("refusals has more than 256 entries");
    value.refusals.forEach((refusal, i) => {
      const path = `refusals[${i}]`;
      if (!isObj(refusal)) return issues.push(`${path} must be an object`);
      checkKeys(refusal, ["id", "attempted", "error", "reason", "source"], ["note"], path, issues);
      if (typeof refusal.id === "string") {
        if (refusalIds.has(refusal.id)) issues.push(`duplicate refusal id ${refusal.id}`);
        refusalIds.add(refusal.id);
      } else {
        issues.push(`${path}.id must be a string`);
      }
      str(refusal.attempted, `${path}.attempted`, issues);
      if (!CUSTOM_ERRORS.has(refusal.error as string)) {
        issues.push(`${path}.error is not a custom error from the IMakhzan spec`);
      }
      str(refusal.reason, `${path}.reason`, issues);
      str(refusal.source, `${path}.source`, issues);
      if (refusal.note !== undefined) str(refusal.note, `${path}.note`, issues);
    });
  }

  // limits
  if (!Array.isArray(value.limits)) {
    issues.push("limits must be an array");
  } else {
    if (value.limits.length < 1 || value.limits.length > 16) issues.push("limits must have 1-16 entries");
    for (const line of value.limits) str(line, "limits[]", issues);
  }

  return issues;
}

export function buildBundle(input: unknown): Json {
  const issues = validateBundle(input);
  if (issues.length > 0) throw new EvidenceSchemaError(issues);
  return input as Json;
}

export interface ReceiptInput {
  network: "local" | "live";
  action: string;
  txHash: `0x${string}`;
  utc: string;
  transaction: unknown;
  receipt: unknown;
}

/** Raw receipt first: this file exists before the run waits for finality or derives any view. */
export function writeReceipt(root: string, input: ReceiptInput): string {
  const network = input.network === "local" ? "LOCAL" : "LIVE";
  const file = join(root, "receipts", input.network, `${input.txHash}.json`);
  mkdirSync(join(root, "receipts", input.network), { recursive: true });
  const record = {
    schema: RECEIPT_SCHEMA,
    network,
    action: input.action,
    txHash: input.txHash,
    utc: input.utc,
    writtenAt: iso(),
    transaction: jsonSafe(input.transaction),
    receipt: jsonSafe(input.receipt),
  };
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return file;
}

export interface DerivOptions {
  network: "local" | "live";
  chainId: number | null;
  generatedAt: string;
  deployments?: Array<{ address: string; txHash: string; action: string }>;
}

export interface DerivedViews {
  addresses: Json;
  txs: Json;
}

/** `addresses.json` and `txs.json` are never inputs: they are rebuilt from the raw receipt layer. */
export function deriveViews(root: string, options: DerivOptions): DerivedViews {
  const label = options.network === "local" ? "LOCAL" : "LIVE";
  const dir = join(root, "receipts", options.network);
  const receipts: Json[] = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".json")) continue;
      try {
        receipts.push(JSON.parse(readFileSync(join(dir, name), "utf8")) as Json);
      } catch {
        // A corrupt raw receipt is a reader problem, not a reason to stop a run.
      }
    }
  }
  const addresses = new Map<string, Set<string>>();
  for (const record of receipts) {
    const tx = isObj(record.transaction) ? record.transaction : {};
    const target = typeof tx.to === "string" ? tx.to : null;
    if (target) {
      if (!addresses.has(target)) addresses.set(target, new Set());
      addresses.get(target)!.add(String(record.action));
    }
  }
  for (const deployment of options.deployments ?? []) {
    if (!addresses.has(deployment.address)) addresses.set(deployment.address, new Set());
    addresses.get(deployment.address)!.add(deployment.action);
  }
  const txEntries = receipts.map((record) => {
    const receipt = isObj(record.receipt) ? record.receipt : {};
    return {
      hash: record.txHash,
      action: record.action,
      block: typeof receipt.blockNumber === "number" ? receipt.blockNumber : null,
      status: receipt.status === "success" || receipt.status === "reverted" ? receipt.status : "unknown",
      network: label,
      utc: record.utc,
      receiptPath: `evidence/receipts/${options.network}/${String(record.txHash)}.json`,
    };
  });
  const addressesView = {
    schema: INDEX_SCHEMA,
    kind: "addresses",
    derivedFrom: "evidence/receipts",
    network: label,
    chainId: options.chainId,
    generatedAt: options.generatedAt,
    entries: [...addresses.entries()].map(([address, actions]) => ({
      address,
      actions: [...actions].sort(),
    })),
  };
  const txsView = {
    schema: INDEX_SCHEMA,
    kind: "transactions",
    derivedFrom: "evidence/receipts",
    network: label,
    chainId: options.chainId,
    generatedAt: options.generatedAt,
    entries: txEntries,
  };
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "addresses.json"), `${JSON.stringify(addressesView, null, 2)}\n`, "utf8");
  writeFileSync(join(root, "txs.json"), `${JSON.stringify(txsView, null, 2)}\n`, "utf8");
  return { addresses: addressesView, txs: txsView };
}

export interface PublishedBundle {
  file: string;
  index: Json;
  sha256: string;
}

/** Evidence files are immutable; publishing adds a file and moves `current` in the manifest. */
export function publishBundle(root: string, bundle: Json): PublishedBundle {
  const valid = buildBundle(bundle);
  mkdirSync(root, { recursive: true });
  const file = join(root, `${String(valid.id)}.json`);
  const bytes = Buffer.from(`${JSON.stringify(valid, null, 2)}\n`, "utf8");
  if (existsSync(file)) {
    const existing = readFileSync(file);
    if (!existing.equals(bytes)) throw new EvidenceSchemaError([`evidence file ${file} already exists with different bytes`]);
  } else {
    writeFileSync(file, bytes);
  }
  const sha256 = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  const indexPath = join(root, "index.json");
  const previous = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as Json) : null;
  const files = Array.isArray(previous?.files) ? [...(previous!.files as Json[])] : [];
  const entry = {
    id: valid.id,
    url: `/evidence/${String(valid.id)}.json`,
    sha256,
    environment: valid.environment,
    generatedAt: valid.generatedAt,
  };
  const at = files.findIndex((item) => item.id === valid.id);
  if (at >= 0) files[at] = entry;
  else files.push(entry);
  const index = {
    schema: INDEX_SCHEMA,
    current: valid.id,
    files,
  };
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return { file, index, sha256 };
}
