/**
 * Scanner regression tests.
 *
 * 1. The one documented allowlist entry (an exact path + exact path-fragment) must make the gate pass.
 * 2. The canary still proves real secrets are caught: PEM, literal key assignment and a mnemonic.
 * 3. The allowlist is narrow: a key-shaped line in another file is still a finding.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const SCANNER = join(REPO, "scripts", "secret-scan.mjs");

function scan(target) {
  const result = spawnSync(process.execPath, [SCANNER, target], { cwd: REPO, encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

function canaryDir() {
  return mkdtempSync(join(tmpdir(), "makhzan-canary-"));
}

test("the documented tier0 path-fragment entry is allowlisted and the gate passes", () => {
  const result = scan("specs/001-tier0-gates/tasks.md");
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /secret scan PASS/);
});

test("the canary still catches a PEM block, a literal key and a mnemonic", () => {
  const dir = canaryDir();
  const pem = ["-----BEGIN", "RSA", "PRIVATE KEY-----"].join(" ");
  const key = `0x${"ab".repeat(32)}`;
  const phrase = Array(12).fill("alpha").join(" ");
  writeFileSync(
    join(dir, "leak.txt"),
    `${pem}\nPRIVATE_KEY=${key}\nphrase = "${phrase}"\n`,
  );
  const result = scan(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /A\/pem/);
  assert.match(result.out, /B\/key-literal/);
  assert.match(result.out, /D\/mnemonic/);
});

test("the allowlist is narrow: a key-shaped line elsewhere is still a finding", () => {
  const dir = canaryDir();
  const key = `0x${"cd".repeat(32)}`;
  writeFileSync(join(dir, "other.md"), `the private key material is ${key}\n`);
  const result = scan(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /C\/hex-key-shape/);
});
