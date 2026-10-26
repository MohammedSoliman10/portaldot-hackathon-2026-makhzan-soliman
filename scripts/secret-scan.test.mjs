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
import { scanText } from "./secret-scan.mjs";

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

/**
 * The history scan imports `scanText`, so these two assertions pin the shared rule set: one blob with
 * all three shapes is flagged on the same lines the tree scan reports, and a `.test.ts` path keeps the
 * deliberate fixture exemption.
 */
test("scanText returns rule and line for each shape, without the tree walk", () => {
  const key = `0x${"ab".repeat(32)}`;
  const phrase = Array(12).fill("alpha").join(" ");
  const text = `${"-----BEGIN"} RSA PRIVATE KEY-----\nsome key material ${key}\nphrase = "${phrase}"\n`;
  const findings = scanText("evidence/example.txt", text);
  assert.deepEqual(
    findings.map((finding) => [finding.rule, finding.line]),
    [
      ["A/pem", 1],
      ["C/hex-key-shape", 2],
      ["D/mnemonic", 3],
    ],
  );
});

test("scanText reports a literal key assignment on its own", () => {
  const key = `0x${"ab".repeat(32)}`;
  assert.deepEqual(
    scanText("evidence/example.txt", `PRIVATE_KEY=${key}\n`).map((finding) => [finding.rule, finding.line]),
    [["B/key-literal", 1]],
  );
});

test("scanText keeps the test-file exemption used by the tree scan", () => {
  const key = `0x${"ab".repeat(32)}`;
  assert.deepEqual(scanText("apps/makhzan/test/guards.test.ts", `PRIVATE_KEY=${key}\n`), []);
});
