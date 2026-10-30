/**
 * StorageGate CLI commands: status, lock, release, refund.
 *
 * All operations share the same guarded send path as create/claim/settle:
 *  - Dry run preflight with gas estimation
 *  - Simulation with eth_call so custom error selectors are decoded before sending
 *  - Strict --live flag requirement when MAKHZAN_NETWORK=live
 *  - Strict chain id and live gate address verification
 *  - Five-state transaction record: submitted -> included -> executed -> finalized -> readBack
 *  - Receipt wait timeout and pending submission durability
 *  - Spend cap enforcement via --cap
 *  - Unit conversion enforcing exact multiples of WEI_PER_UNIT (10,000 wei)
 *  - Keys are read only from the environment / viem account, never on argv or printed
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getAddress,
  http,
  toFunctionSelector,
  type Abi,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Receipt, TxRequest } from "./cli.ts";
import { mapContractError } from "./errors.ts";
import { deriveViews, writeReceipt } from "./evidence.ts";
import type { ReadOnlySettings, Settings } from "./settings.ts";
import {
  markExecuted,
  markFinalized,
  markIncluded,
  markSubmitted,
  newRecord,
  type Finality,
  type TxRecord,
} from "./status.ts";
import { tPotToUnits, unitsToWei, WEI_PER_UNIT } from "./units.ts";

export const LIVE_GATE_ADDRESS: Hex = "0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA";
export const LIVE_CHAIN_ID = 420_420_777;

export const GATE_ABI = [
  {
    type: "function",
    name: "lock",
    stateMutability: "payable",
    inputs: [
      { name: "dealId", type: "uint32" },
      { name: "payee", type: "address" },
      { name: "minBond", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "dealId", type: "uint32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "dealId", type: "uint32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "lockOf",
    stateMutability: "view",
    inputs: [{ name: "dealId", type: "uint32" }],
    outputs: [
      { name: "payer", type: "address" },
      { name: "amount", type: "uint96" },
      { name: "payee", type: "address" },
      { name: "minBond", type: "uint64" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "makhzan",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const MAKHZAN_GATE_READS_ABI = [
  {
    type: "function",
    name: "healthOf",
    stateMutability: "view",
    inputs: [{ name: "dealId", type: "uint32" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "dealOf",
    stateMutability: "view",
    inputs: [{ name: "dealId", type: "uint32" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "startBlock", type: "uint32" },
      { name: "endBlock", type: "uint32" },
      { name: "providerId", type: "uint16" },
      { name: "flags", type: "uint8" },
      { name: "root", type: "bytes32" },
      { name: "leafCount", type: "uint24" },
      { name: "size", type: "uint32" },
      { name: "challengeIndex", type: "uint32" },
      { name: "challengeStart", type: "uint32" },
      { name: "price", type: "uint64" },
      { name: "claimed", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "providerOf",
    stateMutability: "view",
    inputs: [{ name: "who", type: "address" }],
    outputs: [
      { name: "id", type: "uint16" },
      { name: "bond", type: "uint64" },
      { name: "activeDeals", type: "uint24" },
      { name: "registered", type: "bool" },
    ],
  },
] as const;

export const ERROR_SELECTORS: Record<string, string> = {
  "0x6e360f94": "BondTooLow",
  "0x089c9987": "RefundNotAllowed",
  "0x1834e265": "NotLocked",
  "0x56cab67b": "NotPayee",
  "0x1435e357": "NotPayer",
  "0x38f21151": "BadLock",
  "0x5f0ccd7c": "AlreadyLocked",
  "0x90b8ec18": "TransferFailed",
  "0x203d82d8": "Expired",
  "0x6df20390": "Pending",
  "0xc9c61e20": "Default",
  "0x0d8dacc9": "SettledOrNone",
};

export const STATUS_NAMES: Record<number, string> = {
  0: "none",
  1: "locked",
  2: "released",
  3: "refunded",
};

export interface GateStatusCommand {
  name: "gate:status";
  dealId: number;
  gate?: Hex;
}

export interface GateLockCommand {
  name: "gate:lock";
  dealId: number;
  payee: Hex;
  minBondUnits: bigint;
  amountWei: bigint;
  gate?: Hex;
  capWei?: bigint;
  live: boolean;
}

export interface GateReleaseCommand {
  name: "gate:release";
  dealId: number;
  gate?: Hex;
  capWei?: bigint;
  live: boolean;
}

export interface GateRefundCommand {
  name: "gate:refund";
  dealId: number;
  gate?: Hex;
  capWei?: bigint;
  live: boolean;
}

export type ParsedGateCommand =
  | GateStatusCommand
  | GateLockCommand
  | GateReleaseCommand
  | GateRefundCommand;

export interface GateLockRecord {
  payer: Hex;
  amount: bigint;
  payee: Hex;
  minBond: bigint;
  status: number;
}

export interface GateChain {
  chainId(): Promise<number>;
  blockNumber(): Promise<bigint>;
  gateMakhzan(gate: Hex): Promise<Hex>;
  simulate(tx: {
    to: Hex;
    data: Hex;
    value: bigint;
    account?: Hex;
  }): Promise<{ ok: true } | { ok: false; errorName: string }>;
  estimateGas(tx: { to: Hex; data: Hex; value: bigint }): Promise<bigint>;
  gasPrice(): Promise<bigint>;
  nonce?(): Promise<number>;
  recordSubmitted?(hash: Hex, action: string, nonce?: number): Promise<void>;
  send(tx: TxRequest): Promise<Hex>;
  receipt(hash: Hex, action?: string): Promise<Receipt>;
  waitForFinality(receipt: Receipt): Promise<Finality>;
  readLock(dealId: number, gate: Hex): Promise<GateLockRecord>;
  readDeal(dealId: number): Promise<{ owner: Hex; endBlock: number; providerId: number }>;
  readHealth(dealId: number): Promise<number>;
  readProvider(who: Hex): Promise<{ id: number; bond: bigint; registered: boolean }>;
}

export interface GateCommandDeps {
  makhzanContract: Hex;
  gateContract: Hex;
  chainId?: number;
  chain: GateChain;
}

const KEY_FLAGS = new Set(["--private-key", "--privatekey", "--key", "--secret", "--mnemonic", "--seed"]);

function keyError(): Error {
  return new Error("never pass a private key on argv; export MAKHZAN_PRIVATE_KEY and read it at run time");
}

function positiveUint32(valueStr: string, name: string): number {
  if (!/^\d+$/.test(valueStr)) throw new Error(`${name} must be an integer, got ${JSON.stringify(valueStr)}`);
  const n = Number(valueStr);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 4_294_967_295) {
    throw new Error(`${name} must fit uint32 and be positive, got ${valueStr}`);
  }
  return n;
}

function parseAddress(addrStr: string, name: string): Hex {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addrStr)) {
    throw new Error(`${name} must be a 20-byte hex address, got ${JSON.stringify(addrStr)}`);
  }
  return getAddress(addrStr) as Hex;
}

function parseCap(capStr: string | undefined): bigint | undefined {
  if (capStr === undefined) return undefined;
  try {
    const units = tPotToUnits(capStr);
    if (units <= 0n) throw new Error("spend cap must be positive");
    return unitsToWei(units);
  } catch (err) {
    throw new Error(`invalid spend cap ${JSON.stringify(capStr)}: ${(err as Error).message}`);
  }
}

export function formatTpot(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n) / 10n ** 12n;
  return `${whole}.${fraction.toString().padStart(6, "0")}`;
}

export function revertNameOf(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; depth < 10 && current; depth++) {
    const candidate = current as {
      data?: string | { errorName?: string };
      cause?: unknown;
      message?: string;
      details?: string;
    };
    if (candidate.data) {
      if (typeof candidate.data === "object" && candidate.data.errorName) {
        return candidate.data.errorName;
      }
      if (typeof candidate.data === "string") {
        const selector = candidate.data.slice(0, 10).toLowerCase();
        if (ERROR_SELECTORS[selector]) return ERROR_SELECTORS[selector];
      }
    }
    const textToSearch = `${candidate.message ?? ""} ${candidate.details ?? ""}`;
    const hexMatch = textToSearch.match(/0x[0-9a-fA-F]{8}/);
    if (hexMatch && ERROR_SELECTORS[hexMatch[0].toLowerCase()]) {
      return ERROR_SELECTORS[hexMatch[0].toLowerCase()];
    }
    const match = textToSearch.match(/reverted with (?:custom error|the following reason|an error):?\s*([A-Za-z_][A-Za-z0-9_]*)/);
    if (match && match[1] && !match[1].startsWith("0x")) return match[1];
    current = candidate.cause;
  }
  return "reverted (undecoded)";
}

/** Parses argv for `gate <status|lock|release|refund>`. */
export function parseGateCommand(argv: string[]): ParsedGateCommand {
  const args = argv[0] === "gate" ? argv.slice(1) : argv;
  if (args.length === 0) {
    throw new Error("usage: gate <status|lock|release|refund>");
  }

  for (const arg of args) {
    if (KEY_FLAGS.has(arg.toLowerCase())) throw keyError();
  }

  const sub = args[0];
  const known = new Set(["status", "lock", "release", "refund"]);
  if (!known.has(sub)) throw new Error(`unknown gate command '${sub}'`);

  if (args.length < 2) {
    throw new Error(`missing <dealId>`);
  }

  const dealId = positiveUint32(args[1], "dealId");
  const rest = args.slice(2);

  const options = new Map<string, string>();
  let live = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`unexpected argument '${arg}'`);
    if (options.has(arg)) throw new Error(`duplicate option '${arg}'`);
    const val = rest[++i];
    if (val === undefined || val.startsWith("--")) throw new Error(`option '${arg}' needs a value`);
    options.set(arg, val);
  }

  const gateOption = options.has("--gate") ? parseAddress(options.get("--gate")!, "--gate") : undefined;
  const capWei = parseCap(options.get("--cap") ?? options.get("--spend-cap"));

  if (sub === "status") {
    const allowed = new Set(["--gate"]);
    for (const opt of options.keys()) {
      if (!allowed.has(opt)) throw new Error(`unexpected option '${opt}'`);
    }
    return { name: "gate:status", dealId, gate: gateOption };
  }

  if (sub === "lock") {
    const allowed = new Set(["--payee", "--min-bond", "--amount", "--gate", "--cap", "--spend-cap"]);
    for (const opt of options.keys()) {
      if (!allowed.has(opt)) throw new Error(`unexpected option '${opt}'`);
    }
    const payeeStr = options.get("--payee");
    if (!payeeStr) throw new Error("missing --payee");
    const payee = parseAddress(payeeStr, "payee");

    const minBondStr = options.get("--min-bond");
    if (!minBondStr) throw new Error("missing --min-bond");
    let minBondUnits: bigint;
    try {
      minBondUnits = tPotToUnits(minBondStr);
    } catch (err) {
      const message = (err as Error).message;
      if (/decimal/.test(message)) {
        throw new Error(`min-bond ${minBondStr} is not an exact multiple of WEI_PER_UNIT: ${message}`);
      }
      throw err;
    }

    const amountStr = options.get("--amount");
    if (!amountStr) throw new Error("missing --amount");
    let amountUnits: bigint;
    try {
      amountUnits = tPotToUnits(amountStr);
    } catch (err) {
      const message = (err as Error).message;
      if (/decimal/.test(message)) {
        throw new Error(`amount ${amountStr} is not an exact multiple of WEI_PER_UNIT: ${message}`);
      }
      throw err;
    }
    if (amountUnits <= 0n) throw new Error("amount must be positive");
    const amountWei = unitsToWei(amountUnits);
    if (amountWei > 2n ** 96n - 1n) throw new Error("amount exceeds uint96 cap");

    return {
      name: "gate:lock",
      dealId,
      payee,
      minBondUnits,
      amountWei,
      gate: gateOption,
      capWei,
      live,
    };
  }

  if (sub === "release" || sub === "refund") {
    const allowed = new Set(["--gate", "--cap", "--spend-cap"]);
    for (const opt of options.keys()) {
      if (!allowed.has(opt)) throw new Error(`unexpected option '${opt}'`);
    }
    return {
      name: sub === "release" ? "gate:release" : "gate:refund",
      dealId,
      gate: gateOption,
      capWei,
      live,
    };
  }

  throw new Error(`unknown gate command '${sub}'`);
}

