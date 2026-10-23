/**
 * Deploy command for Makhzan.
 *
 * The network is never implied: MAKHZAN_NETWORK must be `local` or `live`. The signing key is read
 * from MAKHZAN_PRIVATE_KEY only, never from argv, never logged, never written to a record. The
 * artifact is a path so a different compiler output (for example resolc after G01/G02) can be used.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  getAddress,
  http,
  keccak256,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const WEI_PER_UNIT = 10_000n;
export const UINT64_MAX = 2n ** 64n - 1n;
export const LOCAL_CHAIN_ID = 420_420_777;
export const LOCAL_RPC = "http://127.0.0.1:8549";
export const DEFAULT_MIN_BOND_WEI = 100_000_000_000_000_000_000n; // 1e20 wei = 1e16 units
export const DEFAULT_RESERVE_TPOT = 100n;
/** Bounded receipt attempts; the RPC is ~95.5% reliable, so one timeout must not lose the deploy. */
export const RECEIPT_ATTEMPTS = 5;

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DEFAULT_ARTIFACT = "contracts/out/Makhzan.sol/Makhzan.json";

export class DeployError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployError";
  }
}

export interface DeploySettings {
  network: "local" | "live";
  rpcUrl: string;
  chainId: number;
  privateKey: Hex;
}

export interface DeployArgs {
  dryRun: boolean;
  resume?: Hex;
  forceNew: boolean;
  artifact: string;
  out?: string;
  minBondWei: bigint;
  challengeWindow: number;
  challengeBlockSize: number;
  slashBps: number;
  minDurationBlocks: number;
  maxDurationBlocks: number;
  reserveTpot: bigint;
}

/** Every chain interaction the deploy needs, so tests can drive the resume path without an RPC. */
export interface DeployDeps {
  chainId(): Promise<number>;
  estimateGas(data: Hex): Promise<bigint>;
  gasPrice(): Promise<bigint>;
  balance(address: Hex): Promise<bigint>;
  nonce(address: Hex): Promise<number>;
  send(data: Hex): Promise<Hex>;
  receipt(hash: Hex): Promise<{ status: "success" | "reverted"; contractAddress?: Hex | null; blockNumber: bigint }>;
  code(address: Hex): Promise<Hex | undefined>;
  peek(address: Hex): Promise<Hex[]>;
  sleep(ms: number): Promise<void>;
}

export interface DeployRuntime {
  deps?: DeployDeps;
  /** Overrides `evidence/deployments/pending-<network>-<chainId>.json`; tests use a temp file. */
  pendingFile?: string;
}

export interface DeploymentRecord {
  network: "local" | "live";
  evidenceLabel: "[local run]" | "[live run]";
  chainId: number;
  rpcUrl: string;
  deployer: string;
  address: string;
  txHash: string;
  blockNumber: string;
  codeHash: string;
  runtimeBytes: number;
  artifact: string;
  constructor: {
    challengeWindowBlocks: number;
    challengeBlockSize: number;
    slashBps: number;
    minBondUnits: string;
    minBondWei: string;
    minDurationBlocks: number;
    maxDurationBlocks: number;
  };
  estimatedCostTpot: string;
  utc: string;
}

/** Absolute path for a user-supplied or default artifact/record path. */
export function repoPath(path: string): string {
  return isAbsolute(path) ? path : resolve(REPO_ROOT, path);
}

/** Network and key settings. There is no default network and no key on argv. */
export function deploySettings(env: NodeJS.ProcessEnv): DeploySettings {
  const network = env.MAKHZAN_NETWORK;
  if (network !== "local" && network !== "live") {
    throw new DeployError(`MAKHZAN_NETWORK must be set to "local" or "live" (got ${JSON.stringify(network ?? null)})`);
  }
  let rpcUrl: string;
  let chainId: number;
  if (network === "live") {
    if (!env.MAKHZAN_RPC_URL) throw new DeployError("MAKHZAN_NETWORK=live needs MAKHZAN_RPC_URL");
    if (!env.MAKHZAN_CHAIN_ID) throw new DeployError("MAKHZAN_NETWORK=live needs MAKHZAN_CHAIN_ID");
    rpcUrl = env.MAKHZAN_RPC_URL;
    chainId = integer(env.MAKHZAN_CHAIN_ID, "MAKHZAN_CHAIN_ID");
  } else {
    rpcUrl = env.MAKHZAN_RPC_URL ?? LOCAL_RPC;
    chainId = env.MAKHZAN_CHAIN_ID ? integer(env.MAKHZAN_CHAIN_ID, "MAKHZAN_CHAIN_ID") : LOCAL_CHAIN_ID;
  }
  const privateKey = env.MAKHZAN_PRIVATE_KEY;
  if (!privateKey) throw new DeployError("MAKHZAN_PRIVATE_KEY is not set; keys are never accepted on argv");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new DeployError("MAKHZAN_PRIVATE_KEY must be 32 bytes of hex");
  }
  return { network, rpcUrl, chainId, privateKey: privateKey as Hex };
}

