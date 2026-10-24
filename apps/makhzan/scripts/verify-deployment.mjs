#!/usr/bin/env node
/**
 * Read-only deployment verification. Compares eth_getCode with the artifact's deployedBytecode byte
 * for byte and writes evidence/verify-deployment.json. No transaction, no key.
 *
 * usage: node scripts/verify-deployment.mjs --address 0x... [--artifact contracts/out/...json]
 * env:   MAKHZAN_NETWORK=local|live, MAKHZAN_RPC_URL, MAKHZAN_CHAIN_ID,
 *        MAKHZAN_DEPLOYER_HELPER (optional Tier 0 helper), MAKHZAN_EVIDENCE_DIR
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { verifyDeployment } from "../src/verify.ts";

const local = "http://127.0.0.1:8549";
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const network = process.env.MAKHZAN_NETWORK ?? "local";
if (!["local", "live"].includes(network)) {
  console.error("verify: MAKHZAN_NETWORK must be local or live");
  process.exit(2);
}
const rpcUrl = value("rpc", process.env.MAKHZAN_RPC_URL ?? (network === "local" ? local : ""));
const chainIdText = value("chain-id", process.env.MAKHZAN_CHAIN_ID ?? (network === "local" ? "420420777" : ""));
const address = value("address", "");
const artifactPath = value("artifact", "contracts/out/Makhzan.sol/Makhzan.json");
const helper = process.env.MAKHZAN_DEPLOYER_HELPER;
if (!rpcUrl || !chainIdText || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("verify: need MAKHZAN_RPC_URL, MAKHZAN_CHAIN_ID and --address 0x... (40 hex)");
  process.exit(2);
}
const artifact = JSON.parse(readFileSync(resolve(artifactPath), "utf8"));
const runtime = artifact.deployedBytecode?.object ?? "";
const chainId = Number(chainIdText);
const client = createPublicClient({ transport: http(rpcUrl) });

const deps = {
  network,
  chainId: async () => Number(await client.getChainId()),
  blockNumber: async () => Number(await client.getBlockNumber()),
  getCode: async (target, block) => (await client.getCode({ address: target, blockNumber: BigInt(block) })) ?? "0x",
};
if (helper) {
  deps.deployerOf = async (target) => {
    const code = await client.getCode({ address: helper });
    if (!code || code === "0x") throw new Error(`helper ${helper} has no code`);
    return client.readContract({
      address: helper,
      abi: [{
        type: "function", name: "deployerOf", stateMutability: "view",
        inputs: [{ name: "contractAddress", type: "address" }],
        outputs: [{ name: "", type: "address" }],
      }],
      functionName: "deployerOf",
      args: [target],
    });
  };
}

const utc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const { ok, record, comparison } = await verifyDeployment(deps, {
  address, artifactPath, runtime, utc, helper,
});
record.chainId = chainId;
const out = resolve(process.env.MAKHZAN_EVIDENCE_DIR ?? "evidence", "verify-deployment.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(`${ok ? "match" : "MISMATCH"}: ${address} block ${record.block}, ${comparison.runtimeBytes} B runtime, artifact ${comparison.artifactBytes} B`);
if (!ok) console.log(`refused: ${comparison.reason}`);
console.log(`record ${out}`);
process.exitCode = ok ? 0 : 1;
