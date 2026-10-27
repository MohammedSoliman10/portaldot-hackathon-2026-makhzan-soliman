import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createPublicClient, http, type Hex } from "viem";
import {
  GateDemoError,
  LOCAL_DEMO_CHAIN_ID,
  makeLocalChain,
  parseGateDemoArgs,
  planHash,
  requireDryRun,
  runGateDemo,
  writeDryRunMarker,
  type GateDemoArgs,
} from "../src/gateDemo.ts";

const PORT = 8563;
const RPC = `http://127.0.0.1:${PORT}`;
const MNEMONIC = "test test test test test test test test test test test junk";
const MAKHZAN = `0x${"ab".repeat(20)}` as Hex;
const GATE = `0x${"cd".repeat(20)}` as Hex;
const KEY = `0x${"11".repeat(32)}`;
const PROVIDER_KEY = `0x${"22".repeat(32)}`;

const publicClient = createPublicClient({ transport: http(RPC) });
let anvil: ReturnType<typeof spawn>;
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-gate-demo-"));
  dirs.push(dir);
  return dir;
}

function liveEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    MAKHZAN_NETWORK: "live",
    MAKHZAN_RPC_URL: "https://rpc.invalid",
    MAKHZAN_CHAIN_ID: "420420777",
    MAKHZAN_PRIVATE_KEY: KEY,
    MAKHZAN_PROVIDER_KEY: PROVIDER_KEY,
    ...extra,
  };
}

