#!/usr/bin/env node
/**
 * Deploy StorageGate. Same tooling, pending record and record format as `deploy.mjs`, with
 * `--contract gate` preselected: the only extra argument is the Makhzan address it points at.
 *
 * Network and key come from the environment (MAKHZAN_NETWORK, MAKHZAN_RPC_URL, MAKHZAN_CHAIN_ID,
 * MAKHZAN_PRIVATE_KEY). No key is ever accepted on argv or printed.
 *
 * usage: node scripts/deploy-gate.mjs --makhzan 0x... [--dry-run] [--out file] [--resume hash]
 */
import { main } from "../apps/makhzan/src/deploy.ts";

process.exitCode = await main(["--contract", "gate", ...process.argv.slice(2)], process.env, (line) =>
  console.log(line),
);
