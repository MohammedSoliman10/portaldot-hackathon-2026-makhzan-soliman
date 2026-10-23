import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildBundle,
  deriveViews,
  publishBundle,
  validateBundle,
  writeReceipt,
} from "../src/evidence.ts";

const fixtureUrl = new URL("./fixtures/fixture-local-anvil.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8")) as Record<string, any>;

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "makhzan-evidence-"));
}

test("the feature 003 fixture is accepted as makhzan.evidence/v0", () => {
  assert.deepEqual(validateBundle(fixture), []);
  assert.equal(buildBundle(fixture).schema, "makhzan.evidence/v0");
});

test("the schema rejects every documented failure case", () => {
  const cases: Array<[string, (b: Record<string, any>) => void, RegExp]> = [
    ["unknown schema", (b) => { b.schema = "makhzan.evidence/v1"; }, /schema/],
    ["wrong label", (b) => { b.label = "MEASURED"; }, /REPORTED/],
    ["generatedAt without Z", (b) => { b.generatedAt = "2026-10-23T08:21:15.123Z"; }, /generatedAt/],
    ["extra top-level key", (b) => { b.extra = 1; }, /unknown key/],
    ["bad address", (b) => { b.providers[0].address = "0x1234"; }, /address/],
    ["slot0 disagrees with config", (b) => { b.config.challengeWindowBlocks = 11; }, /slot0/],
    ["dangling providerId", (b) => { b.deals[0].providerId = 9; }, /provider 9/],
    ["round reference to a foreign deal", (b) => { b.deals[0].roundIds = [2]; }, /roundIds/],
    ["duplicate deal id", (b) => { b.deals[1].id = b.deals[0].id; }, /duplicate/],
    ["failed round slash arithmetic", (b) => {
      b.rounds[1].slashUnits = "1";
      b.rounds[1].ownerCreditWei = "10000";
    }, /slash/],
    ["failed round owner credit", (b) => { b.rounds[1].ownerCreditWei = "1"; }, /ownerCreditWei/],
    ["passed round with a slash", (b) => { b.rounds[0].slashUnits = "1"; }, /passed/],
    ["leading zero amount", (b) => { b.deals[0].priceUnits = "0100"; }, /leading zero/],
    ["unknown receipt state", (b) => { b.transactions[0].receipt = "maybe"; }, /receipt/],
    ["health out of range", (b) => { b.deals[0].health = 4; }, /health/],
    ["unknown custom error", (b) => { b.refusals[0].error = "Nope"; }, /custom error/],
    ["empty limits", (b) => { b.limits = []; }, /limits/],
    ["unverified source claimed", (b) => { b.deployment.codeVerified.sourceVerified = true; }, /sourceVerified/],
  ];
  for (const [name, mutate, expected] of cases) {
    const bundle = structuredClone(fixture);
    mutate(bundle);
    const issues = validateBundle(bundle);
    assert.ok(issues.length > 0, `${name} must be rejected`);
    assert.match(issues.join("; "), expected, name);
  }
});

test("a raw receipt is written as soon as it arrives, under receipts/<network>/<hash>.json", () => {
  const dir = tmp();
  const hash = `0x${"ab".repeat(32)}`;
  const path = writeReceipt(dir, {
    network: "local",
    action: "deploy",
    txHash: hash as `0x${string}`,
    utc: "2026-10-23T08:21:15Z",
    transaction: { hash, nonce: 0, to: null, value: "0x0", input: "0x60" },
    receipt: { status: "success", blockNumber: 1, gasUsed: "21000" },
  });
  assert.equal(path, join(dir, "receipts", "local", `${hash}.json`));
  const raw = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(raw.schema, "makhzan.receipt/v0");
  assert.equal(raw.network, "LOCAL");
  assert.equal(raw.txHash, hash);
  assert.equal(raw.transaction.hash, hash);
  assert.equal(raw.receipt.blockNumber, 1);
  assert.match(raw.writtenAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  rmSync(dir, { recursive: true, force: true });
});

test("addresses.json and txs.json are derived views over the raw receipts", () => {
  const dir = tmp();
  const hash = `0x${"cd".repeat(32)}`;
  writeReceipt(dir, {
    network: "local",
    action: "challenge",
    txHash: hash as `0x${string}`,
    utc: "2026-10-23T08:21:16Z",
    transaction: { hash, nonce: 1, to: "0x5FbDB2315678afecb367f032d93F642f64180aa3", value: "0x0", input: "0x" },
    receipt: { status: "success", blockNumber: 2, gasUsed: "50000" },
  });
  const views = deriveViews(dir, {
    network: "local",
    chainId: 420420777,
    generatedAt: "2026-10-23T08:21:17Z",
    deployments: [{ address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", txHash: hash, action: "deploy" }],
  });
  assert.deepEqual(views.addresses.entries.map((entry) => entry.address), [
    "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  ]);
  assert.equal(views.addresses.schema, "makhzan.evidence-index/v0");
  assert.equal(views.addresses.network, "LOCAL");
  assert.equal(views.addresses.derivedFrom, "evidence/receipts");
  assert.equal(views.txs.entries.length, 1);
  assert.equal(views.txs.entries[0].hash, hash);
  assert.equal(views.txs.entries[0].action, "challenge");
  assert.equal(views.txs.entries[0].network, "LOCAL");
  assert.equal(existsSync(join(dir, "addresses.json")), true);
  assert.equal(existsSync(join(dir, "txs.json")), true);
  rmSync(dir, { recursive: true, force: true });
});

test("publishing a bundle is additive and the index carries the sha256 of the exact bytes", () => {
  const dir = tmp();
  const bundle = buildBundle({ ...fixture, id: "local-anvil-a" });
  const first = publishBundle(dir, bundle);
  const bytes = readFileSync(first.file);
  const digest = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  assert.equal(first.index.files[0].sha256, digest);
  assert.equal(first.index.schema, "makhzan.evidence-index/v0");
  assert.equal(first.index.current, "local-anvil-a");
  assert.equal(first.index.files[0].environment, "anvil-local");

  const second = publishBundle(dir, buildBundle({ ...fixture, id: "local-anvil-b" }));
  assert.equal(second.index.current, "local-anvil-b");
  assert.deepEqual(second.index.files.map((file: { id: string }) => file.id), [
    "local-anvil-a",
    "local-anvil-b",
  ]);
  assert.equal(existsSync(join(dir, "local-anvil-a.json")), true, "an old evidence file is never edited");
  rmSync(dir, { recursive: true, force: true });
});
