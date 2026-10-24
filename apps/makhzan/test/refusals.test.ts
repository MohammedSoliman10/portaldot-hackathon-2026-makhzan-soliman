import { strict as assert } from "node:assert";
import { test } from "node:test";
import { encodeErrorResult } from "viem";
import { ERROR_ABI, runRefusals } from "../src/refusals.ts";

const ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

test("a refused eth_call is decoded to its custom error, never to a revert string", async () => {
  const cases = [
    { id: "wrong-proof", attempted: "answer(1, bad path)", data: "0x11", error: "ProofRejected" },
    { id: "wrong-length", attempted: "answer(1, short data)", data: "0x22", error: "BadParams" },
    { id: "late-answer", attempted: "answer(1) after the deadline", data: "0x33", error: "WindowOpen" },
    { id: "non-owner", attempted: "challenge(1) by a stranger", data: "0x44", error: "NotOwner" },
    { id: "settled", attempted: "challenge(2) on a settled deal", data: "0x55", error: "AlreadySettled" },
    { id: "non-multiple", attempted: "registerProvider() with 1 wei", data: "0x66", error: "BondTooSmall" },
  ];
  const result = await runRefusals(
    cases.map((item) => ({ id: item.id, attempted: item.attempted, call: { to: ADDRESS, data: item.data } })),
    {
      network: "local",
      chainId: 420420777,
      utc: "2026-10-23T09:30:00Z",
      call: async (request) => {
        const item = cases.find((candidate) => candidate.data === request.data)!;
        return { ok: false, data: encodeErrorResult({ abi: ERROR_ABI, errorName: item.error as never }) as `0x${string}` };
      },
      decodeError: (data) => {
        const decoded = decode(data);
        return decoded;
      },
    },
  );
  assert.equal(result.schema, "makhzan.refusals/v0");
  assert.equal(result.network, "LOCAL");
  assert.equal(result.entries.length, 6);
  assert.deepEqual(result.entries.map((entry) => entry.error), [
    "ProofRejected", "BadParams", "WindowOpen", "NotOwner", "AlreadySettled", "BondTooSmall",
  ]);
  assert.match(String(result.entries[0].reason), /merkle path/i);
  assert.equal(result.entries[2].source, "eth_call");
});

function decode(data: string): string {
  for (const name of [
    "ProofRejected", "BadParams", "WindowOpen", "NotOwner", "AlreadySettled", "BondTooSmall",
  ]) {
    if (data.toLowerCase().startsWith(("0x" + encodeErrorResult({ abi: ERROR_ABI, errorName: name as never }).slice(2, 10)).toLowerCase())) {
      return name;
    }
  }
  return "unknown";
}

test("an unexpected revert is recorded as unknown, not dropped", async () => {
  const result = await runRefusals(
    [{ id: "x", attempted: "call()", call: { to: ADDRESS, data: "0x" } }],
    {
      network: "live",
      chainId: 1,
      utc: "2026-10-23T09:30:00Z",
      call: async () => ({ ok: false, data: "0xdeadbeef" }),
      decodeError: () => null,
    },
  );
  assert.equal(result.entries[0].error, "unknown");
  assert.match(String(result.entries[0].reason), /could not decode/);
  assert.equal(result.network, "LIVE");
});

test("a call that unexpectedly succeeds is a refusal-test failure, not a recorded success", async () => {
  await assert.rejects(
    runRefusals(
      [{ id: "x", attempted: "challenge(1)", call: { to: ADDRESS, data: "0x" } }],
      {
        network: "local", chainId: 420420777, utc: "2026-10-23T09:30:00Z",
        call: async () => ({ ok: true, data: "0x" }),
        decodeError: () => null,
      },
    ),
    /unexpectedly succeeded/,
  );
});
