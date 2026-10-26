#!/usr/bin/env node
/**
 * Writes the deterministic 8 KiB sample: 8,192 bytes of 0x5a.
 *
 * Eight identical 1 KiB blocks give the committed 8 KiB root, so the golden-vector check has a file
 * to read. Deterministic: running this twice changes nothing.
 *
 * The 1 MiB file the deals committed (`public/samples/demo-1mib.bin`) is deliberately not written
 * here: it was created with `dd if=/dev/urandom`, so no seed reproduces it. `check-sample.mjs` pins
 * its bytes, sha256 and root instead.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const samplePath = join(appRoot, "public/samples/demo-8k.bin");

mkdirSync(dirname(samplePath), { recursive: true });
writeFileSync(samplePath, Buffer.alloc(8192, 0x5a));
console.log(`wrote ${samplePath} (8192 bytes of 0x5a)`);
