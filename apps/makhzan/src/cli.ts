/** Client CLI: argument parsing, validation and transaction execution. */
import type { Hex } from "./merkle.ts";
import type { TxRecord } from "./status.ts";

export type CommandName = "upload" | "create" | "challenge" | "watch" | "claim" | "settle" | "report";

export interface UploadCommand { name: "upload"; file: string; providerId: number }
export interface CreateCommand {
  name: "create";
  root: Hex;
  size: number;
  leafCount: number;
  providerId: number;
  duration: number;
  price: string;
  units: bigint;
  value: bigint;
}
export interface IdCommand { name: "challenge" | "watch" | "claim" | "settle"; dealId: number }
export interface ReportCommand { name: "report" }
export type ParsedCommand = UploadCommand | CreateCommand | IdCommand | ReportCommand;

export interface TxRequest {
  to: Hex;
  data: Hex;
  value: bigint;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}
export interface Receipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  blockHash: Hex;
  reason?: string;
}
export interface CommandDeps {
  chain: {
    estimateGas(tx: Omit<TxRequest, "gas" | "maxFeePerGas" | "maxPriorityFeePerGas">): Promise<bigint>;
    gasPrice(): Promise<bigint>;
    send(tx: TxRequest): Promise<Hex>;
    receipt(hash: Hex): Promise<Receipt>;
    waitForFinality(receipt: Receipt): Promise<import("./status.ts").Finality>;
    read(dealId: number): Promise<Record<string, unknown>>;
    pollDeal?(dealId: number): Promise<boolean>;
  };
  uploader?: (file: string, providerId: number) => Promise<{ root: Hex; size: number; leafCount: number }>;
  reporter?: () => Promise<string>;
}

/** Parses and validates argv before any transaction is built. */
export function parseCommand(_argv: string[], _options: { blockSize?: number } = {}): ParsedCommand {
  throw new Error("not implemented");
}

/** Executes a parsed command with the documented fee policy and five-state record. */
export async function execute(_command: ParsedCommand, _deps: CommandDeps): Promise<TxRecord> {
  throw new Error("not implemented");
}
