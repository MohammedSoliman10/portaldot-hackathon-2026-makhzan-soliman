import { test } from "node:test";
import assert from "node:assert/strict";
import { isPvmBlob, pvmBlobHex } from "../src/lib/pvm.ts";

test("isPvmBlob accepts the PVM magic 0x50564d00", () => {
  assert.equal(isPvmBlob("0x50564d00010203"), true);
});

test("isPvmBlob rejects EVM bytecode", () => {
  assert.equal(isPvmBlob("0x6080604052"), false);
});

test("isPvmBlob rejects odd-length and non-hex input", () => {
  assert.equal(isPvmBlob("0x50564d0"), false);
  assert.equal(isPvmBlob("0xzz"), false);
});

test("pvmBlobHex encodes bytes with a 0x prefix", () => {
  assert.equal(pvmBlobHex(new Uint8Array([0x50, 0x56, 0x4d, 0x00])), "0x50564d00");
});
