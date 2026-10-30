import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Hex } from "viem";
import {
  parseGateCommand,
  executeGate,
  LIVE_GATE_ADDRESS,
  LIVE_CHAIN_ID,
  type GateCommandDeps,
  type ParsedGateCommand,
} from "../src/gateCli.ts";
import type { TxRequest } from "../src/cli.ts";

const DEAL_ID = 3;
const PAYEE = "0xf4ec143c743FF57c0D32e829f50692551CBf6029" as const;
const PAYER = "0x0948EBD7637D1C32858a6FC5D947E85A6600205C" as const;
const MAKHZAN = "0x60481DFcFCA34A8F095939D9675eC715127B2e44" as const;
const GATE = LIVE_GATE_ADDRESS;
const HASH = "0x00000000000000000000000000000000000000000000000000000000000000aa" as const;
const BLOCK = "0x00000000000000000000000000000000000000000000000000000000000000bb" as const;

function harness(options: {
  receipt?: Partial<{ status: "success" | "reverted"; reason: string }>;
  simulateError?: string;
  chainId?: number;
  gateMakhzan?: Hex;
  lock?: { payer: Hex; amount: bigint; payee: Hex; minBond: bigint; status: number };
  deal?: { owner: Hex; endBlock: number; providerId: number };
  provider?: { id: number; bond: bigint; registered: boolean };
  health?: number;
  currentBlock?: bigint;
} = {}) {
  const order: string[] = [];
  const sent: TxRequest[] = [];
  const submitted: { hash: Hex; action: string; nonce?: number }[] = [];

  const deps: GateCommandDeps = {
    makhzanContract: MAKHZAN,
    gateContract: GATE,
    chainId: options.chainId ?? LOCAL_CHAIN_ID,
    chain: {
      async chainId() {
        return options.chainId ?? LOCAL_CHAIN_ID;
      },
      async blockNumber() {
        return options.currentBlock ?? 100n;
      },
      async gateMakhzan() {
        return options.gateMakhzan ?? MAKHZAN;
      },
      async simulate() {
        order.push("simulate");
        if (options.simulateError) {
          return { ok: false as const, errorName: options.simulateError };
        }
        return { ok: true as const };
      },
      async estimateGas() {
        order.push("estimate");
        return 100_000n;
      },
      async gasPrice() {
        order.push("gasPrice");
        return 20_000_000_000n; // 20 gwei
      },
      async nonce() {
        return 1;
      },
      async recordSubmitted(hash, action, nonce) {
        order.push("recordSubmitted");
        submitted.push({ hash, action, nonce });
      },
      async send(tx) {
        order.push("send");
        sent.push(tx);
        return HASH;
      },
      async receipt() {
        order.push("receipt");
        return {
          status: options.receipt?.status ?? "success",
          blockNumber: 1n,
          blockHash: BLOCK,
          reason: options.receipt?.reason,
        };
      },
      async waitForFinality() {
        order.push("finality");
        return { kind: "tag", tag: "finalized" } as const;
      },
      async readLock(dealId: number) {
        order.push("readLock");
        return options.lock ?? {
          payer: PAYER,
          amount: 2n * 10n ** 18n,
          payee: PAYEE,
          minBond: 20n * 10n ** 14n,
          status: 1,
        };
      },
      async readDeal(dealId: number) {
        return options.deal ?? {
          owner: PAYER,
          endBlock: 700,
          providerId: 1,
        };
      },
      async readHealth(dealId: number) {
        return options.health ?? 1;
      },
      async readProvider(who: Hex) {
        return options.provider ?? {
          id: 1,
          bond: 24n * 10n ** 14n,
          registered: true,
        };
      },
    },
  };
  return { deps, order, sent, submitted };
}

const LOCAL_CHAIN_ID = 420_420_777;

test("parseGateCommand: parses gate status, lock, release, refund", () => {
  const status = parseGateCommand(["status", "3"]);
  assert.equal(status.name, "gate:status");
  if (status.name === "gate:status") {
    assert.equal(status.dealId, 3);
  }

  const lock = parseGateCommand([
    "lock", "3",
    "--payee", PAYEE,
    "--min-bond", "20",
    "--amount", "2",
  ]);
  assert.equal(lock.name, "gate:lock");
  if (lock.name === "gate:lock") {
    assert.equal(lock.dealId, 3);
    assert.equal(lock.payee.toLowerCase(), PAYEE.toLowerCase());
    assert.equal(lock.minBondUnits, 20n * 10n ** 14n);
    assert.equal(lock.amountWei, 2n * 10n ** 18n);
  }

  const release = parseGateCommand(["release", "3"]);
  assert.equal(release.name, "gate:release");
  if (release.name === "gate:release") {
    assert.equal(release.dealId, 3);
  }

  const refund = parseGateCommand(["refund", "3"]);
  assert.equal(refund.name, "gate:refund");
  if (refund.name === "gate:refund") {
    assert.equal(refund.dealId, 3);
  }
});

