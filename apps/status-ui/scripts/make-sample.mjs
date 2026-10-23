#!/usr/bin/env node
/**
 * Writes the deterministic 8 KiB sample: 8,192 bytes of 0x5a.
 *
 * Eight identical 1 KiB blocks give the committed root shared with deal 1, so a judge with no file
 * can still exercise the verifier end to end. Deterministic: running this twice changes nothing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const samplePath = join(appRoot, "public/samples/demo-8k.bin");

mkdirSync(dirname(samplePath), { recursive: true });
writeFileSync(samplePath, Buffer.alloc(8192, 0x5a));
console.log(`wrote ${samplePath} (8192 bytes of 0x5a)`);
