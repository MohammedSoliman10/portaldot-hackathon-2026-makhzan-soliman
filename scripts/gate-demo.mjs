#!/usr/bin/env node
/**
 * StorageGate consumer demo. All logic lives in apps/makhzan/src/gateDemo.ts so the tests exercise
 * the same code.
 *
 *   default: LOCAL. Spawn anvil first (chain id 420420777), then this deploys Makhzan and the gate,
 *   runs the full flow and mines the blocks it needs.
 *
 *   live: needs --live, --makhzan, --gate, MAKHZAN_NETWORK=live, both keys in the environment, and a
 *   dry run of the same plan first (--dry-run writes the marker the live run checks).
 *
 * Keys are read from the environment only: never on argv, never printed.
 */
import { main } from "../apps/makhzan/src/gateDemo.ts";

process.exitCode = await main(process.argv.slice(2), process.env, (line) => console.log(line));
