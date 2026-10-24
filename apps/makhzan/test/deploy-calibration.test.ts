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

test("the Tier 0 calibration shape is read from makhzan_projection.measured_ratio", () => {
  const file = tempFile(JSON.stringify({
    at: "2026-10-23T08:13:31Z",
    entries: [],
    makhzan_projection: { measured_ratio: 0.984608251872, runtime_bytes: 6566 },
  }));
  assert.equal(calibrationLine(file), `calibration: measured ratio 0.984608251872 (source: ${file})`);
  rmSync(file, { force: true });
});

test("without the projection, the last measured deploy entry is used", () => {
  const file = tempFile(JSON.stringify({
    entries: [
      { kind: "deploy", ratio: 0.98 },
      { kind: "call", ratio: 0.99 },
      { kind: "deploy", ratio: 0.984608251872 },
    ],
  }));
  assert.equal(calibrationLine(file), `calibration: measured ratio 0.984608251872 (source: ${file})`);
  rmSync(file, { force: true });
});

test("a Tier 0 file with a non-positive or missing measured ratio is still not verified", () => {
  for (const content of [
    '{"makhzan_projection":{"measured_ratio":0}}',
    '{"entries":[{"kind":"deploy","ratio":"0.98"}]}',
    '{"entries":[]}',
  ]) {
    const file = tempFile(content);
    assert.match(calibrationLine(file), /not yet verified/, content);
    rmSync(file, { force: true });
  }
});
