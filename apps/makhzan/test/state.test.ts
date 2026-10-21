import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { blockPathFor, derivePaths, emptyState, readState, writeState } from "../src/state.ts";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "makhzan-state-"));
}

const ROOT = "0xabc0000000000000000000000000000000000000000000000000000000000001";

test("an atomic write leaves no partial file and round-trips", () => {
  const dir = scratch();
  const file = join(dir, "state.json");
  const state = emptyState(420420777, 1);
  state.files[ROOT] = { size: 2048, leafCount: 2, path: ".state/files/" + ROOT };
  writeState(file, state);

  assert.deepEqual(readdirSync(dir), ["state.json"], "no temp file survives the write");
  const read = readState(file);
  assert.equal(read.created, false);
  assert.deepEqual(read.state, state);
  rmSync(dir, { recursive: true, force: true });
});

test("a failed write leaves the previous file intact", () => {
  const dir = scratch();
  const file = join(dir, "state.json");
  writeState(file, emptyState(420420777, 1));
  const before = readFileSync(file, "utf8");
  const bad = emptyState(420420777, 1) as unknown as { lastBlock: bigint };
  bad.lastBlock = 1n; // JSON cannot encode a bigint: the encode fails before any rename
  assert.throws(() => writeState(file, bad as never));
  assert.equal(readFileSync(file, "utf8"), before, "the committed state is untouched");
  rmSync(dir, { recursive: true, force: true });
});

test("a corrupt state file is reported and never replaced", () => {
  const dir = scratch();
  const file = join(dir, "state.json");
  writeFileSync(file, "{not json");
  assert.throws(() => readState(file), /corrupt/i);
  assert.equal(readFileSync(file, "utf8"), "{not json", "the corrupt file is left for inspection");
  rmSync(dir, { recursive: true, force: true });
});

test("a missing file is an empty state that can be rebuilt", () => {
  const dir = scratch();
  const { state, created } = readState(join(dir, "state.json"));
  assert.equal(created, true);
  assert.deepEqual(state, emptyState(0, 0));
  rmSync(dir, { recursive: true, force: true });
});

test("a restart re-derives block paths from the stored tree", () => {
  const dir = scratch();
  const file = join(dir, "state.json");
  const state = emptyState(420420777, 1);
  state.files[ROOT] = { size: 2048, leafCount: 2, path: ".state/files/" + ROOT };
  state.files["0xdead"] = { size: 1024, leafCount: 1, path: ".state/files/0xdead" };
  for (const index of [0, 1]) {
    const p = blockPathFor(file, ROOT, index);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, Buffer.from([index]));
  }
  writeState(file, state);

  const derived = derivePaths(state, file);
  assert.deepEqual(derived.available, [ROOT], "only the complete file is available");
  assert.deepEqual(derived.unavailable, ["0xdead"], "the file with no blocks is reported missing");
  rmSync(dir, { recursive: true, force: true });
});
