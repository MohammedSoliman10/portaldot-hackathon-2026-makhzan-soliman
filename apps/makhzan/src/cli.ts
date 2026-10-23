/** Client CLI: argument parsing, validation and transaction execution. */
import { encodeFunctionData } from "viem";
import { mapContractError } from "./errors.ts";
import type { Hex } from "./merkle.ts";
import { markExecuted, markFinalized, markIncluded, markSubmitted, newRecord, type Finality, type TxRecord } from "./status.ts";
import { writeRound, type RoundRecord } from "./evidenceWriter.ts";
import { MAX_UNITS, tPotToUnits, unitsToWei } from "./units.ts";

export type CommandName = "upload" | "create" | "challenge" | "watch" | "claim" | "settle" | "resolve" | "report";

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
export interface IdCommand { name: "challenge" | "watch" | "claim" | "settle" | "resolve"; dealId: number }
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
  contract: Hex;
  chain: {
    estimateGas(tx: Omit<TxRequest, "gas" | "maxFeePerGas" | "maxPriorityFeePerGas">): Promise<bigint>;
    gasPrice(): Promise<bigint>;
    nonce?(): Promise<number>;
    send(tx: TxRequest): Promise<Hex>;
    receipt(hash: Hex, action?: string): Promise<Receipt>;
    waitForFinality(receipt: Receipt): Promise<Finality>;
    read(target: number | "created"): Promise<Record<string, unknown>>;
    pollDeal?(dealId: number): Promise<boolean>;
  };
  uploader?: (file: string, providerId: number) => Promise<{ root: Hex; size: number; leafCount: number }>;
  reporter?: () => Promise<string>;
}

const COMMANDS = new Set(["upload", "create", "challenge", "watch", "claim", "settle", "resolve", "report"]);
const KEY_FLAGS = new Set(["--private-key", "--privatekey", "--key", "--secret", "--mnemonic", "--seed"]);
const CREATE_OPTIONS = ["--root", "--size", "--leaf-count", "--provider", "--duration", "--price"];

const ABI = [
  {
    type: "function", name: "createDeal", stateMutability: "payable",
    inputs: [
      { name: "providerId", type: "uint16" }, { name: "root", type: "bytes32" },
      { name: "leafCount", type: "uint24" }, { name: "size", type: "uint32" },
      { name: "durationBlocks", type: "uint32" }, { name: "price", type: "uint64" },
    ], outputs: [],
  },
  { type: "function", name: "challenge", stateMutability: "nonpayable", inputs: [{ name: "dealId", type: "uint32" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "dealId", type: "uint32" }], outputs: [] },
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "dealId", type: "uint32" }], outputs: [] },
  { type: "function", name: "resolve", stateMutability: "nonpayable", inputs: [{ name: "dealId", type: "uint32" }], outputs: [] },
] as const;

function keyError(): Error {
  return new Error("never pass a private key on argv; export MAKHZAN_PRIVATE_KEY and read it at run time");
}

function integer(text: string, name: string): number {
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be an integer, got ${JSON.stringify(text)}`);
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} is too large`);
  return value;
}

