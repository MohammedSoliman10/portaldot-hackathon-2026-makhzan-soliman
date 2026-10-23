import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { calibrationLine } from "../src/deploy.ts";

function tempFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-calibration-"));
  const file = join(dir, "calibration.json");
  writeFileSync(file, content);
  return file;
}

test("without a calibration file the dry-run says it is not verified", () => {
  assert.equal(calibrationLine("/nonexistent/calibration.json"), "calibration: not yet verified against a live probe");
});

test("a measured ratio is printed with its source", () => {
  const file = tempFile(JSON.stringify({ ratio: 1.05, measuredAt: "2026-01-01T00:00:00Z" }));
  assert.equal(calibrationLine(file), `calibration: measured ratio 1.05 (source: ${file})`);
  rmSync(file, { force: true });
});

test("a calibration file without a positive ratio is not trusted", () => {
  for (const content of ["{}", '{"ratio":0}', '{"ratio":-1}', '{"ratio":"1.05"}', "not json"]) {
    const file = tempFile(content);
    assert.match(calibrationLine(file), /not yet verified/, content);
    rmSync(file, { force: true });
  }
});

test("a ratio of exactly 1 is accepted", () => {
  const file = tempFile('{"ratio":1}');
  assert.match(calibrationLine(file), /measured ratio 1 /);
  rmSync(file, { force: true });
});
