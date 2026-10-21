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

export function newRecord(_label?: string): TxRecord {
  throw new Error("not implemented");
}
export function markSubmitted(_r: TxRecord, _hash: Hex, _nonce: number): TxRecord {
  throw new Error("not implemented");
}
export function markIncluded(_r: TxRecord, _blockNumber: bigint, _blockHash: Hex): TxRecord {
  throw new Error("not implemented");
}
export function markExecuted(_r: TxRecord, _status: "success" | "reverted", _reason?: string): TxRecord {
  throw new Error("not implemented");
}
export function markFinalized(_r: TxRecord, _observation: Finality): TxRecord {
  throw new Error("not implemented");
}
export function addReadBack(_r: TxRecord, _name: string, _value: unknown): TxRecord {
  throw new Error("not implemented");
}
export function stageOf(_r: TxRecord): "empty" | "submitted" | "included" | "executed" | "finalized" {
  throw new Error("not implemented");
}
export function assertCanAct(_r: TxRecord): void {
  throw new Error("not implemented");
}
