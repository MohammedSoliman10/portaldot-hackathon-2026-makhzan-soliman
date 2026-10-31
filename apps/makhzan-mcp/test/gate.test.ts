import { strict as assert } from "node:assert";
import { test } from "node:test";
import { gateStatusTool } from "../src/tools/gate.ts";
import { CONTRACT, GATE, TPOT, fakeReads } from "./helpers.ts";

test("gate_status says the gate is not deployed when no address is configured", async () => {
  const reads = fakeReads();
  const result = await gateStatusTool(reads, 1, { contract: CONTRACT, gate: null });

  assert.match(result.text, /^\[MEASURED\] makhzan_gate_status — deal 1/);
  assert.match(result.text, /gate not deployed/);
  assert.match(result.text, /MAKHZAN_GATE is unset/);
  assert.equal(result.facts.gate, null);
  assert.equal(result.facts.releaseWouldPass, null);
  assert.ok(!/gate 0x[0-9a-f]{40}/i.test(result.text), "no gate address may be invented");
});

test("gate_status reports lock, payee, amount, floor and bond, and that release would pass", async () => {
  const reads = fakeReads();
  const result = await gateStatusTool(reads, 1, { contract: CONTRACT, gate: GATE });

  assert.match(result.text, /gate 0x1111111111111111111111111111111111111111/);
  assert.match(result.text, /MakhzanGuard decision: healthy/);
  assert.match(result.text, /release would pass now: YES/);
  assert.equal(result.facts.status, 1);
  assert.equal(result.facts.amountTpot, "5.00000000000000");
  assert.equal(result.facts.minBondTpot, "0.00000000000000");
  assert.equal(result.facts.providerBondTpot, "24.00000000000000");
  assert.equal(result.facts.releaseWouldPass, true);
});

test("gate_status says NO when the provider bond is under the floor", async () => {
  const reads = fakeReads({
    gateLock: async () => ({
      payer: "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
      amount: 500_000_000_000_000n,
      payee: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      minBond: 30n * TPOT,
      status: 1,
    }),
  });
  const result = await gateStatusTool(reads, 2, { contract: CONTRACT, gate: GATE });

  assert.equal(result.facts.releaseWouldPass, false);
  assert.match(result.text, /release would pass now: NO/);
  assert.match(result.text, /BondTooLow/);
  assert.match(result.text, /floor 30\.00000000000000 tPOT/);
});

test("gate_status says NO and names the guard state when a challenge is open", async () => {
  const reads = fakeReads({ health: async () => 2 });
  const result = await gateStatusTool(reads, 1, { contract: CONTRACT, gate: GATE });

  assert.equal(result.facts.releaseWouldPass, false);
  assert.match(result.text, /release would pass now: NO/);
  assert.match(result.text, /Pending/);
});

test("gate_status reports a released lock as paid to payee, not a release-would-revert verdict", async () => {
  const reads = fakeReads({
    gateLock: async () => ({
      payer: "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
      amount: 2_000_000_000_000_000_000n, // 2e18 wei = 2 tPOT
      payee: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      minBond: 0n,
      status: 2,
    }),
  });
  const result = await gateStatusTool(reads, 1, { contract: CONTRACT, gate: GATE });

  assert.equal(result.facts.status, 2);
  assert.equal(result.facts.releaseWouldPass, false);
  assert.match(result.text, /status 2 \(released\)/);
  assert.match(result.text, /released: 2 tPOT paid to the payee/);
  assert.ok(!result.text.includes("no lock is open"), "must not say no lock is open on released lock");
  assert.ok(!result.text.includes("Expired"), "must not give a release-would-revert verdict on released lock");
});

test("gate_status reports a refunded lock as refunded, not a release-would-revert verdict", async () => {
  const reads = fakeReads({
    gateLock: async () => ({
      payer: "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
      amount: 2_000_000_000_000_000_000n,
      payee: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      minBond: 0n,
      status: 3,
    }),
  });
  const result = await gateStatusTool(reads, 1, { contract: CONTRACT, gate: GATE });

  assert.equal(result.facts.status, 3);
  assert.equal(result.facts.releaseWouldPass, false);
  assert.match(result.text, /status 3 \(refunded\)/);
  assert.match(result.text, /release would pass now: NO — refunded/);
  assert.ok(!result.text.includes("no lock is open"), "must not say no lock is open on refunded lock");
});

test("gate_status formats wei lock amount without 10,000x inflation and includes verdict explanation", async () => {
  const reads = fakeReads({
    gateLock: async () => ({
      payer: "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
      amount: 2_000_000_000_000_000_000n, // 2e18 wei = 2 tPOT
      payee: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      minBond: 2_000_000_000_000_000n, // 2e15 planck = 20 tPOT
      status: 1,
    }),
  });
  const result = await gateStatusTool(reads, 1, { contract: CONTRACT, gate: GATE });

  assert.match(result.text, /amount 2\.00000000000000 tPOT \(2000000000000000000 wei\)/);
  assert.equal(result.facts.amountTpot, "2.00000000000000");
  assert.ok(!result.text.includes("20000.00000000000000 tPOT"), "must not be 10,000x inflated");
  assert.match(result.text, /the guard checks expiry before the bond floor/);
});

test("gate_status refuses a gate that points at a different Makhzan", async () => {
  const reads = fakeReads({
    gateMakhzan: async () => "0x2222222222222222222222222222222222222222",
  });
  await assert.rejects(
    gateStatusTool(reads, 1, { contract: CONTRACT, gate: GATE }),
    /different Makhzan/,
  );
});
