import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadSettings } from "../src/settings.ts";

const KEY = "0x" + "11".repeat(32);
const CONTRACT = "0x" + "22".repeat(20);

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { MAKHZAN_NETWORK: "local", MAKHZAN_CONTRACT: CONTRACT, MAKHZAN_PRIVATE_KEY: KEY, ...extra };
}

test("the network is explicit and has no default", () => {
  assert.throws(() => loadSettings({ MAKHZAN_CONTRACT: CONTRACT, MAKHZAN_PRIVATE_KEY: KEY }), /MAKHZAN_NETWORK/);
  assert.throws(() => loadSettings(env({ MAKHZAN_NETWORK: "devnet" })), /MAKHZAN_NETWORK/);
});

test("live needs an RPC URL and a chain id", () => {
  assert.throws(() => loadSettings(env({ MAKHZAN_NETWORK: "live" })), /MAKHZAN_RPC_URL/);
  assert.throws(() => loadSettings(env({ MAKHZAN_NETWORK: "live", MAKHZAN_RPC_URL: "http://127.0.0.1:1" })), /MAKHZAN_CHAIN_ID/);
});

test("the contract and key are required and shaped", () => {
  assert.throws(() => loadSettings(env({ MAKHZAN_CONTRACT: undefined as never })), /MAKHZAN_CONTRACT/);
  assert.throws(() => loadSettings(env({ MAKHZAN_CONTRACT: "0x1234" })), /MAKHZAN_CONTRACT/);
  assert.throws(() => loadSettings(env({ MAKHZAN_PRIVATE_KEY: undefined as never })), /MAKHZAN_PRIVATE_KEY/);
  assert.throws(() => loadSettings(env({ MAKHZAN_PRIVATE_KEY: "abc" })), /32 bytes of hex/);
});

test("local defaults are explicit values, not a hidden network", () => {
  const settings = loadSettings(env());
  assert.equal(settings.network, "local");
  assert.equal(settings.chainId, 420420777);
  assert.equal(settings.rpcUrl, "http://127.0.0.1:8549");
  assert.equal(settings.stateDir, ".state");
  assert.equal(settings.daemonPort, 8787);
  assert.equal(settings.pollMs, 6000);
  assert.equal(settings.daemonUrl, "http://127.0.0.1:8787");
  assert.equal(settings.receiptTimeoutMs, 120_000);
});

test("the receipt wait cannot be configured below 120 s", () => {
  assert.equal(loadSettings(env({ MAKHZAN_RECEIPT_TIMEOUT_MS: "600000" })).receiptTimeoutMs, 600_000);
  assert.throws(
    () => loadSettings(env({ MAKHZAN_RECEIPT_TIMEOUT_MS: "15000" })),
    /at least 120000/,
  );
});

test("live rejects a chain id that is not an integer", () => {
  assert.throws(
    () => loadSettings(env({ MAKHZAN_NETWORK: "live", MAKHZAN_RPC_URL: "https://x", MAKHZAN_CHAIN_ID: "4a" })),
    /MAKHZAN_CHAIN_ID/,
  );
});

test("state dir, port and poll interval are configurable", () => {
  const settings = loadSettings(env({ MAKHZAN_STATE_DIR: "/tmp/x", MAKHZAN_DAEMON_PORT: "9001", MAKHZAN_POLL_MS: "1500" }));
  assert.equal(settings.stateDir, "/tmp/x");
  assert.equal(settings.daemonPort, 9001);
  assert.equal(settings.pollMs, 1500);
  assert.equal(settings.daemonUrl, "http://127.0.0.1:9001");
});
