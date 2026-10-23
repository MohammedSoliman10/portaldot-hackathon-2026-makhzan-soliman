#!/usr/bin/env node
/**
 * Build guard for the evidence layer.
 *
 * 1. The manifest must name an existing current file.
 * 2. The manifest SHA-256 must equal the hash of the exact bytes on disk.
 * 3. The bundle must satisfy the structural rules of `makhzan.evidence/v0` that a build must not
 *    ship without: version, exact top-level keys, address/hash lengths, packed slot 0 agreement,
 *    cross-references and duplicate ids.
 *
 * Runtime validation is `src/data/schema.ts::parseEvidence`; this script is the build-time gate and
 * is intentionally offline. It never prints or needs a key.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(appRoot, "public/evidence");

const problems = [];
const fail = (message) => problems.push(message);

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

const TOP_KEYS = [
  "schema", "id", "environment", "label", "generatedAt", "source", "chain", "timing",
  "deployment", "config", "providers", "deals", "rounds", "transactions", "refusals", "limits",
];

const manifestText = readFileSync(join(evidenceDir, "index.json"), "utf8");
const manifest = JSON.parse(manifestText);
if (manifest.schema !== "makhzan.evidence-index/v0") fail("unsupported manifest schema");
const entry = (manifest.files ?? []).find((file) => file.id === manifest.current);
if (!entry) fail("manifest current id is not listed in files");

if (entry) {
  const bytes = readFileSync(join(evidenceDir, `${entry.id}.json`));
  const digest = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  if (digest !== entry.sha256.toLowerCase()) {
    fail(`evidence hash mismatch: manifest ${entry.sha256}, file ${digest}`);
  }

  const bundle = JSON.parse(bytes.toString("utf8"));
  const keys = Object.keys(bundle).sort();
  if (bundle.schema !== "makhzan.evidence/v0") fail("bundle schema is not makhzan.evidence/v0");
  if (bundle.label !== "REPORTED") fail("bundle label must be REPORTED");
  if (keys.length !== TOP_KEYS.length || keys.some((key, index) => key !== [...TOP_KEYS].sort()[index])) {
    fail("bundle top-level keys differ from the schema");
  }
  if (!ADDRESS.test(bundle.deployment?.address ?? "")) fail("deployment address is not 0x + 40 hex");
  if (!HASH.test(bundle.deployment?.codeHash ?? "")) fail("deployment codeHash is not 0x + 64 hex");
  if (!HASH.test(bundle.deployment?.txHash ?? "")) fail("deployment txHash is not 0x + 64 hex");

  const slot0 = bundle.config?.slot0 ?? "";
  if (slot0.length !== 66) fail("config.slot0 must be 32 bytes");
  const decoded = decodeSlot0(slot0);
  const config = bundle.config ?? {};
  for (const [key, value] of Object.entries(decoded)) {
    if (String(value) !== String(config[key])) fail(`config.slot0 disagrees with config.${key}`);
  }

  const providerIds = new Set((bundle.providers ?? []).map((provider) => provider.id));
  for (const deal of bundle.deals ?? []) {
    if (!providerIds.has(deal.providerId)) fail(`deal ${deal.id} references a missing provider`);
    for (const roundId of deal.roundIds ?? []) {
      const round = (bundle.rounds ?? []).find((item) => item.id === roundId);
      if (!round) fail(`deal ${deal.id} references a missing round ${roundId}`);
      else if (round.dealId !== deal.id) fail(`round ${roundId} belongs to another deal`);
    }
  }

  for (const round of bundle.rounds ?? []) {
    for (const key of ["bondBeforeUnits", "bondAfterUnits", "slashUnits", "ownerCreditWei"]) {
      if (!DECIMAL.test(round[key] ?? "")) fail(`round ${round.id} ${key} is not a decimal string`);
    }
    if (round.status === "passed") {
      if (round.bondBeforeUnits !== round.bondAfterUnits || round.slashUnits !== "0") {
        fail(`round ${round.id} is passed with a bond change`);
      }
    }
    if (round.status === "failed") {
      const before = BigInt(round.bondBeforeUnits);
      const slash = BigInt(round.slashUnits);
      if (slash <= 0n || before - slash !== BigInt(round.bondAfterUnits)) {
        fail(`round ${round.id} slash arithmetic does not balance`);
      }
      if (BigInt(round.ownerCreditWei) !== slash * 10000n) {
        fail(`round ${round.id} owner credit is not slash * 10000`);
      }
    }
  }

  const ids = [
    ...(bundle.providers ?? []).map((item) => `provider:${item.id}`),
    ...(bundle.deals ?? []).map((item) => `deal:${item.id}`),
    ...(bundle.rounds ?? []).map((item) => `round:${item.id}`),
    ...(bundle.transactions ?? []).map((item) => `tx:${item.id}`),
    ...(bundle.refusals ?? []).map((item) => `refusal:${item.id}`),
  ];
  if (new Set(ids).size !== ids.length) fail("duplicate ids in the bundle");
}

function decodeSlot0(hex) {
  const raw = hex.slice(2);
  const bytes = Uint8Array.from(raw.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  if (bytes.length !== 32) throw new Error("slot0 must be 32 bytes");
  // Solidity packs from the least-significant end, so the first declared field sits in the last
  // bytes of the word. Two leading bytes are padding.
  const at = (start, length) =>
    bytes
      .subarray(start, start + length)
      .reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  return {
    challengeWindowBlocks: Number(at(28, 4)),
    challengeBlockSize: Number(at(26, 2)),
    slashBps: Number(at(24, 2)),
    minBondUnits: at(16, 8).toString(),
    nextDealId: Number(at(12, 4)),
    providerCount: Number(at(10, 2)),
    minDurationBlocks: Number(at(6, 4)),
    maxDurationBlocks: Number(at(2, 4)),
  };
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log(`evidence OK: ${manifest.current} (sha256 ${entry.sha256})`);
