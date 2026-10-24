import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createPublicClient, http, keccak256, type Hex } from "viem";
import {
  DeployError,
  LOCAL_CHAIN_ID,
  deploySettings,
  loadArtifact,
  main,
  parseDeployArgs,
  runDeploy,
  type DeploymentRecord,
} from "../src/deploy.ts";

const PORT = 8561;
const RPC = `http://127.0.0.1:${PORT}`;
// anvil's public default account #0. Test key only, never used against a live chain.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const MIN_BOND = "100000000000000000000"; // 1e20 wei = 1e16 units
const ARTIFACT = "contracts/out/Makhzan.sol/Makhzan.json";

const publicClient = createPublicClient({ transport: http(RPC) });
let anvil: ReturnType<typeof spawn>;
const dirs: string[] = [];
let evidenceRoot: string | undefined;

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    MAKHZAN_NETWORK: "local",
    MAKHZAN_RPC_URL: RPC,
    MAKHZAN_PRIVATE_KEY: TEST_KEY,
    // Tests must never write into the tracked evidence tree.
    MAKHZAN_EVIDENCE_DIR: (evidenceRoot ??= tempDir()),
    ...extra,
  };
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-deploy-"));
  dirs.push(dir);
  return dir;
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

test("the network must be explicit: no default", () => {
  assert.throws(
    () => deploySettings({ MAKHZAN_RPC_URL: RPC, MAKHZAN_PRIVATE_KEY: TEST_KEY }),
    (err: Error) => err instanceof DeployError && /MAKHZAN_NETWORK must be set/.test(err.message),
  );
  assert.throws(
    () => deploySettings({ MAKHZAN_NETWORK: "testnet", MAKHZAN_PRIVATE_KEY: TEST_KEY }),
    /MAKHZAN_NETWORK must be set/,
  );
});

test("live needs an RPC URL and a chain id", () => {
  assert.throws(
    () => deploySettings({ MAKHZAN_NETWORK: "live", MAKHZAN_PRIVATE_KEY: TEST_KEY }),
    /MAKHZAN_RPC_URL/,
  );
  assert.throws(
    () => deploySettings({ MAKHZAN_NETWORK: "live", MAKHZAN_PRIVATE_KEY: TEST_KEY, MAKHZAN_RPC_URL: RPC }),
    /MAKHZAN_CHAIN_ID/,
  );
});

test("the key is required and must be key-shaped", () => {
  assert.throws(() => deploySettings({ MAKHZAN_NETWORK: "local" }), /MAKHZAN_PRIVATE_KEY is not set/);
  assert.throws(
    () => deploySettings({ MAKHZAN_NETWORK: "local", MAKHZAN_PRIVATE_KEY: "0xabc" }),
    /32 bytes of hex/,
  );
});

test("a minBond that is not a whole protocol unit is refused", () => {
  assert.throws(() => parseDeployArgs(["--min-bond", "10001"]), /whole number of protocol units/);
  assert.throws(() => parseDeployArgs(["--min-bond", "0"]), /positive/);
  const args = parseDeployArgs(["--min-bond", "20000"]);
  assert.equal(args.minBondWei % 10_000n, 0n);
});

test("an out-of-bound constructor value is refused", () => {
  assert.throws(() => parseDeployArgs(["--block-size", "1023"]), /between 1024 and 4096/);
  assert.throws(() => parseDeployArgs(["--block-size", "4097"]), /between 1024 and 4096/);
  assert.throws(() => parseDeployArgs(["--slash-bps", "0"]), /1\.\.10000/);
  assert.throws(() => parseDeployArgs(["--window", "0"]), /positive/);
  assert.throws(() => parseDeployArgs(["--max-duration", "5", "--min-duration", "10"]), />= --min-duration/);
});

test("a missing artifact is refused before any transaction", async () => {
  await assert.rejects(
    runDeploy(parseDeployArgs(["--min-bond", MIN_BOND, "--artifact", "does/not/exist.json"]), deploySettings(env()), () => {}),
    /cannot read artifact/,
  );
});

