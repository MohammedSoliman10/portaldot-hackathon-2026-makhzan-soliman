import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidateAAccountId32, generateBurners, writeBurnerEnv } from "../src/keygen.ts";

test("candidate A is the 20 EVM bytes followed by twelve 0xEE bytes", () => {
  const evm = `0x${"11".repeat(20)}`;
  const accountId = candidateAAccountId32(evm);
  assert.equal(accountId, `0x${"11".repeat(20)}${"ee".repeat(12)}`);
  assert.equal(accountId.length, 66);
});

test("candidate A rejects a non-address", () => {
  assert.throws(() => candidateAAccountId32("0x1234"), /20-byte/);
});

test("keygen produces six distinct keys", () => {
  const burners = generateBurners();
  assert.equal(burners.length, 6);
  assert.equal(new Set(burners.map((burner) => burner.privateKey)).size, 6);
  assert.equal(new Set(burners.map((burner) => burner.evm)).size, 6);
});

test("the env file is mode 600 and is never overwritten", async () => {
  const dir = await mkdtemp(join(tmpdir(), "makhzan-keygen-"));
  const path = join(dir, ".env");
  const burners = generateBurners();
  await writeBurnerEnv(path, burners);
  const mode = (await stat(path)).mode & 0o777;
  assert.equal(mode, 0o600);
  const text = await readFile(path, "utf8");
  assert.match(text, /OWNER_KEY=0x[0-9a-f]{64}/);
  await assert.rejects(() => writeBurnerEnv(path, burners), /refusing to overwrite/);
});
