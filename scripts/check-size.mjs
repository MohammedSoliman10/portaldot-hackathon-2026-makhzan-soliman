#!/usr/bin/env node
/**
 * Enforces contracts/size-budget.json against the deployed Makhzan bytecode.
 *
 * Reads contracts/out/Makhzan.sol/Makhzan.json, measures the runtime length of
 * `deployedBytecode.object` and exits non-zero when it exceeds the budget. No text parsing of
 * `forge build --sizes`, so CI and the plan read the same number.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = join(repoRoot, "contracts/out/Makhzan.sol/Makhzan.json");
const budgetPath = join(repoRoot, "contracts/size-budget.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

let artifact;
try {
  artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
} catch (err) {
  fail(`cannot read ${artifactPath}: ${err.message} (run forge build first)`);
}

let budget;
try {
  budget = JSON.parse(readFileSync(budgetPath, "utf8"));
} catch (err) {
  fail(`cannot read ${budgetPath}: ${err.message}`);
}

const deployed = artifact?.deployedBytecode?.object;
if (typeof deployed !== "string" || deployed.length === 0) {
  fail(`${artifactPath} has no deployedBytecode.object`);
}
const hex = deployed.startsWith("0x") ? deployed.slice(2) : deployed;
if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
  fail(`${artifactPath} deployedBytecode.object is not even-length hex`);
}
const runtimeBytes = hex.length / 2;

const limit = budget?.runtimeBytes;
if (!Number.isInteger(limit) || limit <= 0) {
  fail(`${budgetPath} needs a positive integer runtimeBytes`);
}

const margin = limit - runtimeBytes;
if (runtimeBytes > limit) {
  fail(`Makhzan runtime ${runtimeBytes} B > budget ${limit} B (overrun ${-margin} B)`);
}
console.log(`Makhzan runtime ${runtimeBytes} B <= budget ${limit} B (margin ${margin} B)`);
