/** Five-state transaction pipeline shared by the CLI and the daemon. */
export type Hex = `0x${string}`;
export type Finality =
  | { kind: "tag"; tag: "finalized" }
  | { kind: "heuristic"; confirmations: number };

export interface TxRecord {
  label?: string;
  submitted?: { hash: Hex; nonce: number };
  included?: { blockNumber: bigint; blockHash: Hex };
  executed?: { status: "success" | "reverted"; reason?: string };
  finalized?: Finality;
  readBack?: Record<string, unknown>;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export function newRecord(label?: string): TxRecord {
  return label ? { label } : {};
}

export function markSubmitted(r: TxRecord, hash: Hex, nonce: number): TxRecord {
  if (r.submitted) throw new Error("transaction already submitted");
  if (!HASH_RE.test(hash)) throw new Error("transaction hash must be 32 bytes of hex");
  if (!Number.isInteger(nonce) || nonce < 0) throw new Error("nonce must be a non-negative integer");
  r.submitted = { hash, nonce };
  return r;
}

export function markIncluded(r: TxRecord, blockNumber: bigint, blockHash: Hex): TxRecord {
  if (!r.submitted) throw new Error("transaction is not submitted yet");
  if (r.included) throw new Error("transaction already included");
  if (typeof blockNumber !== "bigint" || blockNumber < 0n) throw new Error("block number must be a bigint");
  if (!HASH_RE.test(blockHash)) throw new Error("block hash must be 32 bytes of hex");
  r.included = { blockNumber, blockHash };
  return r;
}

export function markExecuted(r: TxRecord, status: "success" | "reverted", reason?: string): TxRecord {
  if (!r.included) throw new Error("transaction is not included yet");
  if (r.executed) throw new Error("transaction already executed");
  if (status !== "success" && status !== "reverted") throw new Error("status must be success or reverted");
  if (status === "reverted" && (!reason || reason.trim() === "")) {
    throw new Error("a reverted transaction must keep its verbatim reason");
  }
  r.executed = status === "success" ? { status } : { status, reason };
  return r;
}

export function markFinalized(r: TxRecord, observation: Finality): TxRecord {
  if (!r.executed) throw new Error("transaction is not executed yet");
  if (r.finalized) throw new Error("transaction already finalized");
  if (!observation) throw new Error("a finality observation is required");
  if (observation.kind === "tag") {
    if (observation.tag !== "finalized") throw new Error("only the finalized tag is accepted");
  } else if (observation.kind === "heuristic") {
    if (!Number.isInteger(observation.confirmations) || observation.confirmations < 1) {
      throw new Error("heuristic finality needs a positive confirmation count");
    }
  } else {
    throw new Error("unknown finality observation");
  }
  r.finalized = observation;
  return r;
}

export function addReadBack(r: TxRecord, name: string, value: unknown): TxRecord {
  if (!r.executed) throw new Error("transaction is not executed yet");
  if (r.executed.status === "reverted") throw new Error("a reverted transaction has no read-back");
  if (!name) throw new Error("read-back needs a name");
  r.readBack = { ...(r.readBack ?? {}), [name]: value };
  return r;
}

export function stageOf(r: TxRecord): "empty" | "submitted" | "included" | "executed" | "finalized" {
  if (r.finalized) return "finalized";
  if (r.executed) return "executed";
  if (r.included) return "included";
  if (r.submitted) return "submitted";
  return "empty";
}

export function assertCanAct(r: TxRecord): void {
  if (!r.submitted) throw new Error("transaction has not been submitted");
  if (!r.executed) throw new Error(`transaction has not been executed (stage: ${stageOf(r)})`);
  if (r.executed.status === "reverted") {
    throw new Error(r.executed.reason ?? "transaction reverted without a reason");
  }
}
