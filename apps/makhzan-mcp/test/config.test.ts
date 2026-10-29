import { strict as assert } from "node:assert";
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

test("loadConfig defaults to 1024-byte blocks, an 8 s timeout and no gate", () => {
  const config = loadConfig(LIVE);
  assert.equal(config.blockSize, 1024);
  assert.equal(config.timeoutMs, 8000);
  assert.equal(config.gate, null);
  assert.equal(config.chainId, 420_420_777);
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
