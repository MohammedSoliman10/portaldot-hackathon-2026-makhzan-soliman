import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Hex } from "viem";
import { logsToDealLogs, parseVerifyArgv } from "../src/dealVerifyCli.ts";

const OPENED = "0x2e007e45faa9a337c7a4c45543c666af9e901230f5916915e0d7c2ae47dce422";
const PASSED = "0x5ed18d101097532e8c33c11f8004b21d2c8eb7771ff6ecf2c605dbc7a39c46b1";
const FAILED = "0xf738011fb0feedc45d5aff88ca0dd89f08322a377bf442485e283430cbec4353";

const topic = (value: number) => `0x${value.toString(16).padStart(64, "0")}` as Hex;

function raw(topics: Hex[], data: Hex, block: number, tx: Hex) {
  return {
    address: "0x60481DFcFCA34A8F095939D9675eC715127B2e44" as Hex,
    topics,
    data,
    blockNumber: `0x${block.toString(16)}` as Hex,
    transactionHash: tx,
  };
}

const TX = `0x${"ab".repeat(32)}` as Hex;

test("verify takes exactly one positive uint32 deal id and refuses a key on argv", () => {
  assert.equal(parseVerifyArgv(["1"]), 1);
  assert.equal(parseVerifyArgv(["4294967295"]), 4_294_967_295);
  assert.throws(() => parseVerifyArgv([]), /usage: makhzan verify <dealId>/);
  assert.throws(() => parseVerifyArgv(["1", "2"]), /unexpected argument '2'/);
  assert.throws(() => parseVerifyArgv(["one"]), /dealId must be an integer/);
  assert.throws(() => parseVerifyArgv(["0"]), /positive/);
  assert.throws(() => parseVerifyArgv(["4294967296"]), /uint32/);
  assert.throws(() => parseVerifyArgv(["1", "--private-key", "0x11"]), /never pass a private key on argv/);
});

test("logs decode by selector and keep only the requested deal", () => {
  const logs = logsToDealLogs(
    [
      raw(
        [OPENED, topic(2)],
        `0x${"1d".padStart(64, "0")}${"2a25a".padStart(64, "0")}` as Hex,
        172584,
        TX,
      ),
      raw([PASSED, topic(2)], "0x", 172585, TX),
      raw(
        [FAILED, topic(2)],
        `0x${(600_000_000_000_000n).toString(16).padStart(64, "0")}` as Hex,
        172658,
        TX,
      ),
      raw([PASSED, topic(1)], "0x", 172295, TX),
      raw([`0x${"00".repeat(32)}` as Hex, topic(2)], "0x", 172700, TX),
    ],
    2,
  );
  assert.deepEqual(
    logs.map((log) => [log.kind, log.block, log.index ?? null, log.slash?.toString() ?? null]),
    [
      ["opened", 172584, 29, null],
      ["passed", 172585, null, null],
      ["failed", 172658, null, "600000000000000"],
    ],
  );
  assert.equal(logs[0].deadline, 172634);
});

test("a log from a different deal is ignored even with the same selector", () => {
  const logs = logsToDealLogs([raw([OPENED, topic(1)], "0x", 172281, TX)], 2);
  assert.deepEqual(logs, []);
});
