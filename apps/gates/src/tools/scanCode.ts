/**
 * T029A: read-only survey of deployed code on the live chain.
 *
 * Scans recent blocks for contract creations, records the deployed code size and
 * prefix, and reads the revive constants that decide which bytecode is accepted.
 * Sends no transaction and needs no key.
 */
import { loadEnvFile, REPO_ROOT, requireEnv } from "../config.ts";
import { connectSubstrate, readProperties } from "../lib/substrate.ts";

interface RpcResponse<T> {
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function batch<T>(url: string, method: string, params: unknown[][]): Promise<T[]> {
  const body = params.map((entry, index) => ({ jsonrpc: "2.0", id: index + 1, method, params: entry }));
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status} ${response.statusText}`);
  const payload = (await response.json()) as Array<RpcResponse<T>>;
  return payload
    .sort((left, right) => left.id - right.id)
    .map((entry) => {
      if (entry.error) throw new Error(`${method}: ${entry.error.code} ${entry.error.message}`);
      return entry.result as T;
    });
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const [result] = await batch<T>(url, method, [params]);
  return result;
}

function hex(value: number): string {
  return `0x${value.toString(16)}`;
}

interface Block {
  number: string;
  transactions: Array<{ hash: string; to: string | null; from: string; input: string }>;
}

interface Receipt {
  contractAddress: string | null;
  status: string;
}

async function main(): Promise<void> {
  loadEnvFile();
  const url = requireEnv("PORTALDOT_EVM_RPC_URL");
  const wsUrl = requireEnv("PORTALDOT_WS_URL");
  const count = Number(process.argv[2] ?? 2000);

  const latest = Number(await rpc<string>(url, "eth_blockNumber", []));
  const from = Math.max(0, latest - count + 1);
  const numbers = Array.from({ length: latest - from + 1 }, (_value, index) => from + index);
  const blocks: Block[] = [];
  for (let offset = 0; offset < numbers.length; offset += 50) {
    const slice = numbers.slice(offset, offset + 50);
    const results = await batch<Block>(url, "eth_getBlockByNumber", slice.map((number) => [hex(number), true]));
    blocks.push(...results.filter(Boolean));
  }

  const creations = blocks.flatMap((block) =>
    block.transactions
      .filter((transaction) => transaction.to === null)
      .map((transaction) => ({ block: Number(block.number), hash: transaction.hash, from: transaction.from })),
  );

  const receipts: Receipt[] = [];
  for (let offset = 0; offset < creations.length; offset += 50) {
    const slice = creations.slice(offset, offset + 50);
    const results = await batch<Receipt | null>(url, "eth_getTransactionReceipt", slice.map((entry) => [entry.hash]));
    receipts.push(...(results.filter(Boolean) as Receipt[]));
  }

  const addresses = receipts.map((receipt) => receipt.contractAddress).filter((value): value is string => Boolean(value));
  const codes: string[] = [];
  for (let offset = 0; offset < addresses.length; offset += 50) {
    const slice = addresses.slice(offset, offset + 50);
    codes.push(...(await batch<string>(url, "eth_getCode", slice.map((address) => [address, "latest"]))));
  }

  const connection = await connectSubstrate(wsUrl);
  const api = connection.api;
  const properties = await readProperties(api).catch(() => null);
  const consts = api.consts as unknown as Record<string, Record<string, unknown> | undefined>;
  const reviveConstants = Object.fromEntries(
    Object.keys(consts.revive ?? {})
      .sort()
      .map((name) => {
        const value = consts.revive?.[name] as { toJSON?: () => unknown } | undefined;
        return [name, typeof value?.toJSON === "function" ? value.toJSON() : (value ?? null)];
      }),
  );
  await connection.disconnect();

  const contracts = creations.map((creation, index) => ({
    block: creation.block,
    txHash: creation.hash,
    contractAddress: receipts[index]?.contractAddress ?? null,
    status: receipts[index]?.status ?? null,
    codeBytes: codes[index] && codes[index] !== "0x" ? (codes[index].length - 2) / 2 : 0,
    codePrefix: codes[index] ? codes[index].slice(0, 42) : null,
  }));

  console.log(
    JSON.stringify(
      {
        scannedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        rpc: url,
        fromBlock: from,
        toBlock: latest,
        blocksScanned: blocks.length,
        transactionsScanned: blocks.reduce((total, block) => total + block.transactions.length, 0),
        creationsFound: creations.length,
        contracts,
        chain: {
          specName: api.runtimeVersion.specName.toString(),
          specVersion: api.runtimeVersion.specVersion.toString(),
          ss58Prefix: properties?.ss58Prefix ?? null,
          tokenSymbol: properties?.tokenSymbol ?? null,
          tokenDecimals: properties?.tokenDecimals ?? null,
        },
        reviveConstants,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