function positive(value: number, name: string): number {
  if (value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

function split(rest: string[], allowed: string[]): { positional: string[]; options: Map<string, string> } {
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      if (!allowed.includes(arg)) throw new Error(`unexpected option '${arg}'`);
      if (options.has(arg)) throw new Error(`duplicate option '${arg}'`);
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`option '${arg}' needs a value`);
      options.set(arg, value);
      i++;
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

function required(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  if (value === undefined) throw new Error(`missing ${name}`);
  return value;
}

/** Parses and validates argv before any transaction is built. */
export function parseCommand(argv: string[], options: { blockSize?: number } = {}): ParsedCommand {
  const [name, ...rest] = argv;
  if (!name) throw new Error("usage: cli <upload|create|challenge|watch|claim|settle|resolve|report>");
  for (const arg of [name, ...rest]) {
    if (KEY_FLAGS.has(arg.toLowerCase())) throw keyError();
  }
  if (!COMMANDS.has(name)) throw new Error(`unknown command '${name}'`);

  if (name === "upload") {
    const { positional, options: opts } = split(rest, ["--provider"]);
    if (positional.length === 0) throw new Error("missing <file>");
    if (positional.length > 1) throw new Error(`unexpected argument '${positional[1]}'`);
    const providerId = positive(integer(required(opts, "--provider"), "provider"), "provider");
    if (providerId > 65_535) throw new Error("provider must fit uint16");
    return { name: "upload", file: positional[0], providerId };
  }

  if (name === "create") {
    const { positional, options: opts } = split(rest, CREATE_OPTIONS);
    if (positional.length > 0) throw new Error(`unexpected argument '${positional[0]}'`);
    const root = required(opts, "--root");
    if (!/^0x[0-9a-fA-F]{64}$/.test(root)) throw new Error("root must be 32 bytes of hex");
    const size = positive(integer(required(opts, "--size"), "size"), "size");
    if (size > 4_294_967_295) throw new Error("size must fit uint32");
    const leafCount = positive(integer(required(opts, "--leaf-count"), "leaf count"), "leaf count");
    const blockSize = options.blockSize ?? 1024;
    const expected = Math.ceil(size / blockSize);
    if (leafCount !== expected) throw new Error(`leaf count ${leafCount} does not match ceil(size/blockSize)=${expected}`);
    if (leafCount > 16_777_215) throw new Error("leaf count must fit uint24");
    const providerId = positive(integer(required(opts, "--provider"), "provider"), "provider");
    if (providerId > 65_535) throw new Error("provider must fit uint16");
    const duration = positive(integer(required(opts, "--duration"), "duration"), "duration");
    if (duration > 4_294_967_295) throw new Error("duration must fit uint32");
    const price = required(opts, "--price");
    let units: bigint;
    try {
      units = tPotToUnits(price);
    } catch (err) {
      const message = (err as Error).message;
      if (/decimal/.test(message)) {
        throw new Error(`price ${price} is not an exact multiple of WEI_PER_UNIT: ${message}`);
      }
      throw err;
    }
    if (units <= 0n) throw new Error("price must be positive");
    if (units > MAX_UNITS) throw new Error("price exceeds the uint64 unit cap");
    return {
      name: "create", root: root as Hex, size, leafCount, providerId, duration,
      price, units, value: unitsToWei(units),
    };
  }

  if (name === "report") {
    const { positional, options: opts } = split(rest, []);
    if (positional.length > 0) throw new Error(`unexpected argument '${positional[0]}'`);
    if (opts.size > 0) throw new Error("report takes no options");
    return { name: "report" };
  }

  const { positional, options: opts } = split(rest, []);
  if (positional.length === 0) throw new Error("missing <dealId>");
  if (positional.length > 1) throw new Error(`unexpected argument '${positional[1]}'`);
  if (opts.size > 0) throw new Error(`${name} takes no options`);
  const dealId = positive(integer(positional[0], "dealId"), "dealId");
  if (dealId > 4_294_967_295) throw new Error("dealId must fit uint32");
  return { name: name as IdCommand["name"], dealId };
}

function txFor(command: CreateCommand | IdCommand): { data: Hex; value: bigint } {
  if (command.name === "create") {
    return {
      data: encodeFunctionData({
        abi: ABI,
        functionName: "createDeal",
        args: [command.providerId, command.root, command.leafCount, command.size, command.duration, command.units],
      }),
      value: command.value,
    };
  }
  if (command.name === "watch") throw new Error("watch has no transaction");
  const functionName = command.name;
  return {
    data: encodeFunctionData({ abi: ABI, functionName, args: [command.dealId] }),
    value: 0n,
  };
}

/** Executes a parsed command with the documented fee policy and five-state record. */
export async function execute(command: ParsedCommand, deps: CommandDeps): Promise<TxRecord> {
  const record = newRecord(command.name);

  if (command.name === "upload") {
    if (!deps.uploader) throw new Error("upload needs an uploader");
    const ack = await deps.uploader(command.file, command.providerId);
    record.readBack = { root: ack.root, size: ack.size, leafCount: ack.leafCount };
    return record;
  }
  if (command.name === "report") {
    if (!deps.reporter) throw new Error("report needs a reporter");
    record.readBack = { report: await deps.reporter() };
    return record;
  }
  if (command.name === "watch") {
    if (!deps.chain.pollDeal) throw new Error("watch needs a chain poller");
    if (!(await deps.chain.pollDeal(command.dealId))) {
      throw new Error(`deal ${command.dealId} did not resolve`);
    }
    record.readBack = await deps.chain.read(command.dealId);
    return record;
  }

  const request = txFor(command);
  const estimate = await deps.chain.estimateGas({ to: deps.contract, data: request.data, value: request.value });
  const gasPrice = await deps.chain.gasPrice();
  const tx: TxRequest = {
    to: deps.contract,
    data: request.data,
    value: request.value,
    gas: (estimate * 12n) / 10n, // gas = estimate x 1.2
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: 0n,
  };
  const nonce = deps.chain.nonce ? await deps.chain.nonce() : 0;
  const hash = await deps.chain.send(tx);
  markSubmitted(record, hash, nonce);
  const receipt = await deps.chain.receipt(hash, command.name);
  markIncluded(record, receipt.blockNumber, receipt.blockHash);
  if (receipt.status === "reverted") {
    markExecuted(record, "reverted", receipt.reason ?? "transaction reverted without a reason");
    throw new Error(mapContractError(receipt.reason ?? "transaction reverted"));
  }
  markExecuted(record, "success");
  markFinalized(record, await deps.chain.waitForFinality(receipt));
  record.readBack = await deps.chain.read(command.name === "create" ? "created" : command.dealId);
  return record;
}

/** The `report` command's implementation: sanitised round records written to one file. */
export async function reportRounds(records: RoundRecord[], path: string): Promise<string> {
  for (const record of records) await writeRound(record, path);
  return path;
}

/** Reads the signing key at run time. It is never logged, never put on argv and never stored. */
export function keyFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.MAKHZAN_PRIVATE_KEY;
  if (!key) throw new Error("MAKHZAN_PRIVATE_KEY is not set; the CLI never accepts a key on argv");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("MAKHZAN_PRIVATE_KEY must be 32 bytes of hex");
  return key;
}
