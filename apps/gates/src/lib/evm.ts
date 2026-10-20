import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { CHAIN } from "../config.ts";

export const portaldot = defineChain({
  id: CHAIN.id,
  name: CHAIN.name,
  nativeCurrency: CHAIN.nativeCurrency,
  rpcUrls: {
    default: { http: [process.env.PORTALDOT_EVM_RPC_URL ?? "http://127.0.0.1:8545"] },
  },
});

export function publicClientFor(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: { ...portaldot, rpcUrls: { default: { http: [rpcUrl] } } }, transport: http(rpcUrl) });
}

export function walletFor(rpcUrl: string, privateKey: Hex): { account: PrivateKeyAccount; wallet: WalletClient } {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({
    account,
    chain: { ...portaldot, rpcUrls: { default: { http: [rpcUrl] } } },
    transport: http(rpcUrl),
  });
  return { account, wallet };
}

export interface SendResult {
  hash: Hex;
  blockNumber: bigint;
  status: "success" | "reverted";
  gasUsed: bigint;
  explorerUrl: string | null;
}

/** Send one transaction and wait for its receipt; the hash is recorded before the wait. */
export async function sendAndWait(
  wallet: WalletClient,
  client: PublicClient,
  request: { to?: Address | null; data?: Hex; value?: bigint },
  options: { explorerBase?: string | null; receiptPath?: string | null } = {},
): Promise<SendResult> {
  const hash = await wallet.sendTransaction({
    account: wallet.account!,
    chain: wallet.chain,
    to: request.to ?? undefined,
    data: request.data,
    value: request.value,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const result: SendResult = {
    hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    gasUsed: receipt.gasUsed,
    explorerUrl: options.explorerBase ? `${options.explorerBase.replace(/\/$/, "")}/tx/${hash}` : null,
  };
  if (options.receiptPath) {
    await mkdir(dirname(options.receiptPath), { recursive: true });
    await writeFile(options.receiptPath, `${JSON.stringify(receipt, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
  }
  return result;
}

/** Refuse to spend when the balance would drop below the reserve. */
export function assertReserve(balance: bigint, estimatedCost: bigint, reserve: bigint): void {
  if (balance - estimatedCost < reserve) {
    throw new Error(
      `balance guard: balance ${balance} minus estimated cost ${estimatedCost} would fall below reserve ${reserve}`,
    );
  }
}

export async function getEvmBalance(client: PublicClient, address: Address): Promise<bigint> {
  return client.getBalance({ address });
}