before(async () => {
  anvil = spawn("anvil", ["--chain-id", String(LOCAL_DEMO_CHAIN_ID), "--port", String(PORT), "--silent"], {
    stdio: "ignore",
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await publicClient.getBlockNumber();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error("anvil did not start");
});

after(() => {
  anvil?.kill("SIGTERM");
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

test("local is the default and needs no key in the environment", () => {
  const args = parseGateDemoArgs([], {});
  assert.equal(args.live, false);
  assert.equal(args.chainId, LOCAL_DEMO_CHAIN_ID);
  assert.match(args.rpcUrl, /127\.0\.0\.1:8549/);
  assert.equal(args.amountWei, 10n ** 18n);
  assert.equal(args.minBondUnits, 900_000_000_000_000n);
});

test("a live run needs the --live flag and a live-configured environment", () => {
  assert.throws(
    () => parseGateDemoArgs([], liveEnv()),
    (err: Error) => err instanceof GateDemoError && /--live/.test(err.message),
  );
  assert.throws(
    () => parseGateDemoArgs(["--live"], { MAKHZAN_NETWORK: "local" }),
    /MAKHZAN_NETWORK=live/,
  );
  assert.throws(
    () => parseGateDemoArgs(["--live"], {}),
    /MAKHZAN_NETWORK=live/,
  );
});

test("a live run needs explicit addresses and both keys, and never takes a key on argv", () => {
  assert.throws(() => parseGateDemoArgs(["--live"], liveEnv()), /--makhzan/);
  assert.throws(() => parseGateDemoArgs(["--live", "--makhzan", MAKHZAN], liveEnv()), /--gate/);
  assert.throws(
    () => parseGateDemoArgs(["--live", "--makhzan", MAKHZAN, "--gate", GATE], liveEnv({ MAKHZAN_PRIVATE_KEY: "" })),
    /MAKHZAN_PRIVATE_KEY/,
  );
  assert.throws(
    () => parseGateDemoArgs(["--live", "--makhzan", MAKHZAN, "--gate", GATE], liveEnv({ MAKHZAN_PROVIDER_KEY: "" })),
    /MAKHZAN_PROVIDER_KEY/,
  );
  for (const flag of ["--private-key", "--key", "--provider-key"]) {
    assert.throws(
      () => parseGateDemoArgs(["--live", "--makhzan", MAKHZAN, "--gate", GATE, flag, KEY], liveEnv()),
      /never accepted on argv/,
      flag,
    );
  }
});

test("the live plan refuses to run without a dry run of the same plan", () => {
  const markerDir = tempDir();
  const marker = join(markerDir, "dry-run.json");
  const args = parseGateDemoArgs(["--live", "--makhzan", MAKHZAN, "--gate", GATE], liveEnv());
  assert.throws(() => requireDryRun(args, marker), /--dry-run first/);

  writeDryRunMarker(marker, args);
  assert.doesNotThrow(() => requireDryRun(args, marker));

  const other = parseGateDemoArgs(["--live", "--makhzan", MAKHZAN, "--gate", GATE, "--amount", "2000000000000000000"], liveEnv());
  assert.throws(() => requireDryRun(other, marker), /different plan/);
});

test("the dry-run marker records the plan, never a key", () => {
  const dir = tempDir();
  const marker = join(dir, "dry-run.json");
  const args = parseGateDemoArgs(["--live", "--makhzan", MAKHZAN, "--gate", GATE], liveEnv());
  writeDryRunMarker(marker, args);
  const text = readFileSync(marker, "utf8");
  assert.equal((JSON.parse(text) as { planHash: string }).planHash, planHash(args));
  assert.ok(!text.includes(KEY.slice(2)), "the owner key must not be in the marker");
  assert.ok(!text.includes(PROVIDER_KEY.slice(2)), "the provider key must not be in the marker");
});

test("a live dry run checks the chain read-only and sends nothing", async () => {
  const args = parseGateDemoArgs(["--live", "--dry-run", "--makhzan", MAKHZAN, "--gate", GATE], liveEnv());
  const calls: string[] = [];
  const chain = {
    chainId: async () => 420_420_777,
    blockNumber: async () => 7n,
    balance: async () => 10n ** 18n,
    code: async (address: Hex) =>
      [MAKHZAN, GATE].some((known) => known.toLowerCase() === address.toLowerCase()) ? "0x6000" : undefined,
    read: async <R>() => 0n as R,
    send: async () => {
      calls.push("send");
      throw new Error("a dry run must not send");
    },
    dealIdFrom: async () => 0,
    simulate: async () => {
      calls.push("simulate");
      return { ok: true as const };
    },
    advanceTo: async () => {
      calls.push("advanceTo");
    },
    accounts: { owner: MAKHZAN, provider: GATE, stranger: GATE },
  };
  const lines: string[] = [];
  const marker = join(tempDir(), "dry-run.json");
  const result = await runGateDemo(args, chain, (line) => lines.push(line), { markerPath: marker, outDir: tempDir() });
  assert.equal(result.dryRun, true);
  assert.deepEqual(calls, [], "no write and no mining in a dry run");
  assert.ok(lines.some((line) => /dry run: no transaction sent/.test(line)));
  assert.doesNotThrow(() => requireDryRun(args, marker));
  assert.ok(!lines.join("\n").includes(KEY.slice(2)), "no key in the output");
});

test("the local demo: lock, release, expire, slash, BondTooLow, refund", async () => {
  const outDir = tempDir();
  const args = parseGateDemoArgs([
    "--amount", "1000000000000000000",
    "--price", "500000000000000",
    "--min-bond", "900000000000000",
    "--duration", "80",
    "--window", "10",
    "--out", outDir,
  ], { MAKHZAN_ANVIL_MNEMONIC: MNEMONIC, MAKHZAN_RPC_URL: RPC });
  const chain = makeLocalChain({ rpcUrl: RPC, mnemonic: MNEMONIC, outDir });
  const lines: string[] = [];
  const result = await runGateDemo(args, chain, (line) => lines.push(line));

  assert.equal(result.dryRun, false);
  assert.equal(result.releaseARefused, undefined, "release A passed while healthy");
  assert.equal(result.releaseBRefused, "BondTooLow");
  assert.equal(result.refundInTermRefused, "RefundNotAllowed");
  assert.equal(result.bondBefore, 1_000_000_000_000_000n);
  assert.equal(result.bondAfter, 800_000_000_000_000n, "20% slashed");
  assert.equal(result.slashWei, 2_000_000_000_000_000_000n, "0.2e15 units in wei");
  assert.equal(result.lockedAmount, 1_000_000_000_000_000_000n);
  assert.equal(result.gateBalanceWhileRefused, 1_000_000_000_000_000_000n, "value stayed in the gate");
  assert.equal(result.gateBalanceAtEnd, 0n, "everything paid out or refunded");
  assert.equal(result.providerGainWei, 1_000_000_000_000_000_000n, "release A paid the provider");
  assert.equal(
    result.ownerNetWei,
    -1_000_000_000_000_000_000n - 2n * result.priceWei! + 2_000_000_000_000_000_000n,
    "two deals, one refunded, and the slash came back to the payer",
  );

  const text = lines.join("\n");
  for (const step of ["lock", "release", "challenge", "resolve", "refund"]) {
    assert.match(text, new RegExp(`== .*${step}`, "i"), step);
  }
  assert.match(text, /BondTooLow/);
  assert.match(text, /RefundNotAllowed/);
  assert.ok(!text.includes(MNEMONIC), "the mnemonic must not be printed");
  assert.ok(lines.some((line) => /== summary ==/.test(line)));
});