function integer(text: string, name: string): number {
  if (!/^\d+$/.test(text)) throw new DeployError(`${name} must be an integer, got ${JSON.stringify(text)}`);
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new DeployError(`${name} is too large`);
  return value;
}

/** Parses deploy flags. `--min-bond` is in native wei and must be a whole number of protocol units. */
export function parseDeployArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): DeployArgs {
  const options = new Map<string, string>();
  let dryRun = false;
  let forceNew = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--force-new") {
      forceNew = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new DeployError(`unexpected argument ${JSON.stringify(arg)}`);
    const value = argv[++i];
    if (value === undefined) throw new DeployError(`${arg} needs a value`);
    options.set(arg, value);
  }
  const known = new Set([
    "--artifact",
    "--out",
    "--min-bond",
    "--window",
    "--block-size",
    "--slash-bps",
    "--min-duration",
    "--max-duration",
    "--reserve-tpot",
    "--resume",
  ]);
  for (const key of options.keys()) {
    if (!known.has(key)) throw new DeployError(`unknown option ${key}`);
  }
  const minBondWei = bigint(options.get("--min-bond") ?? DEFAULT_MIN_BOND_WEI.toString(), "--min-bond");
  if (minBondWei <= 0n) throw new DeployError("--min-bond must be positive");
  if (minBondWei % WEI_PER_UNIT !== 0n) {
    throw new DeployError(`--min-bond must be a whole number of protocol units (a multiple of ${WEI_PER_UNIT} wei)`);
  }
  const minBondUnits = minBondWei / WEI_PER_UNIT;
  if (minBondUnits > UINT64_MAX) throw new DeployError("--min-bond exceeds the uint64 unit cap");
  const challengeWindow = integer(options.get("--window") ?? "10", "--window");
  const challengeBlockSize = integer(options.get("--block-size") ?? "1024", "--block-size");
  const slashBps = integer(options.get("--slash-bps") ?? "2000", "--slash-bps");
  const minDurationBlocks = integer(options.get("--min-duration") ?? "10", "--min-duration");
  const maxDurationBlocks = integer(options.get("--max-duration") ?? "1000", "--max-duration");
  if (challengeWindow <= 0) throw new DeployError("--window must be positive");
  if (challengeBlockSize < 1024 || challengeBlockSize > 4096) {
    throw new DeployError("--block-size must be between 1024 and 4096 bytes (the contract bound)");
  }
  if (slashBps <= 0 || slashBps > 10_000) throw new DeployError("--slash-bps must be 1..10000");
  if (minDurationBlocks <= 0) throw new DeployError("--min-duration must be positive");
  if (maxDurationBlocks < minDurationBlocks) throw new DeployError("--max-duration must be >= --min-duration");
  const reserveTpot = bigint(options.get("--reserve-tpot") ?? env.MAKHZAN_RESERVE_TPOT ?? DEFAULT_RESERVE_TPOT.toString(), "--reserve-tpot");
  const resume = options.get("--resume");
  if (resume !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(resume)) {
    throw new DeployError("--resume must be a 32-byte transaction hash");
  }
  return {
    dryRun,
    resume: resume as Hex | undefined,
    forceNew,
    artifact: options.get("--artifact") ?? DEFAULT_ARTIFACT,
    out: options.get("--out"),
    minBondWei,
    challengeWindow,
    challengeBlockSize,
    slashBps,
    minDurationBlocks,
    maxDurationBlocks,
    reserveTpot,
  };
}

function bigint(text: string, name: string): bigint {
  if (!/^\d+$/.test(text)) throw new DeployError(`${name} must be a base-10 integer, got ${JSON.stringify(text)}`);
  return BigInt(text);
}

