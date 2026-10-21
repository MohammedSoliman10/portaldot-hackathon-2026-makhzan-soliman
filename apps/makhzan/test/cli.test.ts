import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execute, parseCommand, type CommandDeps, type TxRequest } from "../src/cli.ts";

const ROOT = "0xabc0000000000000000000000000000000000000000000000000000000000001" as const;
const CONTRACT = "0x00000000000000000000000000000000000000c0" as const;
const HASH = "0x00000000000000000000000000000000000000000000000000000000000000aa" as const;
const BLOCK = "0x00000000000000000000000000000000000000000000000000000000000000bb" as const;

function harness(receipt: Partial<{ status: "success" | "reverted"; reason: string }> = {}) {
  const order: string[] = [];
  const sent: TxRequest[] = [];
  const deps: CommandDeps = {
    contract: CONTRACT,
    chain: {
      async estimateGas() {
        order.push("estimate");
        return 100_000n;
      },
      async gasPrice() {
        order.push("gasPrice");
        return 2_000_000_000n;
      },
      async send(tx) {
        order.push("send");
        sent.push(tx);
        return HASH;
      },
      async receipt() {
        order.push("receipt");
        return { status: receipt.status ?? "success", blockNumber: 1n, blockHash: BLOCK, reason: receipt.reason };
      },
      async waitForFinality() {
        order.push("finality");
        return { kind: "tag", tag: "finalized" } as const;
      },
      async read() {
        order.push("read");
        return { claimed: 5n ** 14n };
      },
      async pollDeal() {
        order.push("poll");
        return true;
      },
    },
    async uploader(file, providerId) {
      order.push(`upload:${file}:${providerId}`);
      return { root: ROOT, size: 2048, leafCount: 2 };
    },
    async reporter() {
      order.push("report");
      return "evidence/tier1-results.md";
    },
  };
  return { deps, order, sent };
}

test("each command parses its documented arguments", () => {
  assert.deepEqual(parseCommand(["upload", "file.bin", "--provider", "3"]), {
    name: "upload", file: "file.bin", providerId: 3,
  });
  const create = parseCommand([
    "create", "--root", ROOT, "--size", "2048", "--leaf-count", "2",
    "--provider", "1", "--duration", "100", "--price", "10",
  ]);
  assert.equal(create.name, "create");
  if (create.name !== "create") return;
  assert.equal(create.root, ROOT);
  assert.equal(create.units, 10n ** 15n, "10 tPOT is 1e15 units");
  assert.equal(create.value, 10n ** 19n, "msg.value = units * 10_000");
  for (const name of ["challenge", "watch", "claim", "settle"] as const) {
    assert.deepEqual(parseCommand([name, "7"]), { name, dealId: 7 });
  }
  assert.deepEqual(parseCommand(["report"]), { name: "report" });
});

test("missing, extra and unknown arguments are rejected", () => {
  assert.throws(() => parseCommand(["create", "--root", ROOT, "--size", "2048", "--leaf-count", "2", "--provider", "1", "--duration", "100"]), /missing --price/);
  assert.throws(() => parseCommand(["challenge"]), /missing <dealId>/);
  assert.throws(() => parseCommand(["challenge", "7", "9"]), /unexpected argument '9'/);
  assert.throws(() => parseCommand(["challenge", "7", "--foo", "1"]), /unexpected option '--foo'/);
  assert.throws(() => parseCommand(["frobnicate"]), /unknown command 'frobnicate'/);
});

test("invalid values are rejected before any transaction is built", () => {
  const base = ["create", "--root", ROOT, "--size", "2048", "--leaf-count", "2", "--provider", "1", "--duration", "100", "--price", "10"];
  const withArg = (name: string, value: string) => {
    const copy = [...base];
    copy[copy.indexOf(name) + 1] = value;
    return copy;
  };
  assert.throws(() => parseCommand(withArg("--root", "0x1234")), /root must be 32 bytes/);
  assert.throws(() => parseCommand(withArg("--size", "0")), /size must be positive/);
  assert.throws(() => parseCommand(withArg("--size", "1.5")), /size must be an integer/);
  assert.throws(() => parseCommand(withArg("--leaf-count", "3")), /leaf count 3 does not match/);
  assert.throws(() => parseCommand(withArg("--duration", "0")), /duration must be positive/);
  assert.throws(() => parseCommand(withArg("--price", "0")), /price must be positive/);
  assert.throws(() => parseCommand(withArg("--price", "0.000000000000001")), /exact multiple of WEI_PER_UNIT/);
  assert.throws(() => parseCommand(withArg("--price", "1844674.4073709551616")), /uint64/);
});

test("a key on argv is refused and never echoed", () => {
  for (const flag of ["--private-key", "--key", "--secret", "--mnemonic"]) {
    const secret = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    assert.throws(() => parseCommand(["create", flag, secret]), (err: Error) => {
      assert.match(err.message, /never pass a private key on argv/);
      assert.doesNotMatch(err.message, /deadbeef/);
      return true;
    });
  }
});

test("create applies the documented fee policy and waits for finality before reading", async () => {
  const { deps, order, sent } = harness();
  const command = parseCommand([
    "create", "--root", ROOT, "--size", "2048", "--leaf-count", "2",
    "--provider", "1", "--duration", "100", "--price", "10",
  ]);
  const record = await execute(command, deps);

  assert.equal(order.join(","), "estimate,gasPrice,send,receipt,finality,read");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, CONTRACT);
  assert.equal(sent[0].value, 10n ** 19n);
  assert.equal(sent[0].gas, 120_000n, "gas = estimate * 1.2");
  assert.equal(sent[0].maxFeePerGas, 2_000_000_000n, "maxFeePerGas = chain gas price");
  assert.equal(sent[0].maxPriorityFeePerGas, 0n);
  assert.equal(record.finalized?.kind, "tag");
  assert.deepEqual(record.readBack, { claimed: 5n ** 14n });
});

test("a reverted receipt is reported with the mapped reason and takes no read-back", async () => {
  const { deps, order } = harness({ status: "reverted", reason: "execution reverted: Makhzan: ZeroClaim" });
  const command = parseCommand(["claim", "7"]);
  await assert.rejects(() => execute(command, deps), /nothing has accrued since the last claim/);
  assert.doesNotMatch(order.join(","), /read/);
});

test("an RPC failure is surfaced verbatim, never treated as success", async () => {
  const { deps } = harness();
  deps.chain.receipt = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8545");
  };
  await assert.rejects(() => execute(parseCommand(["settle", "7"]), deps), /ECONNREFUSED/);
});

test("upload reports the acknowledgement and report names the report file", async () => {
  const { deps, order } = harness();
  const upload = await execute(parseCommand(["upload", "file.bin", "--provider", "3"]), deps);
  assert.equal(order[0], "upload:file.bin:3");
  assert.deepEqual(upload.readBack, { root: ROOT, size: 2048, leafCount: 2 });

  const report = await execute(parseCommand(["report"]), deps);
  assert.equal(report.readBack?.report, "evidence/tier1-results.md");
});

test("watch polls the deal until it resolves, then reads it back", async () => {
  const { deps, order } = harness();
  const record = await execute(parseCommand(["watch", "7"]), deps);
  assert.equal(order.join(","), "poll,read");
  assert.ok(record.readBack);
});
