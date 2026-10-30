import { strict as assert } from "node:assert";
import { test } from "node:test";
import { encodeFunctionData, type Hex } from "viem";
import { runCommand } from "../src/cliMain.ts";
import type { CommandDeps } from "../src/cli.ts";

const CONTRACT = "0x" + "22".repeat(20) as Hex;
const HASH = "0x" + "33".repeat(32) as Hex;
const BLOCKHASH = "0x" + "44".repeat(32) as Hex;

function deps(): CommandDeps & { sent: { data: Hex }[] } {
  const sent: { data: Hex }[] = [];
  return {
    contract: CONTRACT,
    sent,
    chain: {
      async estimateGas() { return 100_000n; },
      async gasPrice() { return 1_000_000_000n; },
      async nonce() { return 7; },
      async send(tx) { sent.push({ data: tx.data }); return HASH; },
      async receipt() { return { status: "success", blockNumber: 12n, blockHash: BLOCKHASH }; },
      async waitForFinality() { return { kind: "tag", tag: "finalized" }; },
      async read() { return { dealId: 1, resolved: true }; },
      async pollDeal() { return true; },
    },
  };
}

test("resolve sends resolve(dealId) and returns a five-state record", async () => {
  const d = deps();
  const lines: string[] = [];
  const code = await runCommand(["resolve", "9"], d, (line) => lines.push(line));
  assert.equal(code, 0);
  const expected = encodeFunctionData({
    abi: [{ type: "function", name: "resolve", stateMutability: "nonpayable", inputs: [{ name: "dealId", type: "uint32" }], outputs: [] }],
    functionName: "resolve",
    args: [9],
  });
  assert.equal(d.sent[0].data, expected);
  const record = JSON.parse(lines.join("\n"));
  assert.equal(record.submitted.hash, HASH);
  assert.equal(record.included.blockNumber, "12");
  assert.equal(record.executed.status, "success");
  assert.equal(record.finalized.kind, "tag");
  assert.deepEqual(record.readBack, { dealId: 1, resolved: true });
});

test("a key on argv is refused before anything is built", async () => {
  const lines: string[] = [];
  const code = await runCommand(["claim", "1", "--private-key", "0x" + "11".repeat(32)], deps(), (line) => lines.push(line));
  assert.equal(code, 1);
  assert.match(lines.join("\n"), /never pass a private key on argv/);
});

test("an unknown command is refused with the documented list", async () => {
  const lines: string[] = [];
  const code = await runCommand(["frobnicate"], deps(), (line) => lines.push(line));
  assert.equal(code, 1);
  assert.match(lines.join("\n"), /unknown command 'frobnicate'/);
});

test("watch polls the deal and reports the read-back", async () => {
  const lines: string[] = [];
  const code = await runCommand(["watch", "3"], deps(), (line) => lines.push(line));
  assert.equal(code, 0);
  const record = JSON.parse(lines.join("\n"));
  assert.deepEqual(record.readBack, { dealId: 1, resolved: true });
});

test("main dispatches gate commands through runGate", async () => {
  const { main } = await import("../src/cliMain.ts");
  const lines: string[] = [];
  // gate with key on argv must fail
  const codeKey = await main(["gate", "status", "3", "--key", "0x" + "11".repeat(32)], {}, (l) => lines.push(l));
  assert.equal(codeKey, 1);
  assert.match(lines.join("\n"), /never pass a private key on argv/);
});