export interface Artifact {
  abi: Abi;
  bytecode: Hex;
  runtimeBytes: number;
}

/** Loads a compiled artifact and measures its deployed bytecode. */
export function loadArtifact(path: string): Artifact {
  const full = repoPath(path);
  let artifact: { abi?: unknown; bytecode?: { object?: string }; deployedBytecode?: { object?: string } };
  try {
    artifact = JSON.parse(readFileSync(full, "utf8"));
  } catch (err) {
    throw new DeployError(`cannot read artifact ${full}: ${(err as Error).message}`);
  }
  if (!Array.isArray(artifact.abi)) throw new DeployError(`${full} has no ABI array`);
  const bytecode = artifact.bytecode?.object;
  if (!bytecode || bytecode === "0x") throw new DeployError(`${full} has no creation bytecode`);
  const runtime = artifact.deployedBytecode?.object ?? "";
  const hex = runtime.startsWith("0x") ? runtime.slice(2) : runtime;
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new DeployError(`${full} has no valid deployedBytecode.object`);
  }
  return { abi: artifact.abi as Abi, bytecode: bytecode as Hex, runtimeBytes: hex.length / 2 };
}

/** Formats wei as tPOT (1 tPOT = 1e18 wei) with 6 decimals. */
export function formatTpot(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n) / 10n ** 12n;
  return `${whole}.${fraction.toString().padStart(6, "0")}`;
}

export const CALIBRATION_FILE = "evidence/calibration.json";

/**
 * Calibration line for a dry run. The ratio is the measured balance drop of a live probe divided by
 * the dry-run estimate for that probe (Tier 0 evidence). No file means it has never been verified.
 */
export function calibrationLine(path: string = repoPath(CALIBRATION_FILE)): string {
  const unverified = "calibration: not yet verified against a live probe";
  if (!existsSync(path)) return unverified;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { ratio?: unknown };
    if (typeof parsed.ratio !== "number" || !Number.isFinite(parsed.ratio) || parsed.ratio <= 0) {
      return unverified;
    }
    return `calibration: measured ratio ${parsed.ratio} (source: ${path})`;
  } catch {
    return unverified;
  }
}

/** Slot 0 is the packed config; decode it without trusting a getter. */
export function decodeConfig(slot0: Hex): {
  challengeWindow: number;
  challengeBlockSize: number;
  slashBps: number;
  minBond: bigint;
  nextDealId: number;
  providerCount: number;
  minDurationBlocks: number;
  maxDurationBlocks: number;
} {
  const value = BigInt(slot0);
  const take = (shift: number, bits: number) => Number((value >> BigInt(shift)) & ((1n << BigInt(bits)) - 1n));
  return {
    challengeWindow: take(0, 32),
    challengeBlockSize: take(32, 16),
    slashBps: take(48, 16),
    minBond: (value >> 64n) & ((1n << 64n) - 1n),
    nextDealId: take(128, 32),
    providerCount: take(160, 16),
    minDurationBlocks: take(176, 32),
    maxDurationBlocks: take(208, 32),
  };
}

const SLOT0 = `0x${"0".repeat(64)}` as Hex;

export interface RunResult {
  record?: DeploymentRecord;
  estimateTpot?: string;
}