test("parseGateCommand: rejects keys on argv", () => {
  assert.throws(
    () => parseGateCommand(["lock", "3", "--key", "0x123"]),
    /never pass a private key on argv/,
  );
  assert.throws(
    () => parseGateCommand(["release", "3", "--private-key", "0x123"]),
    /never pass a private key on argv/,
  );
});

test("parseGateCommand: rejects invalid or missing arguments", () => {
  assert.throws(() => parseGateCommand([]), /usage: gate <status|lock|release|refund>/);
  assert.throws(() => parseGateCommand(["frob"]), /unknown gate command 'frob'/);
  assert.throws(() => parseGateCommand(["status"]), /missing <dealId>/);
  assert.throws(() => parseGateCommand(["status", "0"]), /dealId must fit uint32 and be positive/);
  assert.throws(() => parseGateCommand(["lock", "3", "--payee", PAYEE, "--min-bond", "20"]), /missing --amount/);
  assert.throws(() => parseGateCommand(["lock", "3", "--amount", "2", "--min-bond", "20"]), /missing --payee/);
  assert.throws(() => parseGateCommand(["lock", "3", "--payee", PAYEE, "--amount", "2"]), /missing --min-bond/);
  assert.throws(
    () => parseGateCommand(["lock", "3", "--payee", "0x1234", "--min-bond", "20", "--amount", "2"]),
    /payee must be a 20-byte hex address/,
  );
  assert.throws(
    () => parseGateCommand(["lock", "3", "--payee", PAYEE, "--min-bond", "0.000000000000001", "--amount", "2"]),
    /exact multiple of WEI_PER_UNIT/,
  );
  assert.throws(
    () => parseGateCommand(["lock", "3", "--payee", PAYEE, "--min-bond", "20", "--amount", "0"]),
    /amount must be positive/,
  );
});

test("executeGate: live mode refusal checks", async () => {
  const { deps } = harness({ chainId: LIVE_CHAIN_ID });
  const lockCmd = parseGateCommand([
    "lock", "3", "--payee", PAYEE, "--min-bond", "20", "--amount", "2",
  ]);

  // Live environment without --live flag
  await assert.rejects(
    () => executeGate(lockCmd, deps, { MAKHZAN_NETWORK: "live" }),
    /MAKHZAN_NETWORK=live needs the explicit --live flag/,
  );

  // --live flag with local environment
  const lockLiveCmd = parseGateCommand([
    "lock", "3", "--payee", PAYEE, "--min-bond", "20", "--amount", "2", "--live",
  ]);
  await assert.rejects(
    () => executeGate(lockLiveCmd, deps, { MAKHZAN_NETWORK: "local" }),
    /--live needs MAKHZAN_NETWORK=live; nothing was sent/,
  );

  // Live mode with wrong gate address
  const wrongGateDeps = { ...deps, gateContract: "0x0000000000000000000000000000000000000001" as Hex };
  await assert.rejects(
    () => executeGate(lockLiveCmd, wrongGateDeps, { MAKHZAN_NETWORK: "live" }),
    /refusing: gate .* does not match recorded live gate/,
  );

  // Live mode with wrong chain id
  const wrongChainDeps = harness({ chainId: 12345 }).deps;
  await assert.rejects(
    () => executeGate(lockLiveCmd, wrongChainDeps, { MAKHZAN_NETWORK: "live" }),
    /refusing: the RPC is chain 12345, settings say 420420777/,
  );

  // Gate points at different Makhzan
  const badMakhzanDeps = harness({ gateMakhzan: "0x0000000000000000000000000000000000000002" as Hex }).deps;
  await assert.rejects(
    () => executeGate(lockCmd, badMakhzanDeps, { MAKHZAN_NETWORK: "local" }),
    /points at a different Makhzan/,
  );
});

