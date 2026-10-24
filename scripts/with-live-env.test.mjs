import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const REPO = resolve(import.meta.dirname, "..");
const SCRIPT = join(REPO, "scripts", "with-live-env.sh");
const OWNER = `0x${"aa".repeat(32)}`;
const PROVIDER_1 = `0x${"bb".repeat(32)}`;
const UNUSED = `0x${"cc".repeat(32)}`;

const sha = (value) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-live-env-"));
  const envFile = join(dir, ".env");
  writeFileSync(envFile, [
    "# fake test fixture; no real key",
    "PORTALDOT_EVM_RPC_URL=https://unused.invalid",
    `OWNER_KEY=${OWNER}`,
    `PROVIDER_1_KEY=${PROVIDER_1}`,
    `PROVIDER_2_KEY=${UNUSED}`,
    "",
  ].join("\n"));
  return { dir, envFile };
}

/** The child prints only what is safe; the key is compared by hash inside the child. */
function probe(envFile, role, key) {
  return spawnSync(
    "bash",
    [SCRIPT, role, "--", "node", "-e", [
      `process.stdout.write(JSON.stringify({`,
      `network: process.env.MAKHZAN_NETWORK,`,
      `rpc: process.env.MAKHZAN_RPC_URL,`,
      `chain: process.env.MAKHZAN_CHAIN_ID,`,
      `keyHash: require("node:crypto").createHash("sha256").update(process.env.MAKHZAN_PRIVATE_KEY ?? "").digest("hex"),`,
      `otherKey: process.env.PROVIDER_2_KEY ?? null`,
      `}))`,
    ].join(" ")],
    { encoding: "utf8", env: { ...process.env, WITH_LIVE_ENV_FILE: envFile }, cwd: REPO },
  );
}

test("owner role loads only OWNER_KEY and sets the live network without printing any value", () => {
  const { dir, envFile } = fixture();
  const result = probe(envFile, "owner", OWNER);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(OWNER), false, "stdout must not contain the key");
  assert.equal(result.stderr.includes(OWNER), false, "stderr must not contain the key");
  const seen = JSON.parse(result.stdout);
  assert.equal(seen.network, "live");
  assert.equal(seen.rpc, "https://test-evm-rpc-v3.portaldot.dev");
  assert.equal(seen.chain, "420420777");
  assert.equal(seen.keyHash, sha(OWNER));
  assert.equal(seen.otherKey, null, "unrelated keys from the file are not exported");
  rmSync(dir, { recursive: true, force: true });
});

test("provider-1 role loads PROVIDER_1_KEY, not the owner key", () => {
  const { dir, envFile } = fixture();
  const result = probe(envFile, "provider-1", PROVIDER_1);
  assert.equal(result.status, 0, result.stderr);
  const seen = JSON.parse(result.stdout);
  assert.equal(seen.keyHash, sha(PROVIDER_1));
  assert.notEqual(seen.keyHash, sha(OWNER));
  assert.equal(result.stdout.includes(PROVIDER_1), false);
  rmSync(dir, { recursive: true, force: true });
});

test("the wrapper writes nothing: the fixture directory holds only the fake .env", () => {
  const { dir, envFile } = fixture();
  const before = readdirSync(dir).sort();
  probe(envFile, "owner", OWNER);
  assert.deepEqual(readdirSync(dir).sort(), before);
  assert.equal(readFileSync(envFile, "utf8").includes(OWNER), true, "the fixture itself is unchanged");
  rmSync(dir, { recursive: true, force: true });
});

test("an unknown role is refused without echoing file contents", () => {
  const { dir, envFile } = fixture();
  const result = spawnSync("bash", [SCRIPT, "stranger", "--", "true"], {
    encoding: "utf8", env: { ...process.env, WITH_LIVE_ENV_FILE: envFile }, cwd: REPO,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown role/);
  assert.equal(result.stderr.includes(OWNER), false);
  assert.equal(result.stderr.includes(PROVIDER_1), false);
  rmSync(dir, { recursive: true, force: true });
});

test("a missing key, a missing file and a malformed key are refused", () => {
  const { dir, envFile } = fixture();
  const noProvider = join(dir, "no-provider.env");
  writeFileSync(noProvider, `OWNER_KEY=${OWNER}\n`);
  const missing = spawnSync("bash", [SCRIPT, "provider-1", "--", "true"], {
    encoding: "utf8", env: { ...process.env, WITH_LIVE_ENV_FILE: noProvider }, cwd: REPO,
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /PROVIDER_1_KEY is not set/);

  const noFile = spawnSync("bash", [SCRIPT, "owner", "--", "true"], {
    encoding: "utf8", env: { ...process.env, WITH_LIVE_ENV_FILE: join(dir, "absent.env") }, cwd: REPO,
  });
  assert.notEqual(noFile.status, 0);
  assert.match(noFile.stderr, /cannot read/);

  const bad = join(dir, "bad.env");
  writeFileSync(bad, "OWNER_KEY=not-a-key\n");
  const malformed = spawnSync("bash", [SCRIPT, "owner", "--", "true"], {
    encoding: "utf8", env: { ...process.env, WITH_LIVE_ENV_FILE: bad }, cwd: REPO,
  });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /not a 32-byte hex key/);
  assert.equal(malformed.stderr.includes("not-a-key"), false);
  rmSync(dir, { recursive: true, force: true });
});

test("the -- separator is required", () => {
  const { dir, envFile } = fixture();
  const result = spawnSync("bash", [SCRIPT, "owner", "true"], {
    encoding: "utf8", env: { ...process.env, WITH_LIVE_ENV_FILE: envFile }, cwd: REPO,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage/);
  rmSync(dir, { recursive: true, force: true });
});