/** Runs a deploy (or a dry run) and returns what it did. Throws DeployError on refusal. */
export async function runDeploy(
  args: DeployArgs,
  settings: DeploySettings,
  log: (line: string) => void,
  runtime: DeployRuntime = {},
): Promise<RunResult> {
  if (args.dryRun && args.resume) {
    throw new DeployError("--resume cannot be combined with --dry-run");
  }
  const artifact = loadArtifact(args.artifact);
  const account = privateKeyToAccount(settings.privateKey);
  const deps = runtime.deps ?? makeDeps(settings, account, artifact.abi);
  const pendingFile =
    runtime.pendingFile ?? repoPath(`evidence/deployments/pending-${settings.network}-${settings.chainId}.json`);

  const observedChain = await deps.chainId();
  if (observedChain !== settings.chainId) {
    throw new DeployError(`refusing: the RPC is chain ${observedChain}, settings say ${settings.chainId}`);
  }
  const deployData = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: argsTuple(args) });

  if (args.dryRun) {
    log(calibrationLine());
    const gas = await deps.estimateGas(deployData);
    const cost = gas * (await deps.gasPrice());
    return { estimateTpot: await guardReserve(account.address, cost, args.reserveTpot, deps, log) };
  }

  if (!args.resume && existsSync(pendingFile)) {
    if (!args.forceNew) {
      let pendingHash = "unknown";
      try {
        pendingHash = (JSON.parse(readFileSync(pendingFile, "utf8")) as { txHash?: string }).txHash ?? "unknown";
      } catch {
        // A corrupt pending record is still a reason not to send a second deploy.
      }
      throw new DeployError(
        `refusing: pending deploy record ${pendingFile} (tx ${pendingHash}); use --resume ${pendingHash} ` +
          "once the receipt is available, or --force-new to deploy again",
      );
    }
    log(`--force-new: ignoring the pending record ${pendingFile}`);
  }

  let hash: Hex;
  let estimateTpot: string;
  if (args.resume) {
    hash = args.resume;
    estimateTpot = "resume: not measured";
    log(`resuming deploy tx ${hash} (no new transaction)`);
  } else {
    const gas = await deps.estimateGas(deployData);
    const cost = gas * (await deps.gasPrice());
    estimateTpot = await guardReserve(account.address, cost, args.reserveTpot, deps, log);
    const nonce = await deps.nonce(account.address);
    hash = await deps.send(deployData);
    const utc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const pending = {
      network: settings.network,
      chainId: settings.chainId,
      deployer: getAddress(account.address),
      txHash: hash,
      nonce,
      utc,
    };
    mkdirSync(dirname(pendingFile), { recursive: true });
    writeFileSync(pendingFile, `${JSON.stringify(pending, null, 2)}\n`, "utf8");
    log(`tx sent ${hash} (nonce ${nonce}); pending record ${pendingFile}`);
  }

  let receipt: { status: "success" | "reverted"; contractAddress?: Hex | null; blockNumber: bigint };
  try {
    receipt = await waitForReceipt(deps, hash);
  } catch (err) {
    throw new DeployError(
      `receipt wait for tx ${hash} failed after ${RECEIPT_ATTEMPTS} attempts (${(err as Error).message}); ` +
        `the pending record is kept at ${pendingFile}; rerun with --resume ${hash}`,
    );
  }
  if (receipt.status !== "success") throw new DeployError(`refusing: deploy tx ${hash} reverted`);
  const address = receipt.contractAddress;
  if (!address) throw new DeployError(`refusing: tx ${hash} has no contract address`);

  const code = await deps.code(address);
  if (!code || code === "0x") throw new DeployError(`refusing: no code at ${address}`);
  const runtimeBytes = (code.length - 2) / 2;
  if (runtimeBytes !== artifact.runtimeBytes) {
    throw new DeployError(
      `refusing: deployed code is ${runtimeBytes} B, artifact says ${artifact.runtimeBytes} B`,
    );
  }
  const peeked = await deps.peek(address);
  const config = decodeConfig(peeked[0]);
  const mismatches: string[] = [];
  if (config.challengeWindow !== args.challengeWindow) mismatches.push("challengeWindow");
  if (config.challengeBlockSize !== args.challengeBlockSize) mismatches.push("challengeBlockSize");
  if (config.slashBps !== args.slashBps) mismatches.push("slashBps");
  if (config.minBond !== args.minBondWei / WEI_PER_UNIT) mismatches.push("minBond");
  if (config.minDurationBlocks !== args.minDurationBlocks) mismatches.push("minDurationBlocks");
  if (config.maxDurationBlocks !== args.maxDurationBlocks) mismatches.push("maxDurationBlocks");
  if (mismatches.length > 0) {
    throw new DeployError(`refusing: config read-back differs on ${mismatches.join(", ")}`);
  }

  const utc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const record: DeploymentRecord = {
    network: settings.network,
    evidenceLabel: settings.network === "local" ? "[local run]" : "[live run]",
    chainId: settings.chainId,
    rpcUrl: settings.rpcUrl,
    deployer: getAddress(account.address),
    address: getAddress(address),
    txHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    codeHash: keccak256(code),
    runtimeBytes,
    artifact: repoPath(args.artifact),
    constructor: {
      challengeWindowBlocks: args.challengeWindow,
      challengeBlockSize: args.challengeBlockSize,
      slashBps: args.slashBps,
      minBondUnits: (args.minBondWei / WEI_PER_UNIT).toString(),
      minBondWei: args.minBondWei.toString(),
      minDurationBlocks: args.minDurationBlocks,
      maxDurationBlocks: args.maxDurationBlocks,
    },
    estimatedCostTpot: estimateTpot,
    utc,
  };
  const stamp = utc.replace(/[-:]/g, "").replace("T", "-");
  const out = repoPath(args.out ?? `evidence/deployments/${settings.network}-${settings.chainId}-${stamp}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  rmSync(pendingFile, { force: true });
  log(`deployed ${record.address} ${record.evidenceLabel} tx ${hash} block ${record.blockNumber}`);
  log(`code ${runtimeBytes} B, codeHash ${record.codeHash}, config read back`);
  log(`record ${out}`);
  return { record, estimateTpot };
}

/** Bounded receipt retry with exponential backoff; a timeout never loses the pending record. */
async function waitForReceipt(
  deps: DeployDeps,
  hash: Hex,
): Promise<{ status: "success" | "reverted"; contractAddress?: Hex | null; blockNumber: bigint }> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= RECEIPT_ATTEMPTS; attempt++) {
    try {
      return await deps.receipt(hash);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < RECEIPT_ATTEMPTS) await deps.sleep(250 * 2 ** (attempt - 1));
    }
  }
  throw lastError ?? new Error("receipt wait failed");
}

/** viem-backed dependencies; the only place the deploy touches the network. */
function makeDeps(
  settings: DeploySettings,
  account: ReturnType<typeof privateKeyToAccount>,
  abi: Abi,
): DeployDeps {
  const chain = defineChain({
    id: settings.chainId,
    name: settings.network === "local" ? "makhzan-local" : "makhzan-live",
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
    rpcUrls: { default: { http: [settings.rpcUrl] } },
  });
  const transport = http(settings.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  return {
    chainId: () => publicClient.getChainId(),
    estimateGas: (data) => publicClient.estimateGas({ account: account.address, data }),
    gasPrice: () => publicClient.getGasPrice(),
    balance: (address) => publicClient.getBalance({ address }),
    nonce: (address) => publicClient.getTransactionCount({ address, blockTag: "pending" }),
    send: (data) => walletClient.sendTransaction({ account, chain, data }),
    receipt: (hash) => publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 }),
    code: (address) => publicClient.getCode({ address }),
    peek: async (address) =>
      (await publicClient.readContract({
        address,
        abi,
        functionName: "peek",
        args: [[SLOT0]],
      })) as unknown as Hex[],
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

function argsTuple(args: DeployArgs): readonly [number, number, number, bigint, number, number] {
  return [
    args.challengeWindow,
    args.challengeBlockSize,
    args.slashBps,
    args.minBondWei / WEI_PER_UNIT,
    args.minDurationBlocks,
    args.maxDurationBlocks,
  ];
}

/**
 * Pure reserve check: the owner must keep `reserveTpot` after paying `cost`. The default is 100 tPOT:
 * what has to remain for deal prices, fees and slack after the deploy (DR-012, owner review).
 */
export function checkReserve(balance: bigint, cost: bigint, reserveTpot: bigint): void {
  if (balance < cost + reserveTpot * 10n ** 18n) {
    const remaining = balance > cost ? balance - cost : 0n;
    throw new DeployError(
      `refusing: balance ${formatTpot(balance)} tPOT - estimate ${formatTpot(cost)} tPOT leaves ` +
        `${formatTpot(remaining)} tPOT, below the DR-012 reserve of ${reserveTpot} tPOT`,
    );
  }
}

async function guardReserve(
  owner: `0x${string}`,
  cost: bigint,
  reserveTpot: bigint,
  deps: DeployDeps,
  log: (line: string) => void,
): Promise<string> {
  const balance = await deps.balance(owner);
  const estimateTpot = formatTpot(cost);
  log(`estimated deploy cost ${estimateTpot} tPOT; owner balance ${formatTpot(balance)} tPOT; reserve ${reserveTpot} tPOT`);
  checkReserve(balance, cost, reserveTpot);
  return estimateTpot;
}

/** CLI entry point: prints, returns an exit code, never throws at the top level. */
export async function main(argv: string[], env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  try {
    const args = parseDeployArgs(argv, env);
    const settings = deploySettings(env);
    await runDeploy(args, settings, log);
    if (args.dryRun) log("dry run: no transaction sent");
    return 0;
  } catch (err) {
    log(`deploy failed: ${(err as Error).message}`);
    return 1;
  }
}