test("executeGate: spend cap enforcement", async () => {
  const { deps } = harness();
  // Gas: 100k * 1.2 = 120k * 20 gwei = 0.0024 tPOT fee. Value: 2 tPOT. Total spend: 2.0024 tPOT.
  // Set cap to 1.5 tPOT: must refuse!
  const lockWithCap = parseGateCommand([
    "lock", "3", "--payee", PAYEE, "--min-bond", "20", "--amount", "2", "--cap", "1.5",
  ]);
  await assert.rejects(
    () => executeGate(lockWithCap, deps, { MAKHZAN_NETWORK: "local" }),
    /exceeds spend cap 1\.5/,
  );

  // Set cap to 3.0 tPOT: must pass
  const lockPassingCap = parseGateCommand([
    "lock", "3", "--payee", PAYEE, "--min-bond", "20", "--amount", "2", "--cap", "3.0",
  ]);
  const res = await executeGate(lockPassingCap, deps, { MAKHZAN_NETWORK: "local" });
  assert.equal(res.executed?.status, "success");
});

test("executeGate: simulation captures decoded revert reason before send", async () => {
  // release reverts with BondTooLow
  const { deps: depsBondTooLow, sent } = harness({ simulateError: "BondTooLow" });
  const releaseCmd = parseGateCommand(["release", "3"]);
  await assert.rejects(
    () => executeGate(releaseCmd, depsBondTooLow, { MAKHZAN_NETWORK: "local" }),
    /refusing: call would revert with BondTooLow/,
  );
  assert.equal(sent.length, 0, "no transaction sent on revert");

  // refund reverts with RefundNotAllowed
  const { deps: depsRefund } = harness({ simulateError: "RefundNotAllowed" });
  const refundCmd = parseGateCommand(["refund", "3"]);
  await assert.rejects(
    () => executeGate(refundCmd, depsRefund, { MAKHZAN_NETWORK: "local" }),
    /refusing: call would revert with RefundNotAllowed/,
  );
});

test("executeGate: gate lock sends tx, records submitted, and returns 5-state record", async () => {
  const { deps, order, submitted } = harness();
  const lockCmd = parseGateCommand([
    "lock", "3", "--payee", PAYEE, "--min-bond", "20", "--amount", "2",
  ]);
  const record = await executeGate(lockCmd, deps, { MAKHZAN_NETWORK: "local" });
  assert.deepEqual(order, ["simulate", "estimate", "gasPrice", "send", "recordSubmitted", "receipt", "finality", "readLock"]);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].action, "gate:lock");
  assert.equal(record.submitted?.hash, HASH);
  assert.equal(record.executed?.status, "success");
  assert.equal((record.finalized as { kind: string; tag: string })?.tag, "finalized");
  assert.equal((record.readBack as { lock: { status: number } }).lock.status, 1);
});

test("executeGate: gate status returns full read-only report with release verdict", async () => {
  // Case 1: Healthy deal, bond >= minBond -> releaseWouldPass: true
  const { deps: depsHealthy } = harness({
    lock: { payer: PAYER, amount: 2n * 10n ** 18n, payee: PAYEE, minBond: 20n * 10n ** 14n, status: 1 },
    deal: { owner: PAYER, endBlock: 500, providerId: 1 },
    provider: { id: 1, bond: 24n * 10n ** 14n, registered: true },
    health: 1,
    currentBlock: 200n,
  });
  const statusCmd = parseGateCommand(["status", "3"]);
  const resHealthy = await executeGate(statusCmd, depsHealthy, { MAKHZAN_NETWORK: "local" });
  const report = resHealthy.readBack as {
    dealId: number;
    verdict: { releaseWouldPass: boolean; reason: string };
  };
  assert.equal(report.dealId, 3);
  assert.equal(report.verdict.releaseWouldPass, true);

  // Case 2: Bond under floor (24 < 30) -> releaseWouldPass: false, BondTooLow
  const { deps: depsBondLow } = harness({
    lock: { payer: PAYER, amount: 2n * 10n ** 18n, payee: PAYEE, minBond: 30n * 10n ** 14n, status: 1 },
    deal: { owner: PAYER, endBlock: 500, providerId: 1 },
    provider: { id: 1, bond: 24n * 10n ** 14n, registered: true },
    health: 1,
    currentBlock: 200n,
  });
  const resBondLow = await executeGate(statusCmd, depsBondLow, { MAKHZAN_NETWORK: "local" });
  const reportLow = resBondLow.readBack as { verdict: { releaseWouldPass: boolean; reason: string } };
  assert.equal(reportLow.verdict.releaseWouldPass, false);
  assert.match(reportLow.verdict.reason, /BondTooLow/);
});
