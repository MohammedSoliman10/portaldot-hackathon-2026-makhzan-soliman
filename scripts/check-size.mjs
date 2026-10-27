#!/usr/bin/env node
/**
 * Enforces contracts/size-budget.json against the deployed bytecode of every budgeted contract.
 *
 * Measures the runtime length of `deployedBytecode.object` in each artifact and exits non-zero when
 * any contract exceeds its budget. No text parsing of `forge build --sizes`, so CI and the plan read
 * the same number. Makhzan's budget is the 10,240 B ceiling from the spec; StorageGate's 2,600 B is
 * the consumer demo's own ceiling (measured 2,528 B).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Each entry: what to measure, where it is, and which budget key it answers to. */
export const CONTRACTS = [
  {
    name: "Makhzan",
    artifact: "contracts/out/Makhzan.sol/Makhzan.json",
    budgetKey: "runtimeBytes",
  },
  {
    name: "StorageGate",
    artifact: "contracts/out/StorageGate.sol/StorageGate.json",
    budgetKey: "gateRuntimeBytes",
  },
];

/**
 * Pure check: `measured` is `[{ name, runtimeBytes }]`, `budget` is the parsed budget file.
 * Returns `{ ok, lines }`; a missing or non-integer budget is a failure, never a pass.
 */
export function checkSizes(measured, budget) {
  const lines = [];
  let ok = true;
  for (const { name, runtimeBytes, budgetKey } of measured) {
    const limit = budget?.[budgetKey];
    if (!Number.isInteger(limit) || limit <= 0) {
      ok = false;
      lines.push(`${name}: budget ${budgetKey} must be a positive integer (got ${JSON.stringify(limit ?? null)})`);
      continue;
    }
    const margin = limit - runtimeBytes;
    if (margin < 0) {
      ok = false;
      lines.push(`${name} runtime ${runtimeBytes} B > budget ${limit} B (overrun ${-margin} B)`);
    } else {
      lines.push(`${name} runtime ${runtimeBytes} B <= budget ${limit} B (margin ${margin} B)`);
    }
  }
  return { ok, lines };
}

/** Reads one artifact and returns its runtime byte length, or throws with the reason. */
export function measureRuntime(path) {
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`cannot read ${path}: ${err.message} (run forge build first)`);
  }
  const deployed = artifact?.deployedBytecode?.object;
  if (typeof deployed !== "string" || deployed.length === 0) {
    throw new Error(`${path} has no deployedBytecode.object`);
  }
  const hex = deployed.startsWith("0x") ? deployed.slice(2) : deployed;
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error(`${path} deployedBytecode.object is not even-length hex`);
  }
  return hex.length / 2;
}

function main() {
  let budget;
  try {
    budget = JSON.parse(readFileSync(join(repoRoot, "contracts/size-budget.json"), "utf8"));
  } catch (err) {
    console.error(`cannot read contracts/size-budget.json: ${err.message}`);
    process.exit(1);
  }

  const measured = [];
  for (const contract of CONTRACTS) {
    const path = join(repoRoot, contract.artifact);
    try {
      measured.push({ ...contract, runtimeBytes: measureRuntime(path) });
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  const { ok, lines } = checkSizes(measured, budget);
  for (const line of lines) console.log(line);
  if (!ok) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
