import { strict as assert } from "node:assert";
import { test } from "node:test";
import { diagnose } from "../src/doctor.ts";

const healthy = {
  network: "local" as const,
  expectedChainId: 420420777,
  chainId: 420420777,
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  balanceWei: 10n ** 20n,
  needsWei: 10n ** 18n,
  registered: true,
  providerId: 1,
  contractCode: "0x6080",
};

test("a healthy account passes every check", () => {
  const report = diagnose(healthy);
  assert.equal(report.ok, true);
  assert.deepEqual(report.lines.map((line) => line.check), [
    "network", "chain id", "account mapping", "balance", "contract code",
  ]);
  assert.ok(report.lines.every((line) => line.ok));
});

test("a wrong chain id prints the exact fix", () => {
  const report = diagnose({ ...healthy, chainId: 1 });
  assert.equal(report.ok, false);
  const line = report.lines.find((item) => item.check === "chain id")!;
  assert.match(line.fix ?? "", /MAKHZAN_CHAIN_ID=420420777/);
});

test("a balance shortfall is exact, in wei and tPOT", () => {
  const report = diagnose({ ...healthy, balanceWei: 6n * 10n ** 17n, needsWei: 10n ** 18n });
  const line = report.lines.find((item) => item.check === "balance")!;
  assert.equal(line.ok, false);
  assert.match(line.detail, /short by 400000000000000000 wei/);
  assert.match(line.fix ?? "", /fund 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/);
});

test("an unregistered account prints the register command with the network", () => {
  const report = diagnose({ ...healthy, registered: false, providerId: 0 });
  const line = report.lines.find((item) => item.check === "account mapping")!;
  assert.equal(line.ok, false);
  assert.match(line.fix ?? "", /MAKHZAN_NETWORK=local/);
  assert.match(line.fix ?? "", /register/);
});

test("a missing contract prints the deploy command, not a generic failure", () => {
  const report = diagnose({ ...healthy, contractCode: "0x" });
  const line = report.lines.find((item) => item.check === "contract code")!;
  assert.equal(line.ok, false);
  assert.match(line.fix ?? "", /scripts\/deploy\.mjs/);
  assert.match(line.fix ?? "", /MAKHZAN_CONTRACT/);
});
