import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Hex } from "viem";
import {
  DeployError,
  deploySettings,
  loadArtifact,
  parseDeployArgs,
  runDeploy,
  WEI_PER_UNIT,
  type DeployArgs,
  type DeployDeps,
} from "../src/deploy.ts";

const E18 = 10n ** 18n;
const HASH = `0x${"aa".repeat(32)}` as Hex;
const ADDRESS = `0x${"bb".repeat(20)}` as Hex;
const SETTINGS = deploySettings({
  MAKHZAN_NETWORK: "local",
  MAKHZAN_RPC_URL: "http://127.0.0.1:1",
  MAKHZAN_PRIVATE_KEY: `0x${"11".repeat(32)}`,
});

const artifact = loadArtifact("contracts/out/Makhzan.sol/Makhzan.json");
const runtimeCode = `0x${"00".repeat(artifact.runtimeBytes)}` as Hex;

function slot0For(args: DeployArgs): Hex {
  let value = BigInt(args.challengeWindow);
  value |= BigInt(args.challengeBlockSize) << 32n;
  value |= BigInt(args.slashBps) << 48n;
  value |= (args.minBondWei / WEI_PER_UNIT) << 64n;
  value |= BigInt(args.minDurationBlocks) << 176n;
  value |= BigInt(args.maxDurationBlocks) << 208n;
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "makhzan-resume-"));
}

function makeDeps(overrides: Partial<DeployDeps> = {}) {
  const sent: Hex[] = [];
  let receiptCalls = 0;
  const deps: DeployDeps = {
    chainId: async () => 420_420_777,
    estimateGas: async () => 1_000_000n,
    gasPrice: async () => 1_000_000_000n,
    balance: async () => 10_000n * E18,
    nonce: async () => 7,
    send: async (data: Hex) => {
      sent.push(data);
      return HASH;
    },
    receipt: async () => ({
      status: "success",
      contractAddress: ADDRESS,
      blockNumber: 5n,
    }),
    code: async () => runtimeCode,
    peek: async () => [slot0For(parseDeployArgs([]))],
    sleep: async () => {},
    ...overrides,
  };
  return {
    deps,
    sent,
    receiptCalls: () => receiptCalls,
    bumpReceipt: () => {
      receiptCalls += 1;
    },
  };
}

function args(out: string): DeployArgs {
  return { ...parseDeployArgs([]), out };
}

const log = () => {};

test("the receipt wait times out once and recovers, then removes the pending record", async () => {
  const dir = tempDir();
  const pendingFile = join(dir, "pending.json");
  let calls = 0;
  const f = makeDeps({
    receipt: async () => {
      calls += 1;
      if (calls === 1) throw new Error("receipt wait timed out");
      return { status: "success", contractAddress: ADDRESS, blockNumber: 5n };
    },
  });
  const lines: string[] = [];
  const result = await runDeploy(args(join(dir, "final.json")), SETTINGS, (line) => lines.push(line), {
    deps: f.deps,
    pendingFile,
  });
  assert.equal(calls, 2, "one retry after the timeout");
  assert.equal(result.record?.address.toLowerCase(), ADDRESS.toLowerCase());
  assert.equal(existsSync(pendingFile), false, "pending record removed after the final record");
  assert.match(lines.join("\n"), /pending/i, "the tx hash was surfaced before the wait");
  rmSync(dir, { recursive: true, force: true });
});

test("an exhausted wait keeps the pending record and a second run refuses to send", async () => {
  const dir = tempDir();
  const pendingFile = join(dir, "pending.json");
  const failed = makeDeps({
    receipt: async () => {
      throw new Error("receipt wait timed out");
    },
  });
  await assert.rejects(
    runDeploy(args(join(dir, "final.json")), SETTINGS, log, { deps: failed.deps, pendingFile }),
    (err: Error) => err instanceof DeployError && /receipt|timed out/.test(err.message),
  );
  assert.equal(existsSync(pendingFile), true, "pending record is kept");
  const pending = JSON.parse(readFileSync(pendingFile, "utf8"));
  assert.equal(pending.txHash, HASH);
  assert.equal(pending.nonce, 7);
  assert.match(pending.deployer, /^0x[0-9a-fA-F]{40}$/);
  assert.match(pending.utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(pending.network, "local");
  assert.equal(pending.chainId, 420_420_777);

  const second = makeDeps();
  await assert.rejects(
    runDeploy(args(join(dir, "final.json")), SETTINGS, log, { deps: second.deps, pendingFile }),
    (err: Error) => err instanceof DeployError && /pending deploy/.test(err.message),
  );
  assert.equal(second.sent.length, 0, "no second deploy was sent");
  rmSync(dir, { recursive: true, force: true });
});

test("--resume waits for the recorded tx and writes the final record without sending", async () => {
  const dir = tempDir();
  const pendingFile = join(dir, "pending.json");
  const failed = makeDeps({
    receipt: async () => {
      throw new Error("receipt wait timed out");
    },
  });
  await assert.rejects(
    runDeploy(args(join(dir, "final.json")), SETTINGS, log, { deps: failed.deps, pendingFile }),
  );
  const good = makeDeps();
  const result = await runDeploy(
    { ...args(join(dir, "final.json")), resume: HASH },
    SETTINGS,
    log,
    { deps: good.deps, pendingFile },
  );
  assert.equal(result.record?.txHash, HASH);
  assert.equal(good.sent.length, 0, "resume never sends");
  assert.equal(existsSync(pendingFile), false);
  assert.equal(existsSync(join(dir, "final.json")), true);
  rmSync(dir, { recursive: true, force: true });
});

test("--force-new overrides a pending record and sends exactly once", async () => {
  const dir = tempDir();
  const pendingFile = join(dir, "pending.json");
  const failed = makeDeps({
    receipt: async () => {
      throw new Error("receipt wait timed out");
    },
  });
  await assert.rejects(
    runDeploy(args(join(dir, "final.json")), SETTINGS, log, { deps: failed.deps, pendingFile }),
  );
  const forced = makeDeps();
  const result = await runDeploy(
    { ...args(join(dir, "final.json")), forceNew: true },
    SETTINGS,
    log,
    { deps: forced.deps, pendingFile },
  );
  assert.equal(forced.sent.length, 1);
  assert.equal(result.record?.txHash, HASH);
  assert.equal(existsSync(pendingFile), false);
  rmSync(dir, { recursive: true, force: true });
});

test("the receipt wait is bounded", async () => {
  const dir = tempDir();
  const pendingFile = join(dir, "pending.json");
  let calls = 0;
  const f = makeDeps({
    receipt: async () => {
      calls += 1;
      throw new Error("receipt wait timed out");
    },
  });
  await assert.rejects(
    runDeploy(args(join(dir, "final.json")), SETTINGS, log, { deps: f.deps, pendingFile }),
  );
  assert.equal(calls, 5, "five bounded attempts");
  rmSync(dir, { recursive: true, force: true });
});

test("--resume and --dry-run cannot be combined", async () => {
  const dir = tempDir();
  await assert.rejects(
    runDeploy(
      { ...args(join(dir, "final.json")), resume: HASH, dryRun: true },
      SETTINGS,
      log,
      { deps: makeDeps().deps, pendingFile: join(dir, "pending.json") },
    ),
    /--resume cannot be combined with --dry-run/,
  );
  rmSync(dir, { recursive: true, force: true });
});
