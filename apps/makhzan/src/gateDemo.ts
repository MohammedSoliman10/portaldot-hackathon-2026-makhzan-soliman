/**
 * StorageGate demo: the full consumer story on one chain.
 *
 *   register a provider -> two deals -> lock with a bond floor -> release while healthy ->
 *   challenge, let it expire, resolve (slash) -> lock again -> release refused BondTooLow ->
 *   refund refused in term -> refund at the end block.
 *
 * Local mode deploys Makhzan and the gate with the deploy tooling and then mines blocks so the run
 * takes seconds. Live mode never deploys and never mines: it needs `--live`, existing `--makhzan`
 * and `--gate` addresses, both keys in the environment, and a dry run of the same plan first.
 * A key is never accepted on argv, printed, or written to any file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
  keccak256,
  stringToHex,
  type Abi,
  type Hex,
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { chunkFile } from "./chunk.ts";
import { buildTree } from "./merkle.ts";
import {
  DeployError,
  WEI_PER_UNIT,
  deploySettings,
  loadArtifact,
  parseDeployArgs,
  repoPath,
  runDeploy,
  type DeployDeps,
  type DeploySettings,
} from "./deploy.ts";

export const LOCAL_DEMO_CHAIN_ID = 420_420_777;
export const LOCAL_DEMO_RPC = "http://127.0.0.1:8549";
export const UINT64_MAX = 2n ** 64n - 1n;
export const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";
export const DEMO_FILE_SIZE = 1024 * 1024;
export const DEMO_BLOCK_SIZE = 1024;

const MAKHZAN_ARTIFACT = "contracts/out/Makhzan.sol/Makhzan.json";
const GATE_ARTIFACT = "contracts/out/StorageGate.sol/StorageGate.json";
const DEFAULT_WAIT_SECONDS = 1800;

export class GateDemoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateDemoError";
  }
}

export type DemoRole = "owner" | "provider" | "stranger";

export interface GateDemoArgs {
  live: boolean;
  dryRun: boolean;
  rpcUrl: string;
  chainId: number;
  makhzan?: Hex;
  gate?: Hex;
  /** The amount the payer locks, in wei. */
  amountWei: bigint;
  /** The deal price, in native units. */
  priceUnits: bigint;
  /** The provider bond floor, in native units. */
  minBondUnits: bigint;
  durationBlocks: number;
  windowBlocks: number;
  waitSeconds: number;
  outDir?: string;
}

export interface GateDemoResult {
  dryRun: boolean;
  makhzan?: Hex;
  gate?: Hex;
  dealA?: number;
  dealB?: number;
  priceWei?: bigint;
  lockedAmount?: bigint;
  bondBefore?: bigint;
  bondAfter?: bigint;
  slashWei?: bigint;
  releaseARefused?: string;
  releaseBRefused?: string;
  refundInTermRefused?: string;
  gateBalanceWhileRefused?: bigint;
  gateBalanceAtEnd?: bigint;
  /**
   * Accounting for this run, not a balance delta: the gate paid deal A's amount to the provider.
   * Gas is excluded, and the two deal prices sit in Makhzan's escrow, not in these numbers.
   */
  providerGainWei?: bigint;
  /** Accounting for this run: deal A's amount left the payer, deal B's amount came back, two prices paid. */
  ownerNetWei?: bigint;
}

export interface GateDemoRuntime {
  /** Where a live dry run leaves its marker; defaults to evidence/gate-demo/. */
  markerPath?: string;
  /** Where the local demo writes its deploy records; defaults to a temp dir chosen by the caller. */
  outDir?: string;
}

/** One narrow chain surface, so the demo logic is testable and the viem code lives in one place. */
export interface GateDemoChain {
  chainId(): Promise<number>;
  blockNumber(): Promise<bigint>;
  balance(address: Hex): Promise<bigint>;
  code(address: Hex): Promise<Hex | undefined>;
  read<R>(address: Hex, abi: Abi, functionName: string, args?: readonly unknown[]): Promise<R>;
  send(
    role: DemoRole,
    address: Hex,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    value?: bigint,
  ): Promise<Hex>;
  simulate(
    role: DemoRole,
    address: Hex,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    value?: bigint,
  ): Promise<{ ok: true } | { ok: false; revertName: string }>;
  advanceTo(block: bigint, log: (line: string) => void): Promise<void>;
  /** Deal ids are assigned by Makhzan, so the id comes from the DealCreated log, never a guess. */
  dealIdFrom(hash: Hex): Promise<number>;
  accounts: Record<DemoRole, Hex>;
  deployLocal?(
    outDir: string,
    log: (line: string) => void,
    options: { minBondUnits: bigint },
  ): Promise<{ makhzan: Hex; gate: Hex }>;
}

