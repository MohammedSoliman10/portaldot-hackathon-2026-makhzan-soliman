import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CONTRACTS, checkSizes, measureRuntime } from "./check-size.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const budget = JSON.parse(readFileSync(join(repoRoot, "contracts/size-budget.json"), "utf8"));
const measured = {
  Makhzan: 6_566,
  StorageGate: 2_528,
};

test("both contracts are inside their budgets", () => {
  const { ok, lines } = checkSizes(
    CONTRACTS.map((c) => ({ ...c, runtimeBytes: measured[c.name] })),
    budget,
  );
  assert.equal(ok, true, lines.join("\n"));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Makhzan runtime 6566 B <= budget 10240 B \(margin 3674 B\)$/);
  assert.match(lines[1], /^StorageGate runtime 2528 B <= budget 2600 B \(margin 72 B\)$/);
});

test("one byte of gate overrun fails and names StorageGate", () => {
  const { ok, lines } = checkSizes(
    CONTRACTS.map((c) => ({ ...c, runtimeBytes: c.name === "StorageGate" ? 2_601 : measured[c.name] })),
    budget,
  );
  assert.equal(ok, false);
  assert.match(lines[1], /^StorageGate runtime 2601 B > budget 2600 B \(overrun 1 B\)$/);
});

test("the Makhzan overrun still fails and names Makhzan", () => {
  const { ok, lines } = checkSizes(
    CONTRACTS.map((c) => ({ ...c, runtimeBytes: c.name === "Makhzan" ? 10_241 : measured[c.name] })),
    budget,
  );
  assert.equal(ok, false);
  assert.match(lines[0], /^Makhzan runtime 10241 B > budget 10240 B \(overrun 1 B\)$/);
});

test("the budget boundary itself passes", () => {
  const { ok } = checkSizes(
    CONTRACTS.map((c) => ({ ...c, runtimeBytes: budget[c.budgetKey] })),
    budget,
  );
  assert.equal(ok, true);
});

test("a missing or nonsensical gate budget is a failure, not a pass", () => {
  for (const value of [undefined, 0, -1, "2600", 2600.5]) {
    const withoutGate = { ...budget, gateRuntimeBytes: value };
    const { ok, lines } = checkSizes(
      CONTRACTS.map((c) => ({ ...c, runtimeBytes: measured[c.name] })),
      withoutGate,
    );
    assert.equal(ok, false, `gateRuntimeBytes=${JSON.stringify(value)} must fail`);
    assert.match(lines[1], /StorageGate: budget gateRuntimeBytes must be a positive integer/);
  }
});

test("the real artifacts are the sizes the budget was set against", () => {
  for (const contract of CONTRACTS) {
    const bytes = measureRuntime(join(repoRoot, contract.artifact));
    assert.equal(bytes, measured[contract.name], `${contract.name} artifact changed; re-check the budget`);
  }
});