/** Executes a parsed gate command with guarded checks. */
export async function executeGate(
  command: ParsedGateCommand,
  deps: GateCommandDeps,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TxRecord> {
  const gateContract = command.gate ?? deps.gateContract;
  const isLiveNetwork = env.MAKHZAN_NETWORK === "live";

  if (command.name !== "gate:status") {
    if (isLiveNetwork && !command.live) {
      throw new Error("MAKHZAN_NETWORK=live needs the explicit --live flag; nothing was sent");
    }
    if (!isLiveNetwork && command.live) {
      throw new Error("--live needs MAKHZAN_NETWORK=live; nothing was sent");
    }
  }

  const observedChainId = await deps.chain.chainId();
  const expectedChainId = deps.chainId ?? (isLiveNetwork ? LIVE_CHAIN_ID : undefined);
  if (expectedChainId !== undefined && observedChainId !== expectedChainId) {
    throw new Error(`refusing: the RPC is chain ${observedChainId}, settings say ${expectedChainId}`);
  }
  if (isLiveNetwork) {
    if (observedChainId !== LIVE_CHAIN_ID) {
      throw new Error(`refusing: the RPC is chain ${observedChainId}, settings say ${LIVE_CHAIN_ID}`);
    }
    if (gateContract.toLowerCase() !== LIVE_GATE_ADDRESS.toLowerCase()) {
      throw new Error(
        `refusing: gate ${gateContract} does not match recorded live gate ${LIVE_GATE_ADDRESS}`,
      );
    }
  }

  const gateMakhzan = await deps.chain.gateMakhzan(gateContract);
  if (gateMakhzan.toLowerCase() !== deps.makhzanContract.toLowerCase()) {
    throw new Error(
      `gate ${gateContract} points at a different Makhzan (${gateMakhzan}), not ${deps.makhzanContract}; refusing to mix them`,
    );
  }

  // --- Read-only `gate:status` ---
  if (command.name === "gate:status") {
    const record = newRecord("gate:status");
    const [head, lock, deal, health] = await Promise.all([
      deps.chain.blockNumber(),
      deps.chain.readLock(command.dealId, gateContract),
      deps.chain.readDeal(command.dealId),
      deps.chain.readHealth(command.dealId),
    ]);
    const payeeProvider = await deps.chain.readProvider(lock.payee);
    const providerBond = payeeProvider.id === deal.providerId ? payeeProvider.bond : 0n;

    let decision: "healthy" | "pending" | "default" | "expired" | "settled-or-none";
    if (health === 1) {
      decision = head < BigInt(deal.endBlock) ? "healthy" : "expired";
    } else if (health === 2) {
      decision = "pending";
    } else if (health === 3) {
      decision = "default";
    } else {
      decision = "settled-or-none";
    }

    const locked = lock.status === 1;
    const bondOk = lock.minBond === 0n || providerBond >= lock.minBond;
    const releaseWouldPass = locked && decision === "healthy" && bondOk;

    let refusalReason: string;
    if (!locked) {
      refusalReason = `not locked (status ${lock.status} = ${STATUS_NAMES[lock.status] ?? "unknown"})`;
    } else if (decision !== "healthy") {
      refusalReason = `guard not healthy: ${decision}`;
    } else if (!bondOk) {
      refusalReason = `BondTooLow: payee provider bond ${formatTpot(providerBond * BigInt(WEI_PER_UNIT))} tPOT < floor ${formatTpot(lock.minBond * BigInt(WEI_PER_UNIT))} tPOT`;
    } else {
      refusalReason = "all release conditions met";
    }

    record.readBack = {
      dealId: command.dealId,
      gate: gateContract,
      makhzan: deps.makhzanContract,
      currentBlock: Number(head),
      lock: {
        payer: lock.payer,
        payee: lock.payee,
        amountWei: lock.amount.toString(),
        amountTpot: formatTpot(lock.amount),
        minBondUnits: lock.minBond.toString(),
        minBondTpot: formatTpot(lock.minBond * BigInt(WEI_PER_UNIT)),
        status: lock.status,
        statusName: STATUS_NAMES[lock.status] ?? "unknown",
      },
      deal: {
        owner: deal.owner,
        endBlock: deal.endBlock,
        providerId: deal.providerId,
        health,
        guardDecision: decision,
      },
      provider: {
        id: payeeProvider.id,
        bondUnits: providerBond.toString(),
        bondTpot: formatTpot(providerBond * BigInt(WEI_PER_UNIT)),
        registered: payeeProvider.registered,
      },
      verdict: {
        releaseWouldPass,
        reason: refusalReason,
      },
    };
    return record;
  }

  // --- Transactions: lock, release, refund ---
  const record = newRecord(command.name);
  let data: Hex;
  let value: bigint = 0n;

  if (command.name === "gate:lock") {
    data = encodeFunctionData({
      abi: GATE_ABI,
      functionName: "lock",
      args: [command.dealId, command.payee, command.minBondUnits],
    });
    value = command.amountWei;
  } else if (command.name === "gate:release") {
    data = encodeFunctionData({
      abi: GATE_ABI,
      functionName: "release",
      args: [command.dealId],
    });
  } else {
    data = encodeFunctionData({
      abi: GATE_ABI,
      functionName: "refund",
      args: [command.dealId],
    });
  }

  // Preflight 1: simulate via eth_call
  const sim = await deps.chain.simulate({ to: gateContract, data, value });
  if (!sim.ok) {
    throw new Error(`refusing: call would revert with ${sim.errorName}`);
  }

  // Preflight 2: estimate gas
  const estimate = await deps.chain.estimateGas({ to: gateContract, data, value });
  const gasPrice = await deps.chain.gasPrice();
  const gas = (estimate * 12n) / 10n;

  // Preflight 3: spend cap check
  const estimatedSpend = value + gas * gasPrice;
  if (command.capWei !== undefined && estimatedSpend > command.capWei) {
    throw new Error(
      `refusing: estimated spend ${formatTpot(estimatedSpend)} tPOT exceeds spend cap ${formatTpot(command.capWei)} tPOT`,
    );
  }

  const tx: TxRequest = {
    to: gateContract,
    data,
    value,
    gas,
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: 0n,
  };

  const nonce = deps.chain.nonce ? await deps.chain.nonce() : 0;
  const hash = await deps.chain.send(tx);
  markSubmitted(record, hash, nonce);
  await deps.chain.recordSubmitted?.(hash, command.name, nonce);

  const receipt = await deps.chain.receipt(hash, command.name);
  markIncluded(record, receipt.blockNumber, receipt.blockHash);
  if (receipt.status === "reverted") {
    markExecuted(record, "reverted", receipt.reason ?? "transaction reverted without a reason");
    throw new Error(mapContractError(receipt.reason ?? "transaction reverted"));
  }

  markExecuted(record, "success");
  markFinalized(record, await deps.chain.waitForFinality(receipt));

  const lockReadBack = await deps.chain.readLock(command.dealId, gateContract);
  record.readBack = {
    dealId: command.dealId,
    gate: gateContract,
    lock: {
      payer: lockReadBack.payer,
      payee: lockReadBack.payee,
      amountWei: lockReadBack.amount.toString(),
      amountTpot: formatTpot(lockReadBack.amount),
      minBondUnits: lockReadBack.minBond.toString(),
      minBondTpot: formatTpot(lockReadBack.minBond * BigInt(WEI_PER_UNIT)),
      status: lockReadBack.status,
      statusName: STATUS_NAMES[lockReadBack.status] ?? "unknown",
    },
  };

  return record;
}

/** Constructs live or local viem GateCommandDeps. */
export function makeGateDeps(
  settings: Settings | ReadOnlySettings,
  gateAddress?: Hex,
  env: NodeJS.ProcessEnv = process.env,
): GateCommandDeps {
  const gateContract = gateAddress ?? (env.MAKHZAN_GATE ? (parseAddress(env.MAKHZAN_GATE, "MAKHZAN_GATE") as Hex) : LIVE_GATE_ADDRESS);
  const evidenceDir = env.MAKHZAN_EVIDENCE_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../evidence");
  const chain = defineChain({
    id: settings.chainId,
    name: settings.network === "local" ? "makhzan-local" : `makhzan-${settings.chainId}`,
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
    rpcUrls: { default: { http: [settings.rpcUrl] } },
  });
  const transport = http(settings.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const hasKey = "key" in settings && Boolean(settings.key);
  const account = hasKey ? privateKeyToAccount((settings as Settings).key) : undefined;
  const walletClient = hasKey ? createWalletClient({ chain, transport, account: account! }) : undefined;

  const capture = async (
    hash: Hex,
    action: string,
    receipt: { status: string; blockNumber: bigint; gasUsed?: bigint },
  ): Promise<void> => {
    try {
      const tx = await publicClient.getTransaction({ hash }).catch(() => ({ hash }));
      const utc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      writeReceipt(evidenceDir, {
        network: settings.network,
        action,
        txHash: hash,
        utc,
        transaction: tx,
        receipt: {
          status: receipt.status,
          blockNumber: Number(receipt.blockNumber),
          gasUsed: receipt.gasUsed === undefined ? null : receipt.gasUsed.toString(),
        },
      });
      deriveViews(evidenceDir, {
        network: settings.network,
        chainId: settings.chainId,
        generatedAt: utc,
      });
    } catch (err) {
      console.error(`warning: receipt evidence not written (${(err as Error).message})`);
    }
  };

  const recordSubmitted = async (hash: Hex, action: string, nonce?: number): Promise<void> => {
    const dir = join(evidenceDir, "submitted", settings.network);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${hash}.json`);
    const record = {
      schema: "makhzan.submitted/v0",
      network: settings.network === "local" ? "LOCAL" : "LIVE",
      action,
      txHash: hash,
      nonce: nonce ?? null,
      utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  };

  return {
    makhzanContract: settings.contract,
    gateContract,
    chainId: settings.chainId,
    chain: {
      async chainId() {
        return publicClient.getChainId();
      },
      async blockNumber() {
        return publicClient.getBlockNumber();
      },
      async gateMakhzan(gate: Hex) {
        return (await publicClient.readContract({
          address: gate,
          abi: GATE_ABI,
          functionName: "makhzan",
        })) as Hex;
      },
      async simulate(tx) {
        try {
          await publicClient.call({
            account: account?.address,
            to: tx.to,
            data: tx.data,
            value: tx.value,
          });
          return { ok: true as const };
        } catch (err: any) {
          return { ok: false as const, errorName: revertNameOf(err) };
        }
      },
      async estimateGas(tx) {
        return publicClient.estimateGas({
          account: account?.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        });
      },
      async gasPrice() {
        return publicClient.getGasPrice();
      },
      async nonce() {
        if (!account) return 0;
        return publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
      },
      recordSubmitted,
      async send(tx: TxRequest) {
        if (!walletClient || !account) throw new Error("a signing key is required to send transactions");
        return walletClient.sendTransaction({
          account,
          to: tx.to,
          data: tx.data,
          value: tx.value,
          gas: tx.gas,
          maxFeePerGas: tx.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
          chain,
        });
      },
      async receipt(hash: Hex, action = "transaction"): Promise<Receipt> {
        const timeoutMs = (settings as Settings).receiptTimeoutMs ?? 120_000;
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: timeoutMs });
        await capture(hash, action, receipt);
        return {
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
        };
      },
      async waitForFinality(receipt: Receipt): Promise<Finality> {
        if (settings.network === "local") return { kind: "heuristic", confirmations: 1 };
        for (let attempt = 0; attempt < 600; attempt++) {
          const finalized = await publicClient.getBlock({ blockTag: "finalized" });
          if (finalized.number >= receipt.blockNumber) return { kind: "tag", tag: "finalized" };
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw new Error("no finalized block covered the receipt in time");
      },
      async readLock(dealId: number, gate: Hex) {
        const [payer, amount, payee, minBond, status] = (await publicClient.readContract({
          address: gate,
          abi: GATE_ABI,
          functionName: "lockOf",
          args: [dealId],
        })) as readonly [Hex, bigint, Hex, bigint, number];
        return { payer, amount, payee, minBond, status };
      },
      async readDeal(dealId: number) {
        const d = (await publicClient.readContract({
          address: settings.contract,
          abi: MAKHZAN_GATE_READS_ABI,
          functionName: "dealOf",
          args: [dealId],
        })) as readonly [Hex, number, number, number, number, Hex, number, number, number, number, bigint, bigint];
        return { owner: d[0], endBlock: Number(d[2]), providerId: Number(d[3]) };
      },
      async readHealth(dealId: number) {
        return (await publicClient.readContract({
          address: settings.contract,
          abi: MAKHZAN_GATE_READS_ABI,
          functionName: "healthOf",
          args: [dealId],
        })) as number;
      },
      async readProvider(who: Hex) {
        const p = (await publicClient.readContract({
          address: settings.contract,
          abi: MAKHZAN_GATE_READS_ABI,
          functionName: "providerOf",
          args: [who],
        })) as readonly [number, bigint, number, boolean];
        return { id: Number(p[0]), bond: p[1], registered: p[3] };
      },
    },
  };
}