function integer(text: string, name: string): number {
  if (!/^\d+$/.test(text)) throw new GateDemoError(`${name} must be a base-10 integer, got ${JSON.stringify(text)}`);
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new GateDemoError(`${name} is too large`);
  return value;
}

function units(text: string, name: string): bigint {
  if (!/^\d+$/.test(text)) throw new GateDemoError(`${name} must be a base-10 integer, got ${JSON.stringify(text)}`);
  const value = BigInt(text);
  if (value <= 0n) throw new GateDemoError(`${name} must be positive`);
  if (value > UINT64_MAX) throw new GateDemoError(`${name} exceeds the uint64 unit cap`);
  return value;
}

/** Parses the demo flags. A key on argv is a hard refusal, not an unknown option. */
export function parseGateDemoArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): GateDemoArgs {
  const options = new Map<string, string>();
  let live = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new GateDemoError(`unexpected argument ${JSON.stringify(arg)}`);
    if (["--private-key", "--key", "--provider-key", "--mnemonic"].includes(arg)) {
      throw new GateDemoError(`${arg}: keys are never accepted on argv; use the environment`);
    }
    const value = argv[++i];
    if (value === undefined) throw new GateDemoError(`${arg} needs a value`);
    options.set(arg, value);
  }
  const known = new Set([
    "--makhzan",
    "--gate",
    "--amount",
    "--price",
    "--min-bond",
    "--duration",
    "--window",
    "--out",
    "--rpc",
    "--chain-id",
    "--wait-seconds",
  ]);
  for (const key of options.keys()) {
    if (!known.has(key)) throw new GateDemoError(`unknown option ${key}`);
  }

  if (!live && env.MAKHZAN_NETWORK === "live") {
    throw new GateDemoError("MAKHZAN_NETWORK=live needs the explicit --live flag");
  }
  if (live && env.MAKHZAN_NETWORK !== "live") {
    throw new GateDemoError("--live needs MAKHZAN_NETWORK=live; nothing was sent");
  }

  let rpcUrl: string;
  let chainId: number;
  if (live) {
    if (!env.MAKHZAN_RPC_URL) throw new GateDemoError("a live run needs MAKHZAN_RPC_URL");
    if (!env.MAKHZAN_CHAIN_ID) throw new GateDemoError("a live run needs MAKHZAN_CHAIN_ID");
    rpcUrl = env.MAKHZAN_RPC_URL;
    chainId = integer(env.MAKHZAN_CHAIN_ID, "MAKHZAN_CHAIN_ID");
  } else {
    rpcUrl = options.get("--rpc") ?? env.MAKHZAN_RPC_URL ?? LOCAL_DEMO_RPC;
    chainId = options.has("--chain-id")
      ? integer(options.get("--chain-id")!, "--chain-id")
      : env.MAKHZAN_CHAIN_ID
        ? integer(env.MAKHZAN_CHAIN_ID, "MAKHZAN_CHAIN_ID")
        : LOCAL_DEMO_CHAIN_ID;
  }

  const addressOption = (name: string): Hex | undefined => {
    const value = options.get(name);
    if (value === undefined) return undefined;
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new GateDemoError(`${name} must be a 40 hex character address`);
    return getAddress(value);
  };
  const makhzan = addressOption("--makhzan");
  const gate = addressOption("--gate");
  if (live) {
    if (!makhzan) throw new GateDemoError("a live run needs --makhzan <address>");
    if (!gate) throw new GateDemoError("a live run needs --gate <address>");
    if (!env.MAKHZAN_PRIVATE_KEY) throw new GateDemoError("a live run needs MAKHZAN_PRIVATE_KEY (payer/owner)");
    if (!env.MAKHZAN_PROVIDER_KEY) throw new GateDemoError("a live run needs MAKHZAN_PROVIDER_KEY (payee)");
  }

  const amountWei = options.has("--amount")
    ? BigInt(integerBig(options.get("--amount")!, "--amount"))
    : 10n ** 18n;
  if (amountWei <= 0n) throw new GateDemoError("--amount must be positive");
  const priceUnits = options.has("--price") ? units(options.get("--price")!, "--price") : 500_000_000_000_000n;
  const minBondUnits = options.has("--min-bond")
    ? units(options.get("--min-bond")!, "--min-bond")
    : 900_000_000_000_000n;
  const durationBlocks = options.has("--duration") ? integer(options.get("--duration")!, "--duration") : 80;
  if (durationBlocks <= 0) throw new GateDemoError("--duration must be positive");
  const windowBlocks = options.has("--window") ? integer(options.get("--window")!, "--window") : 10;
  if (windowBlocks <= 0) throw new GateDemoError("--window must be positive");
  if (durationBlocks <= windowBlocks + 2) {
    throw new GateDemoError("--duration must leave room for the challenge window and the refund step");
  }
  const waitSeconds = options.has("--wait-seconds")
    ? integer(options.get("--wait-seconds")!, "--wait-seconds")
    : DEFAULT_WAIT_SECONDS;

  return {
    live,
    dryRun,
    rpcUrl,
    chainId,
    makhzan,
    gate,
    amountWei,
    priceUnits,
    minBondUnits,
    durationBlocks,
    windowBlocks,
    waitSeconds,
    outDir: options.get("--out"),
  };
}

