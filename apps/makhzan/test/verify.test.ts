import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compareRuntime, verifyDeployment } from "../src/verify.ts";

const RUNTIME = "0x6080604052348015600e575f5ffd5b50600436106026575f3560e01c8063a1b2c3d414602a575b5f5ffd5b";

test("matching runtime code is accepted byte for byte", () => {
  const result = compareRuntime(RUNTIME, RUNTIME);
  assert.equal(result.ok, true);
  assert.equal(result.runtimeBytes, (RUNTIME.length - 2) / 2);
  assert.equal(result.firstDiff, null);
});

test("case and a missing 0x prefix are normalised, not treated as a mismatch", () => {
  const result = compareRuntime(RUNTIME.toUpperCase().replace("0X", "0x"), RUNTIME);
  assert.equal(result.ok, true);
});

test("one tampered byte is refused and its offset is reported", () => {
  const tampered = `0x${RUNTIME.slice(2, 20)}ff${RUNTIME.slice(22)}`;
  const result = compareRuntime(tampered, RUNTIME);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /differs at byte 9/);
  assert.equal(result.firstDiff, 9);
});

test("a shorter runtime is refused as a byte-length mismatch", () => {
  const result = compareRuntime(RUNTIME.slice(0, -2), RUNTIME);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /length/);
});

test("an artifact without deployedBytecode is refused, never guessed", () => {
  const result = compareRuntime(RUNTIME, "");
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /deployedBytecode/);
});

test("verification writes code, artifact, deployer mapping and the block it read", async () => {
  const seen: Array<{ address: string; block: number }> = [];
  const result = await verifyDeployment(
    {
      network: "local",
      chainId: async () => 420420777,
      blockNumber: async () => 12,
      getCode: async (address, block) => {
        seen.push({ address, block });
        return RUNTIME;
      },
      deployerOf: async () => "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    },
    {
      address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      artifactPath: "contracts/out/Makhzan.sol/Makhzan.json",
      runtime: RUNTIME,
      utc: "2026-10-23T09:00:00Z",
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.record.schema, "makhzan.verify-deployment/v0");
  assert.equal(result.record.network, "LOCAL");
  assert.equal(result.record.block, 12);
  assert.equal(result.record.codeVerified.method, "runtime-code-hash");
  assert.equal(result.record.deployerMapping.checked, true);
  assert.match(String(result.record.deployerMapping.note), /0xf39Fd6/);
  assert.deepEqual(seen, [{ address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", block: 12 }]);
});

test("without a reachable helper the deployer mapping is explicitly not checked", async () => {
  const result = await verifyDeployment(
    {
      network: "live",
      chainId: async () => 420420777,
      blockNumber: async () => 5,
      getCode: async () => RUNTIME,
      deployerOf: async () => {
        throw new Error("helper not deployed");
      },
    },
    { address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", artifactPath: "a.json", runtime: RUNTIME, utc: "x" },
  );
  assert.equal(result.ok, true);
  assert.equal(result.record.network, "LIVE");
  assert.equal(result.record.deployerMapping.checked, false);
  assert.match(String(result.record.deployerMapping.note), /not checked/);
});
