#!/usr/bin/env node
/**
 * Build guard for the evidence layer.
 *
 * The manifest must name an existing current file, its SHA-256 must equal the hash of the exact bytes
 * on disk, and the bundle must pass the same strict validator the app uses at runtime
 * (`src/data/schema.ts::parseEvidence`). Offline: no RPC, no key.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEvidence, parseManifest } from "../src/data/schema.ts";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(appRoot, "public/evidence");

try {
  const manifest = parseManifest(JSON.parse(readFileSync(join(evidenceDir, "index.json"), "utf8")));
  const entry = manifest.files.find((file) => file.id === manifest.current);
  if (!entry) throw new Error("manifest current id is not listed");

  const bytes = readFileSync(join(evidenceDir, `${entry.id}.json`));
  const digest = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  if (digest !== entry.sha256) {
    throw new Error(`evidence hash mismatch: manifest ${entry.sha256}, file ${digest}`);
  }

  const bundle = parseEvidence(JSON.parse(bytes.toString("utf8")));
  if (bundle.id !== entry.id) throw new Error("bundle id does not match the manifest entry");
  if (bundle.environment !== entry.environment) throw new Error("bundle environment does not match the manifest");

  console.log(`evidence OK: ${entry.id} (sha256 ${entry.sha256})`);
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
