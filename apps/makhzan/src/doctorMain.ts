#!/usr/bin/env node
/**
 * `doctor` — read-only environment check. Prints one line per check and the exact fix for a failure.
 * No transaction, no private key: the account is an address from env or --account.
 *
 * usage: node src/doctorMain.ts [--account 0x...] [--contract 0x...]
 * env:   MAKHZAN_NETWORK=local|live, MAKHZAN_RPC_URL, MAKHZAN_CHAIN_ID, MAKHZAN_CONTRACT,
 *        MAKHZAN_ED_TPOT (default 1), MAKHZAN_DEPOSITS_TPOT (default 0), MAKHZAN_GAS_TPOT (default 0.01)
 */
import { createPublicClient, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { diagnose, render } from "./doctor.ts";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const network = (process.env.MAKHZAN_NETWORK ?? "local") as "local" | "live";
const rpcUrl = arg("rpc", process.env.MAKHZAN_RPC_URL ?? (network === "local" ? "http://127.0.0.1:8549" : ""));
const expectedChainId = Number(arg("chain-id", process.env.MAKHZAN_CHAIN_ID ?? (network === "local" ? "420420777" : "0")));
const contract = arg("contract", process.env.MAKHZAN_CONTRACT ?? "");
const address = arg("account", process.env.MAKHZAN_ACCOUNT ?? "") ||
  (process.env.MAKHZAN_PRIVATE_KEY
    ? privateKeyToAccount(process.env.MAKHZAN_PRIVATE_KEY as Hex).address
    : "");
const needsWei =
  parseEther(process.env.MAKHZAN_ED_TPOT ?? "1") +
  parseEther(process.env.MAKHZAN_DEPOSITS_TPOT ?? "0") +
  parseEther(process.env.MAKHZAN_GAS_TPOT ?? "0.01");

if (!rpcUrl) {
  console.error("doctor: set MAKHZAN_RPC_URL for a live network");
  process.exit(2);
}
const client = createPublicClient({ transport: http(rpcUrl) });
const chainId = Number(await client.getChainId().catch(() => 0));
const balanceWei = /^0x[0-9a-fA-F]{40}$/.test(address) ? await client.getBalance({ address: address as Hex }) : 0n;
const code = /^0x[0-9a-fA-F]{40}$/.test(contract)
  ? (await client.getCode({ address: contract as Hex })) ?? "0x"
  : "0x";
let registered = false;
let providerId = 0;
if (/^0x[0-9a-fA-F]{40}$/.test(contract) && /^0x[0-9a-fA-F]{40}$/.test(address) && code !== "0x") {
  try {
    const result = (await client.readContract({
      address: contract as Hex,
      abi: [{
        type: "function", name: "providerOf", stateMutability: "view",
        inputs: [{ name: "who", type: "address" }],
        outputs: [
          { name: "id", type: "uint16" }, { name: "bond", type: "uint64" },
          { name: "activeDeals", type: "uint24" }, { name: "registered", type: "bool" },
        ],
      }],
      functionName: "providerOf",
      args: [address as Hex],
    })) as readonly [number, bigint, number, boolean];
    providerId = Number(result[0]);
    registered = Boolean(result[3]);
  } catch {
    registered = false;
  }
}

const report = diagnose({
  network, expectedChainId, chainId, address, contract,
  balanceWei, needsWei, registered, providerId, contractCode: code,
});
for (const line of render(report)) console.log(line);
console.log(report.ok ? "doctor: ready" : "doctor: not ready; fix the FAIL lines above");
process.exitCode = report.ok ? 0 : 1;