test("dry-run prints a tPOT estimate and sends nothing", async () => {
  const before = await publicClient.getTransactionCount({ address: (await import("viem/accounts")).privateKeyToAccount(TEST_KEY).address });
  const lines: string[] = [];
  const code = await main(
    ["--dry-run", "--min-bond", MIN_BOND],
    env({ MAKHZAN_CALIBRATION_FILE: join(tempDir(), "absent-calibration.json") }),
    (line) => lines.push(line),
  );
  assert.equal(code, 0, lines.join("\n"));
  const output = lines.join("\n");
  assert.match(output, /estimated deploy cost [0-9]+\.[0-9]{6} tPOT/);
  assert.match(output, /reserve 100 tPOT/);
  assert.match(output, /calibration: not yet verified against a live probe/);
  assert.match(output, /dry run: no transaction sent/);
  const after = await publicClient.getTransactionCount({ address: (await import("viem/accounts")).privateKeyToAccount(TEST_KEY).address });
  assert.equal(after, before, "no transaction was sent");
});

test("a dry run that would leave the owner below the reserve is refused", async () => {
  const lines: string[] = [];
  const code = await main(["--dry-run", "--min-bond", MIN_BOND, "--reserve-tpot", "1000000"], env(), (line) => lines.push(line));
  assert.equal(code, 1);
  assert.match(lines.join("\n"), /below the DR-012 reserve of 1000000 tPOT/);
});

test("a deploy on anvil writes a correct record", async () => {
  const dir = tempDir();
  const out = join(dir, "deployment.json");
  const lines: string[] = [];
  const code = await main(
    ["--min-bond", MIN_BOND, "--out", out, "--window", "11", "--block-size", "2048", "--slash-bps", "1500"],
    env(),
    (line) => lines.push(line),
  );
  assert.equal(code, 0, lines.join("\n"));

  const record = JSON.parse(readFileSync(out, "utf8")) as DeploymentRecord;
  assert.equal(record.network, "local");
  assert.equal(record.evidenceLabel, "[local run]");
  assert.equal(record.chainId, LOCAL_CHAIN_ID);
  assert.match(record.utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(record.address, /^0x[0-9a-fA-F]{40}$/);

  const receipt = await publicClient.getTransactionReceipt({ hash: record.txHash as Hex });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.contractAddress?.toLowerCase(), record.address.toLowerCase());
  assert.equal(receipt.blockNumber.toString(), record.blockNumber);

  const code2 = await publicClient.getCode({ address: record.address as Hex });
  assert.ok(code2 && code2 !== "0x");
  assert.equal(record.codeHash, keccak256(code2));
  assert.equal(record.runtimeBytes, (code2.length - 2) / 2);
  assert.equal(record.runtimeBytes, loadArtifact(ARTIFACT).runtimeBytes);

  assert.deepEqual(record.constructor, {
    challengeWindowBlocks: 11,
    challengeBlockSize: 2048,
    slashBps: 1500,
    minBondUnits: (BigInt(MIN_BOND) / 10_000n).toString(),
    minBondWei: MIN_BOND,
    minDurationBlocks: 10,
    maxDurationBlocks: 1000,
  });
});

test("a custom artifact is measured, not assumed", async () => {
  const dir = tempDir();
  const copy = join(dir, "Makhzan.json");
  const artifact = JSON.parse(readFileSync(join(process.cwd(), "../../contracts/out/Makhzan.sol/Makhzan.json"), "utf8"));
  const { writeFileSync } = await import("node:fs");
  writeFileSync(copy, JSON.stringify(artifact));
  const loaded = loadArtifact(copy);
  assert.equal(loaded.runtimeBytes, loadArtifact(ARTIFACT).runtimeBytes);
  assert.ok(loaded.abi.length > 0);
});