function integerBig(text: string, name: string): string {
  if (!/^\d+$/.test(text)) throw new GateDemoError(`${name} must be a base-10 integer, got ${JSON.stringify(text)}`);
  return text;
}

export function priceWei(args: GateDemoArgs): bigint {
  return args.priceUnits * WEI_PER_UNIT;
}

/** The plan a live dry run accepts: anything that changes the transactions changes the hash. */
export function planHash(args: GateDemoArgs): Hex {
  const plan = {
    chainId: args.chainId,
    makhzan: args.makhzan?.toLowerCase() ?? null,
    gate: args.gate?.toLowerCase() ?? null,
    amountWei: args.amountWei.toString(),
    priceUnits: args.priceUnits.toString(),
    minBondUnits: args.minBondUnits.toString(),
    durationBlocks: args.durationBlocks,
  };
  return keccak256(stringToHex(JSON.stringify(plan)));
}

export function defaultMarkerPath(args: GateDemoArgs): string {
  const dir = process.env.MAKHZAN_GATE_DEMO_DIR ?? "evidence/gate-demo";
  return repoPath(join(dir, `dry-run-${args.live ? "live" : "local"}-${args.chainId}.json`));
}

export function writeDryRunMarker(path: string, args: GateDemoArgs): void {
  const marker = {
    schema: "makhzan.gate-demo-dry-run/v0",
    network: args.live ? "live" : "local",
    chainId: args.chainId,
    makhzan: args.makhzan ?? null,
    gate: args.gate ?? null,
    amountWei: args.amountWei.toString(),
    priceUnits: args.priceUnits.toString(),
    minBondUnits: args.minBondUnits.toString(),
    durationBlocks: args.durationBlocks,
    planHash: planHash(args),
    utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

/** A live run is only allowed after a dry run of the same plan. */
export function requireDryRun(args: GateDemoArgs, path: string): void {
  if (!existsSync(path)) {
    throw new GateDemoError(`a live run needs --dry-run first: run the same command with --dry-run (${path})`);
  }
  let marker: { planHash?: string };
  try {
    marker = JSON.parse(readFileSync(path, "utf8")) as { planHash?: string };
  } catch (err) {
    throw new GateDemoError(`cannot read the dry-run marker ${path}: ${(err as Error).message}`);
  }
  if (marker.planHash !== planHash(args)) {
    throw new GateDemoError(
      `the dry run at ${path} was for a different plan; run --dry-run again with these arguments`,
    );
  }
}

function tpot(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n) / 10n ** 12n;
  return `${whole}.${fraction.toString().padStart(6, "0")}`;
}

async function sayBalances(
  chain: GateDemoChain,
  makhzan: Hex,
  gate: Hex,
  makhzanAbi: Abi,
  log: (line: string) => void,
): Promise<void> {
  const [owner, payee, gateBalance, providerRecord] = await Promise.all([
    chain.balance(chain.accounts.owner),
    chain.balance(chain.accounts.provider),
    chain.balance(gate),
    chain.read<readonly [number, bigint, number, boolean]>(makhzan, makhzanAbi, "providerOf", [
      chain.accounts.provider,
    ]),
  ]);
  log(
    `balances: payer ${tpot(owner)} tPOT | provider ${tpot(payee)} tPOT | gate ${tpot(gateBalance)} tPOT | ` +
      `bond ${providerRecord[1]} units`,
  );
}

/** Demo file and its Merkle tree; the deals commit to it even though nobody answers in this run. */
function demoTree(): { root: Hex; leafCount: number; size: number } {
  const bytes = new Uint8Array(DEMO_FILE_SIZE);
  let x = 0x12345678;
  for (let i = 0; i < bytes.length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    bytes[i] = (x >>> 16) & 0xff;
  }
  const chunked = chunkFile(bytes, DEMO_BLOCK_SIZE);
  const tree = buildTree(chunked.blocks);
  return { root: tree.root, leafCount: chunked.leafCount, size: chunked.size };
}

function expectRefusal(got: { ok: true } | { ok: false; revertName: string }, expected: string, step: string): void {
  if (got.ok) throw new GateDemoError(`${step}: expected ${expected}, but the call would succeed`);
  if (got.revertName !== expected) {
    throw new GateDemoError(`${step}: expected ${expected}, got ${got.revertName}`);
  }
}

/** Runs (or dry-runs) the demo. Throws GateDemoError on any unexpected behaviour. */
export async function runGateDemo(
  args: GateDemoArgs,
  chain: GateDemoChain,
  log: (line: string) => void,
  runtime: GateDemoRuntime = {},
): Promise<GateDemoResult> {
  const markerPath = runtime.markerPath ?? defaultMarkerPath(args);
  const outDir = runtime.outDir ?? args.outDir;
  const makhzanAbi = loadArtifact(MAKHZAN_ARTIFACT).abi;
  const gateAbi = loadArtifact(GATE_ARTIFACT).abi;

  const observed = await chain.chainId();
  if (observed !== args.chainId) {
    throw new GateDemoError(`refusing: the RPC is chain ${observed}, settings say ${args.chainId}`);
  }

  if (args.dryRun) {
    const block = await chain.blockNumber();
    log(`dry run: chain ${observed}, block ${block}, ${args.live ? "LIVE" : "local"}`);
    log(`plan: lock ${tpot(args.amountWei)} tPOT with minBond ${args.minBondUnits} units, ` +
      `price ${args.priceUnits} units, duration ${args.durationBlocks} blocks, window ${args.windowBlocks}`);
    log(`plan: release while healthy -> challenge -> wait -> resolve (slash) -> lock again -> ` +
      `release (expect BondTooLow) -> refund (expect RefundNotAllowed in term, then paid at the end block)`);
    if (args.live) {
      const codeOf = async (name: string, address: Hex) => {
        const code = await chain.code(address);
        if (!code || code === "0x") throw new GateDemoError(`${name} ${address} has no code on chain ${observed}`);
        log(`${name} ${address}: code ${(code.length - 2) / 2} B`);
      };
      await codeOf("makhzan", args.makhzan!);
      await codeOf("gate", args.gate!);
      writeDryRunMarker(markerPath, args);
      log(`dry-run marker written to ${markerPath}`);
    }
    log("dry run: no transaction sent");
    return { dryRun: true };
  }

  if (args.live) requireDryRun(args, markerPath);

  let makhzan = args.makhzan;
  let gate = args.gate;
  if (!makhzan || !gate) {
    if (!chain.deployLocal) throw new GateDemoError("this chain cannot deploy; pass --makhzan and --gate");
    log("== 1. deploy Makhzan and the gate (local) ==");
    const dir = outDir ?? process.cwd();
    const deployed = await chain.deployLocal(dir, log, { minBondUnits: args.minBondUnits });
    makhzan = deployed.makhzan;
    gate = deployed.gate;
    log(`makhzan ${makhzan}`);
    log(`gate ${gate}`);
  } else {
    log("== 1. addresses ==");
    log(`makhzan ${makhzan}`);
    log(`gate ${gate}`);
  }

  // ---- provider
  log("== 2. provider ==");
  const before = await chain.read<readonly [number, bigint, number, boolean]>(makhzan, makhzanAbi, "providerOf", [
    chain.accounts.provider,
  ]);
  // One default slashes 20% (the Makhzan default), so a bond just under 10/9 of the floor drops
  // below it after a single slash. Local runs register exactly that; a live run uses what exists.
  const bondTarget = (args.minBondUnits * 10n + 8n) / 9n;
  if (before[3]) {
    log(`provider ${chain.accounts.provider} already registered: id ${before[0]}, bond ${before[1]} units`);
    if (before[1] < args.minBondUnits) {
      log(`note: this bond is already under the floor (${args.minBondUnits} units): release is refused before any slash`);
    } else if (before[1] >= args.minBondUnits * 5n / 4n) {
      log(`note: this bond is ${before[1]} units, well above the floor (${args.minBondUnits}); one 20% slash may not reach it`);
    }
  } else {
    if (args.live) {
      throw new GateDemoError(
        `refusing: ${chain.accounts.provider} is not a registered provider on this chain; the live demo never registers one`,
      );
    }
    await chain.send("provider", makhzan, makhzanAbi, "registerProvider", [], bondTarget * WEI_PER_UNIT);
    const after = await chain.read<readonly [number, bigint, number, boolean]>(makhzan, makhzanAbi, "providerOf", [
      chain.accounts.provider,
    ]);
    log(`registered provider ${chain.accounts.provider}: id ${after[0]}, bond ${after[1]} units`);
  }
  const providerId = (
    await chain.read<readonly [number, bigint, number, boolean]>(makhzan, makhzanAbi, "providerOf", [
      chain.accounts.provider,
    ])
  )[0];
  const bondBefore = (
    await chain.read<readonly [number, bigint, number, boolean]>(makhzan, makhzanAbi, "providerOf", [
      chain.accounts.provider,
    ])
  )[1];

  // ---- deals
  log("== 3. create deal A and deal B ==");
  const tree = demoTree();
  const createDeal = async (name: string): Promise<number> => {
    const receipt = await chain.send(
      "owner",
      makhzan,
      makhzanAbi,
      "createDeal",
      [providerId, tree.root, tree.leafCount, tree.size, args.durationBlocks, args.priceUnits],
      priceWei(args),
    );
    const dealId = await chain.dealIdFrom(receipt);
    const deal = await chain.read<readonly unknown[]>(makhzan, makhzanAbi, "dealOf", [dealId]);
    log(`deal ${name} = #${dealId}, end block ${deal[2]}, price ${args.priceUnits} units, tx ${receipt}`);
    return dealId;
  };
  const dealA = await createDeal("A");
  const dealB = await createDeal("B");
  // viem decodes a uint32 to a JS number; the demo compares blocks as bigint from here on.
  const endB = BigInt((await chain.read<readonly unknown[]>(makhzan, makhzanAbi, "dealOf", [dealB]))[2] as number);

  // ---- lock and release while healthy
  log("== 4. lock deal A with a bond floor ==");
  await sayBalances(chain, makhzan, gate, makhzanAbi, log);
  await chain.send("owner", gate, gateAbi, "lock", [dealA, chain.accounts.provider, args.minBondUnits], args.amountWei);
  const lockA = await chain.read<readonly unknown[]>(gate, gateAbi, "lockOf", [dealA]);
  log(`locked ${tpot(args.amountWei)} tPOT on deal A, payee ${lockA[2]}, minBond ${lockA[3]} units, status ${lockA[4]}`);
  await sayBalances(chain, makhzan, gate, makhzanAbi, log);

  log("== 5. release deal A while healthy ==");
  const healthA = await chain.read<number>(makhzan, makhzanAbi, "healthOf", [dealA]);
  log(`healthOf(${dealA}) = ${healthA} (1 = no open challenge)`);
  const releaseA = await chain.simulate("provider", gate, gateAbi, "release", [dealA]);
  if (!releaseA.ok) throw new GateDemoError(`release A was refused: ${releaseA.revertName}`);
  await chain.send("provider", gate, gateAbi, "release", [dealA]);
  log(`release ${dealA}: paid the provider, no revert`);
  await sayBalances(chain, makhzan, gate, makhzanAbi, log);

  // ---- challenge, expire, resolve
  log("== 6. challenge deal A and let it expire ==");
  await chain.send("owner", makhzan, makhzanAbi, "challenge", [dealA]);
  const stateA = await chain.read<readonly [boolean, number, number, number, number]>(makhzan, makhzanAbi, "challengeStateOf", [
    dealA,
  ]);
  log(`challenge open on index ${stateA[1]}, deadline block ${stateA[3]}; nobody answers`);
  await chain.advanceTo(BigInt(stateA[3]) + 1n, log);
  const healthPending = await chain.read<number>(makhzan, makhzanAbi, "healthOf", [dealA]);
  log(`healthOf(${dealA}) = ${healthPending} past the deadline (3 = default, unresolved)`);

  log("== 7. resolve: the slash ==");
  const bondBeforeSlash = (
    await chain.read<readonly [number, bigint, number, boolean]>(makhzan, makhzanAbi, "providerOf", [
      chain.accounts.provider,
    ])
  )[1];
  await chain.send("stranger", makhzan, makhzanAbi, "resolve", [dealA]);
  const [, bondAfterSlash] = await chain.read<readonly [number, bigint, number, boolean]>(makhzan, makhzanAbi, "providerOf", [
    chain.accounts.provider,
  ]);
  const healthResolved = await chain.read<number>(makhzan, makhzanAbi, "healthOf", [dealA]);
  log(`slash ${bondBeforeSlash - bondAfterSlash} units: bond ${bondBeforeSlash} -> ${bondAfterSlash}`);
  log(`healthOf(${dealA}) = ${healthResolved} after resolve: the health check can no longer see the default`);
  await sayBalances(chain, makhzan, gate, makhzanAbi, log);

  // ---- the floor notices the slash
  log("== 8. lock deal B with the same bond floor ==");
  await chain.send("owner", gate, gateAbi, "lock", [dealB, chain.accounts.provider, args.minBondUnits], args.amountWei);
  log(`locked ${tpot(args.amountWei)} tPOT on deal B; healthOf is 1, so the lock passes`);

  log("== 9. release deal B is refused: the bond is under the floor ==");
  const releaseB = await chain.simulate("provider", gate, gateAbi, "release", [dealB]);
  expectRefusal(releaseB, "BondTooLow", "release B");
  log(`release ${dealB} would revert BondTooLow (bond ${bondAfterSlash} < floor ${args.minBondUnits})`);
  const gateBalanceWhileRefused = await chain.balance(gate);
  await sayBalances(chain, makhzan, gate, makhzanAbi, log);

  log("== 10. refund deal B is refused inside the term ==");
  const healthB = await chain.read<number>(makhzan, makhzanAbi, "healthOf", [dealB]);
  const refundNow = await chain.simulate("owner", gate, gateAbi, "refund", [dealB]);
  expectRefusal(refundNow, "RefundNotAllowed", "refund B in term");
  log(`refund ${dealB} would revert RefundNotAllowed (healthOf ${healthB}, block below the end block)`);

  log("== 11. at the end block the payer refunds ==");
  await chain.advanceTo(endB, log);
  const refund = await chain.simulate("owner", gate, gateAbi, "refund", [dealB]);
  if (!refund.ok) throw new GateDemoError(`refund B at the end block was refused: ${refund.revertName}`);
  await chain.send("owner", gate, gateAbi, "refund", [dealB]);
  const gateBalanceAtEnd = await chain.balance(gate);
  log(`refund ${dealB}: payer made whole, gate balance ${tpot(gateBalanceAtEnd)} tPOT`);
  await sayBalances(chain, makhzan, gate, makhzanAbi, log);

  const slashWei = (bondBeforeSlash - bondAfterSlash) * WEI_PER_UNIT;
  const providerGainWei = args.amountWei;
  // Deal B's amount comes back and Makhzan pays the slash to the deal owner (this payer), so only
  // deal A's amount and the two prices are a net outflow.
  const ownerNetWei = -(args.amountWei + 2n * priceWei(args)) + slashWei;

  log("== summary ==");
  log(`deal A: lock -> release while healthy (paid), then the provider was slashed ${bondBeforeSlash - bondAfterSlash} units`);
  log(`deal B: lock -> release refused BondTooLow -> refund refused in term -> refunded at the end block`);
  log(
    `accounted for this run (gas excluded): provider +${tpot(providerGainWei)} tPOT from deal A, ` +
      `payer ${tpot(ownerNetWei)} tPOT (one deal paid, one refunded, two prices, slash back)`,
  );
  log(`gate balance at the end: ${tpot(gateBalanceAtEnd)} tPOT`);
  if (gateBalanceAtEnd !== 0n) throw new GateDemoError(`the gate still holds ${gateBalanceAtEnd} wei`);

  return {
    dryRun: false,
    makhzan,
    gate,
    dealA,
    dealB,
    priceWei: priceWei(args),
    lockedAmount: args.amountWei,
    bondBefore,
    bondAfter: bondAfterSlash,
    slashWei,
    releaseARefused: undefined,
    releaseBRefused: releaseB.ok ? "none" : releaseB.revertName,
    refundInTermRefused: refundNow.ok ? "none" : refundNow.revertName,
    gateBalanceWhileRefused,
    gateBalanceAtEnd,
    providerGainWei,
    ownerNetWei,
  };
}

/** viem-backed chain for a local anvil run: deploys through the deploy tooling, mines on demand. */
export function makeLocalChain(input: {
  rpcUrl: string;
  mnemonic?: string;
  /** The payer's environment key is never needed locally: the mnemonic is the anvil fixture. */
  outDir?: string;
}): GateDemoChain {
  const chain = defineChain({
    id: LOCAL_DEMO_CHAIN_ID,
    name: "makhzan-local",
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
    rpcUrls: { default: { http: [input.rpcUrl] } },
  });
  const transport = http(input.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const mnemonic = input.mnemonic ?? DEFAULT_MNEMONIC;
  const accountOf = (role: DemoRole) =>
    mnemonicToAccount(mnemonic, { addressIndex: role === "owner" ? 0 : role === "provider" ? 1 : 2 });
  const accounts: Record<DemoRole, Hex> = {
    owner: accountOf("owner").address,
    provider: accountOf("provider").address,
    stranger: accountOf("stranger").address,
  };
  const wallets = {
    owner: createWalletClient({ account: accountOf("owner"), chain, transport }),
    provider: createWalletClient({ account: accountOf("provider"), chain, transport }),
    stranger: createWalletClient({ account: accountOf("stranger"), chain, transport }),
  };

  const makhzanArtifact = loadArtifact(MAKHZAN_ARTIFACT);
  const gateArtifact = loadArtifact(GATE_ARTIFACT);

  const deployDeps = (): DeployDeps => ({
    chainId: () => publicClient.getChainId(),
    estimateGas: (data) => publicClient.estimateGas({ account: accounts.owner, data }),
    gasPrice: () => publicClient.getGasPrice(),
    balance: (address) => publicClient.getBalance({ address }),
    nonce: (address) => publicClient.getTransactionCount({ address, blockTag: "pending" }),
    send: (data) => wallets.owner.sendTransaction({ account: accountOf("owner"), chain, data }),
    receipt: (hash) => publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 }),
    transaction: (hash) => publicClient.getTransaction({ hash }),
    code: (address) => publicClient.getCode({ address }),
    peek: async (address) =>
      (await publicClient.readContract({
        address,
        abi: makhzanArtifact.abi,
        functionName: "peek",
        args: [[`0x${"0".repeat(64)}` as Hex]],
      })) as unknown as Hex[],
    makhzanOf: async (address) =>
      (await publicClient.readContract({ address, abi: gateArtifact.abi, functionName: "makhzan" })) as Hex,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });

  return {
    chainId: () => publicClient.getChainId(),
    blockNumber: async () => await publicClient.getBlockNumber(),
    balance: (address) => publicClient.getBalance({ address }),
    code: (address) => publicClient.getCode({ address }),
    read: async <R>(address: Hex, abi: Abi, functionName: string, args: readonly unknown[] = []) =>
      (await publicClient.readContract({ address, abi, functionName, args })) as R,
    send: async (role, address, abi, functionName, args, value) => {
      const hash = await wallets[role].writeContract({ address, abi, functionName, args, value });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new GateDemoError(`${role}: ${functionName} reverted (${hash})`);
      return hash;
    },
    simulate: async (role, address, abi, functionName, args, value) => {
      try {
        await publicClient.simulateContract({ account: accountOf(role), address, abi, functionName, args, value });
        return { ok: true as const };
      } catch (err) {
        return { ok: false as const, revertName: revertNameOf(err) };
      }
    },
    advanceTo: async (target, log) => {
      const current = await publicClient.getBlockNumber();
      if (current >= target) return;
      await mineBlocks(publicClient, target - current);
      log(`mined ${target - current} blocks to ${target}`);
    },
    dealIdFrom: async (hash) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      for (const entry of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: makhzanArtifact.abi, data: entry.data, topics: entry.topics });
          if (decoded.eventName === "DealCreated") return Number((decoded.args as unknown as { dealId: number }).dealId);
        } catch {
          // not a Makhzan event this demo decodes
        }
      }
      throw new GateDemoError(`no DealCreated event in ${hash}`);
    },
    accounts,
    deployLocal: async (outDir, log, options) => {
      const dir = input.outDir ?? outDir;
      const ownerAccount = accountOf("owner");
      const ownerKey = ownerAccount.getHdKey().privateKey;
      if (!ownerKey) throw new GateDemoError("the mnemonic account has no private key");
      const settings: DeploySettings = {
        network: "local",
        rpcUrl: input.rpcUrl,
        chainId: LOCAL_DEMO_CHAIN_ID,
        privateKey: bytesToHex(ownerKey),
      };
      const deps = deployDeps();
      // The local Makhzan floor is the demo's floor, so the provider can register just above it.
      const bondWei = options.minBondUnits * WEI_PER_UNIT;
      const makhzanArgs = parseDeployArgs(
        [
          "--min-bond",
          bondWei.toString(),
          "--window",
          "10",
          "--out",
          join(dir, "makhzan-deployment.json"),
        ],
        {},
      );
      const makhzan = await runDeploy(makhzanArgs, settings, log, {
        deps,
        pendingFile: join(dir, "pending-makhzan.json"),
        evidenceDir: dir,
      });
      if (!makhzan.record) throw new GateDemoError("the Makhzan deploy produced no record");
      const gateArgs = parseDeployArgs(
        ["--contract", "gate", "--makhzan", makhzan.record.address, "--out", join(dir, "gate-deployment.json")],
        {},
      );
      const gate = await runDeploy(gateArgs, settings, log, {
        deps,
        pendingFile: join(dir, "pending-gate.json"),
        evidenceDir: dir,
      });
      if (!gate.record) throw new GateDemoError("the gate deploy produced no record");
      return { makhzan: getAddress(makhzan.record.address), gate: getAddress(gate.record.address) };
    },
  };
}

