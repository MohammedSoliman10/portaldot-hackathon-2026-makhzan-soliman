import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { test } from "node:test";
import { ConfigError, loadConfig } from "../src/config.ts";

const LIVE = {
  MAKHZAN_RPC_URL: "https://test-evm-rpc-v3.portaldot.dev",
  MAKHZAN_CHAIN_ID: "420420777",
  MAKHZAN_CONTRACT: "0x60481DFcFCA34A8F095939D9675eC715127B2e44",
};

test("loadConfig needs an explicit RPC, chain id and contract", () => {
  assert.throws(() => loadConfig({}), /MAKHZAN_RPC_URL/);
  assert.throws(() => loadConfig({ MAKHZAN_RPC_URL: "https://x" }), /MAKHZAN_CHAIN_ID/);
  assert.throws(
    () => loadConfig({ MAKHZAN_RPC_URL: "https://x", MAKHZAN_CHAIN_ID: "420420777" }),
    /MAKHZAN_CONTRACT/,
  );
  assert.throws(() => loadConfig({ ...LIVE, MAKHZAN_CHAIN_ID: "abc" }), ConfigError);
  assert.throws(() => loadConfig({ ...LIVE, MAKHZAN_CONTRACT: "0x1234" }), /20 bytes/);
});

test("loadConfig defaults to live StorageGate on chain 420420777", () => {
  const config = loadConfig(LIVE);
  assert.equal(config.blockSize, 1024);
  assert.equal(config.timeoutMs, 8000);
  assert.equal(config.gate, "0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA");
  assert.equal(config.chainId, 420_420_777);
});

test("loadConfig defaults to no gate on unconfigured chains", () => {
  const config = loadConfig({ ...LIVE, MAKHZAN_CHAIN_ID: "31337" });
  assert.equal(config.gate, null);
  assert.equal(config.chainId, 31337);
});

test("loadConfig allows MAKHZAN_GATE_ADDRESS to override the default", () => {
  const config = loadConfig({
    ...LIVE,
    MAKHZAN_GATE_ADDRESS: "0x1111111111111111111111111111111111111111",
  });
  assert.equal(config.gate, "0x1111111111111111111111111111111111111111");
});

test("loadConfig treats empty MAKHZAN_GATE_ADDRESS as no gate", () => {
  const configEmpty = loadConfig({
    ...LIVE,
    MAKHZAN_GATE_ADDRESS: "",
  });
  assert.equal(configEmpty.gate, null);

  const configWhitespace = loadConfig({
    ...LIVE,
    MAKHZAN_GATE_ADDRESS: "   ",
  });
  assert.equal(configWhitespace.gate, null);
});

test("loadConfig accepts a gate and an explicit timeout", () => {
  const config = loadConfig({
    ...LIVE,
    MAKHZAN_GATE: "0x1111111111111111111111111111111111111111",
    MAKHZAN_RPC_TIMEOUT_MS: "3000",
    MAKHZAN_BLOCK_SIZE: "512",
  });
  assert.equal(config.gate, "0x1111111111111111111111111111111111111111");
  assert.equal(config.timeoutMs, 3000);
  assert.equal(config.blockSize, 512);
});

test("loadConfig refuses to start with a key in the environment, and never echoes it", () => {
  const secret = "0x" + "11".repeat(32);
  for (const name of ["MAKHZAN_PRIVATE_KEY", "OWNER_KEY", "PROVIDER_1_KEY", "MNEMONIC"]) {
    try {
      loadConfig({ ...LIVE, [name]: secret });
      assert.fail(`${name} should be refused`);
    } catch (error) {
      assert.ok(error instanceof ConfigError);
      assert.match((error as Error).message, new RegExp(name));
      assert.ok(!(error as Error).message.includes(secret), "the message must not echo the value");
    }
  }
});

test("loadConfig rejects a timeout that is not a positive integer", () => {
  assert.throws(() => loadConfig({ ...LIVE, MAKHZAN_RPC_TIMEOUT_MS: "0" }), ConfigError);
  assert.throws(() => loadConfig({ ...LIVE, MAKHZAN_RPC_TIMEOUT_MS: "soon" }), ConfigError);
  assert.throws(() => loadConfig({ ...LIVE, MAKHZAN_BLOCK_SIZE: "70000" }), /block size/);
});

test("loadConfig keeps verify_file inside the current directory by default", () => {
  assert.equal(loadConfig(LIVE).verifyDir, process.cwd());
});

test("loadConfig resolves MAKHZAN_VERIFY_DIR to an absolute folder", () => {
  assert.equal(loadConfig({ ...LIVE, MAKHZAN_VERIFY_DIR: "/srv/makhzan-files" }).verifyDir, "/srv/makhzan-files");
  assert.equal(
    loadConfig({ ...LIVE, MAKHZAN_VERIFY_DIR: "fixtures/pdfs" }).verifyDir,
    resolve(process.cwd(), "fixtures/pdfs"),
  );
  // An empty value is the same as not setting it.
  assert.equal(loadConfig({ ...LIVE, MAKHZAN_VERIFY_DIR: "  " }).verifyDir, process.cwd());
});
