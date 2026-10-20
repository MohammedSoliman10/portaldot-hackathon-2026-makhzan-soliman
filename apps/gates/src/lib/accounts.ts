import { createWalletClient, http, type Address, type Hex } from "viem";
import { createPublicClient } from "viem";
import { getBurnerKey } from "../config.ts";
import { portaldot, walletFor } from "./evm.ts";

export async function localAccount(rpcUrl: string): Promise<Address> {
  const client = createPublicClient({ transport: http(rpcUrl) });
  const accounts = (await client.transport.request({ method: "eth_accounts" } as never)) as unknown as Address[];
  if (!accounts[0]) throw new Error("local node has no unlocked account; start anvil first");
  return accounts[0];
}

/** Local mode uses the node's unlocked account, so no key is ever loaded. */
export async function walletForMode(mode: "live" | "local", rpcUrl: string) {
  if (mode === "local") {
    return createWalletClient({
      chain: portaldot,
      transport: http(rpcUrl),
      account: await localAccount(rpcUrl),
    });
  }
  return walletFor(rpcUrl, getBurnerKey("owner") as Hex).wallet;
}