/**
 * `anvil_mine` is a local-only method and viem's public client type does not list it, so the one
 * call site casts the request surface instead of widening the client type everywhere.
 */
async function mineBlocks(client: { request: unknown }, count: bigint): Promise<void> {
  const request = client.request as (args: { method: string; params: unknown[] }) => Promise<unknown>;
  await request({ method: "anvil_mine", params: [`0x${count.toString(16)}`, "0x0"] });
}

/** Pulls the custom error name out of a viem revert, if it decoded one. */
function revertNameOf(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; depth < 6 && current; depth++) {
    const candidate = current as { data?: { errorName?: string }; cause?: unknown; message?: string };
    if (candidate.data?.errorName) return candidate.data.errorName;
    const message = candidate.message ?? "";
    const match = message.match(/reverted with (?:the following reason|an error):?\s*([A-Za-z_][A-Za-z0-9_]*)/);
    if (match) return match[1];
    current = candidate.cause;
  }
  return "reverted (undecoded)";
}

/** CLI wrapper: local defaults, a clear refusal list, and no key ever printed. */
export async function main(argv: string[], env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  try {
    const args = parseGateDemoArgs(argv, env);
    if (args.live) {
      // Live keys are read here and only used to build the wallet clients; they are never logged.
      if (env.MAKHZAN_PRIVATE_KEY && !/^0x[0-9a-fA-F]{64}$/.test(env.MAKHZAN_PRIVATE_KEY)) {
        throw new GateDemoError("MAKHZAN_PRIVATE_KEY must be 32 bytes of hex");
      }
      if (env.MAKHZAN_PROVIDER_KEY && !/^0x[0-9a-fA-F]{64}$/.test(env.MAKHZAN_PROVIDER_KEY)) {
        throw new GateDemoError("MAKHZAN_PROVIDER_KEY must be 32 bytes of hex");
      }
      const chain = makeLiveChain(args, env);
      await runGateDemo(args, chain, log, { outDir: args.outDir });
    } else {
      const chain = makeLocalChain({ rpcUrl: args.rpcUrl, mnemonic: env.MAKHZAN_ANVIL_MNEMONIC });
      await runGateDemo(args, chain, log, { outDir: args.outDir });
    }
    return 0;
  } catch (err) {
    if (err instanceof GateDemoError || err instanceof DeployError) {
      log(`gate-demo refused: ${err.message}`);
      return 1;
    }
    log(`gate-demo failed: ${(err as Error).message}`);
    return 1;
  }
}

