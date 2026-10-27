import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createPublicClient, http, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  DeployError,
  LOCAL_CHAIN_ID,
  deployPaths,
  deploySettings,
  loadArtifact,
  main,
  parseDeployArgs,
  runDeploy,
  type DeploymentRecord,
  type DeployDeps,
} from "../src/deploy.ts";

const PORT = 8562;
const RPC = `http://127.0.0.1:${PORT}`;
// anvil's public default account #0. Test key only, never used against a live chain.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// A registered Makhzan address for the gate to point at. Any address works for a local deploy:
// the gate only stores it and calls it, it never checks its code.
const MAKHZAN = `0x${"ab".repeat(20)}` as Hex;
const GATE_ARTIFACT = "contracts/out/StorageGate.sol/StorageGate.json";

const publicClient = createPublicClient({ transport: http(RPC) });
let anvil: ReturnType<typeof spawn>;
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-gate-deploy-"));
  dirs.push(dir);
  return dir;
}

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    MAKHZAN_NETWORK: "local",
    MAKHZAN_RPC_URL: RPC,
    MAKHZAN_PRIVATE_KEY: TEST_KEY,
    MAKHZAN_EVIDENCE_DIR: join(tempDir(), "evidence"),
    ...extra,
  };
}

before(async () => {
  anvil = spawn("anvil", ["--chain-id", String(LOCAL_CHAIN_ID), "--port", String(PORT), "--silent"], {
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

test("a gate deploy needs --makhzan, and Makhzan refuses it", () => {
  assert.throws(
    () => parseDeployArgs(["--contract", "gate"]),
    (err: Error) => err instanceof DeployError && /--contract gate needs --makhzan/.test(err.message),
  );
  assert.throws(() => parseDeployArgs(["--makhzan", MAKHZAN]), /--makhzan only applies to --contract gate/);
  assert.throws(() => parseDeployArgs(["--contract", "gate", "--makhzan", "0x1234"]), /40 hex/);
  assert.throws(() => parseDeployArgs(["--contract", "gate", "--makhzan", MAKHZAN, "--contract", "x"]), /--contract must be/);
});

test("Makhzan constructor flags are refused in gate mode instead of being ignored", () => {
  for (const flag of ["--min-bond", "--window", "--block-size", "--slash-bps", "--min-duration", "--max-duration"]) {
    assert.throws(
      () => parseDeployArgs(["--contract", "gate", "--makhzan", MAKHZAN, flag, "1"]),
      new RegExp(`\\${flag} is not a gate option`),
      flag,
    );
  }
});

test("the gate artifact and its pending record do not collide with Makhzan's", () => {
  const gate = parseDeployArgs(["--contract", "gate", "--makhzan", MAKHZAN]);
  const makhzan = parseDeployArgs([]);
  assert.equal(gate.contract, "gate");
  assert.match(gate.artifact, /StorageGate\.sol\/StorageGate\.json$/);
  assert.match(makhzan.artifact, /Makhzan\.sol\/Makhzan\.json$/);

  const gatePaths = deployPaths(gate, "local", LOCAL_CHAIN_ID);
  const makhzanPaths = deployPaths(makhzan, "local", LOCAL_CHAIN_ID);
  assert.match(gatePaths.pending, /pending-gate-local-420420777\.json$/);
  assert.match(makhzanPaths.pending, /pending-local-420420777\.json$/);
  assert.notEqual(gatePaths.pending, makhzanPaths.pending);
  assert.match(gatePaths.out, /gate-local-420420777-.+\.json$/);
});

test("a gate dry run prints an estimate and sends nothing", async () => {
  const owner = privateKeyToAccount(TEST_KEY).address;
  const before = await publicClient.getTransactionCount({ address: owner });
  const lines: string[] = [];
  const code = await main(
    ["--contract", "gate", "--makhzan", MAKHZAN, "--dry-run"],
    env({ MAKHZAN_CALIBRATION_FILE: join(tempDir(), "absent.json") }),
    (line) => lines.push(line),
  );
  assert.equal(code, 0, lines.join("\n"));
  const output = lines.join("\n");
  assert.match(output, /gate deploy: makhzan 0x[a-fA-F0-9]{40}/);
  assert.match(output, /estimated deploy cost [0-9]+\.[0-9]{6} tPOT/);
  assert.match(output, /dry run: no transaction sent/);
  const after = await publicClient.getTransactionCount({ address: owner });
  assert.equal(after, before, "no transaction was sent");
});

test("a gate deploy writes a record, reads the code back and calls makhzan()", async () => {
  const dir = tempDir();
  const out = join(dir, "gate-deployment.json");
  const lines: string[] = [];
  const code = await main(
    ["--contract", "gate", "--makhzan", MAKHZAN, "--out", out],
    env(),
    (line) => lines.push(line),
  );
  assert.equal(code, 0, lines.join("\n"));

  const record = JSON.parse(readFileSync(out, "utf8")) as DeploymentRecord;
  assert.equal(record.contract, "gate");
  assert.equal(record.network, "local");
  assert.equal(record.chainId, LOCAL_CHAIN_ID);
  assert.equal(record.gate?.makhzan.toLowerCase(), MAKHZAN.toLowerCase());
  assert.equal(Object.hasOwn(record, "constructor"), false, "no Makhzan constructor block on a gate record");

  const receipt = await publicClient.getTransactionReceipt({ hash: record.txHash as Hex });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.contractAddress?.toLowerCase(), record.address.toLowerCase());

  const deployed = await publicClient.getCode({ address: record.address as Hex });
  assert.ok(deployed && deployed !== "0x");
  assert.equal(record.codeHash, keccak256(deployed));
  assert.equal(record.runtimeBytes, (deployed.length - 2) / 2);
  assert.equal(record.runtimeBytes, loadArtifact(GATE_ARTIFACT).runtimeBytes);
  assert.equal(record.runtimeBytes, 2528, "the measured runtime, not an assumption");

  const pointedAt = await publicClient.readContract({
    address: record.address as Hex,
    abi: loadArtifact(GATE_ARTIFACT).abi,
    functionName: "makhzan",
  });
  assert.equal(String(pointedAt).toLowerCase(), MAKHZAN.toLowerCase());
});

test("a gate deploy whose makhzan() read-back differs is refused", async () => {
  const settings = deploySettings(env());
  const artifact = loadArtifact(GATE_ARTIFACT);
  const deps: DeployDeps = {
    chainId: async () => LOCAL_CHAIN_ID,
    estimateGas: async () => 1_000_000n,
    gasPrice: async () => 1_000_000_000n,
    balance: async () => 10_000n * 10n ** 18n,
    nonce: async () => 3,
    send: async () => `0x${"aa".repeat(32)}` as Hex,
    receipt: async () => ({ status: "success", contractAddress: `0x${"cc".repeat(20)}` as Hex, blockNumber: 9n }),
    code: async () => `0x${"00".repeat(artifact.runtimeBytes)}` as Hex,
    peek: async () => [],
    makhzanOf: async () => `0x${"dd".repeat(20)}` as Hex,
    sleep: async () => {},
  };
  await assert.rejects(
    runDeploy(
      parseDeployArgs(["--contract", "gate", "--makhzan", MAKHZAN, "--out", join(tempDir(), "record.json")]),
      settings,
      () => {},
      { deps, pendingFile: join(tempDir(), "pending.json") },
    ),
    /read-back differs: makhzan/,
  );
});

test("a Makhzan pending record does not block a gate deploy", async () => {
  const dir = tempDir();
  const gateArgs = parseDeployArgs(["--contract", "gate", "--makhzan", MAKHZAN]);
  const paths = deployPaths(gateArgs, "local", LOCAL_CHAIN_ID);
  const pendingDir = join(dir, "deployments");
  const makhzanPending = join(pendingDir, `pending-local-${LOCAL_CHAIN_ID}.json`);
  const { mkdirSync } = await import("node:fs");
  mkdirSync(pendingDir, { recursive: true });
  writeFileSync(makhzanPending, JSON.stringify({ state: "sending", network: "local" }), "utf8");

  const code = await main(
    ["--contract", "gate", "--makhzan", MAKHZAN, "--out", join(dir, "gate.json")],
    env(),
    () => {},
  );
  assert.equal(code, 0, "the gate deploy was not blocked by Makhzan's pending record");
});