/** viem-backed chain for a live run: no deploy, no mining, keys from the environment only. */
export function makeLiveChain(args: GateDemoArgs, env: NodeJS.ProcessEnv): GateDemoChain {
  if (!args.makhzan || !args.gate) throw new GateDemoError("a live run needs --makhzan and --gate");
  const chain = defineChain({
    id: args.chainId,
    name: "makhzan-live",
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
    rpcUrls: { default: { http: [args.rpcUrl] } },
  });
  const transport = http(args.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const owner = privateKeyToAccount(env.MAKHZAN_PRIVATE_KEY as Hex);
  const provider = privateKeyToAccount(env.MAKHZAN_PROVIDER_KEY as Hex);
  const wallets = {
    owner: createWalletClient({ account: owner, chain, transport }),
    provider: createWalletClient({ account: provider, chain, transport }),
    stranger: createWalletClient({ account: owner, chain, transport }),
  };
  const makhzanArtifact = loadArtifact(MAKHZAN_ARTIFACT);
  const gateArtifact = loadArtifact(GATE_ARTIFACT);
  const started = Date.now();
  return {
    chainId: () => publicClient.getChainId(),
    blockNumber: async () => await publicClient.getBlockNumber(),
    balance: (address) => publicClient.getBalance({ address }),
    code: (address) => publicClient.getCode({ address }),
    read: async <R>(address: Hex, abi: Abi, functionName: string, callArgs: readonly unknown[] = []) =>
      (await publicClient.readContract({ address, abi, functionName, args: callArgs })) as R,
    send: async (role, address, abi, functionName, callArgs, value) => {
      const hash = await wallets[role].writeContract({ address, abi, functionName, args: callArgs, value });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new GateDemoError(`${role}: ${functionName} reverted (${hash})`);
      return hash;
    },
    simulate: async (role, address, abi, functionName, callArgs, value) => {
      try {
        await publicClient.simulateContract({ account: wallets[role].account!, address, abi, functionName, args: callArgs, value });
        return { ok: true as const };
      } catch (err) {
        return { ok: false as const, revertName: revertNameOf(err) };
      }
    },
    dealIdFrom: async (hash) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      for (const entry of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: makhzanArtifact.abi, data: entry.data, topics: entry.topics });
          if (decoded.eventName === "DealCreated") return Number((decoded.args as unknown as { dealId: number }).dealId);
        } catch {
          // not a Makhzan event this demo decodes
        }
      }
      throw new GateDemoError(`no DealCreated event in ${hash}`);
    },
    advanceTo: async (target, log) => {
      log(`waiting for block ${target} on the live chain (no mining); polling every 6 s`);
      for (;;) {
        const current = await publicClient.getBlockNumber();
        if (current >= target) return;
        if ((Date.now() - started) / 1000 > args.waitSeconds) {
          throw new GateDemoError(`waited ${args.waitSeconds}s and the chain is at block ${current}, target ${target}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 6000));
      }
    },
    accounts: { owner: owner.address, provider: provider.address, stranger: owner.address },
  };
}
