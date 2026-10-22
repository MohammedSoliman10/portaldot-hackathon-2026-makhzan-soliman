/**
 * viem wiring for the CLI and the daemon.
 *
 * One object per process implements both the CLI's `CommandDeps.chain` and the daemon's `ChainClient`,
 * so every method the two entry points declare has a real implementation. The key only ever lives in
 * the viem account; it is not logged, not put in a transaction and not written to the state file.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { CommandDeps, Receipt, TxRequest } from "./cli.ts";
import type { Finality } from "./status.ts";
import { chunkFile } from "./chunk.ts";
import type { ChainClient } from "./daemon.ts";
import { buildTree } from "./merkle.ts";
import type { Settings } from "./settings.ts";

export const DEFAULT_BLOCK_SIZE = 1024;

const ABI = [
  { type: "function", name: "registerProvider", stateMutability: "payable", inputs: [], outputs: [] },
  {
    type: "function", name: "providerOf", stateMutability: "view",
    inputs: [{ name: "who", type: "address" }],
    outputs: [
      { name: "id", type: "uint16" }, { name: "bond", type: "uint64" },
      { name: "activeDeals", type: "uint24" }, { name: "registered", type: "bool" },
    ],
  },
  {
    type: "function", name: "dealOf", stateMutability: "view",
    inputs: [{ name: "dealId", type: "uint32" }],
    outputs: [
      { name: "owner", type: "address" }, { name: "startBlock", type: "uint32" },
      { name: "endBlock", type: "uint32" }, { name: "providerId", type: "uint16" },
      { name: "flags", type: "uint8" }, { name: "root", type: "bytes32" },
      { name: "leafCount", type: "uint24" }, { name: "size", type: "uint32" },
      { name: "challengeIndex", type: "uint32" }, { name: "challengeStart", type: "uint32" },
      { name: "price", type: "uint64" }, { name: "claimed", type: "uint64" },
    ],
  },
  {
    type: "function", name: "accruedOf", stateMutability: "view",
    inputs: [{ name: "dealId", type: "uint32" }],
    outputs: [{ name: "accrued", type: "uint64" }, { name: "claimable", type: "uint64" }],
  },
  {
    type: "function", name: "challengeStateOf", stateMutability: "view",
    inputs: [{ name: "dealId", type: "uint32" }],
    outputs: [
      { name: "open", type: "bool" }, { name: "index", type: "uint32" },
      { name: "start", type: "uint32" }, { name: "deadline", type: "uint32" },
      { name: "expectedPathLength", type: "uint32" },
    ],
  },
  {
    type: "function", name: "answer", stateMutability: "nonpayable",
    inputs: [
      { name: "dealId", type: "uint32" }, { name: "data", type: "bytes" },
      { name: "path", type: "bytes32[]" },
    ], outputs: [],
  },
  {
    type: "event", name: "DealCreated",
    inputs: [
      { name: "dealId", type: "uint32", indexed: true }, { name: "owner", type: "address", indexed: true },
      { name: "providerId", type: "uint16", indexed: false }, { name: "root", type: "bytes32", indexed: false },
      { name: "size", type: "uint32", indexed: false }, { name: "endBlock", type: "uint32", indexed: false },
      { name: "price", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event", name: "ProviderRegistered",
    inputs: [
      { name: "provider", type: "address", indexed: true }, { name: "id", type: "uint16", indexed: false },
      { name: "bond", type: "uint64", indexed: false },
    ],
  },
] as const satisfies Abi;

export interface Wiring {
  address: Hex;
  account: Hex;
  chain: CommandDeps["chain"] & ChainClient;
  uploader: NonNullable<CommandDeps["uploader"]>;
  reporter: NonNullable<CommandDeps["reporter"]>;
  providerOf(who: Hex): Promise<{ id: number; bond: bigint; registered: boolean }>;
  registerProvider(bondWei: bigint): Promise<Hex>;
  discoverDeals(providerId: number): Promise<
    { dealId: number; owner: Hex; root: Hex; endBlock: number }[]
  >;
}

export function makeChain(settings: Settings, env: NodeJS.ProcessEnv = process.env): Wiring {
  const chain = defineChain({
    id: settings.chainId,
    name: settings.network === "local" ? "makhzan-local" : `makhzan-${settings.chainId}`,
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
    rpcUrls: { default: { http: [settings.rpcUrl] } },
  });
  const transport = http(settings.rpcUrl);
  const account = privateKeyToAccount(settings.key);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ chain, transport, account });
  const address = settings.contract;
  const blockSize = env.MAKHZAN_BLOCK_SIZE ? Number(env.MAKHZAN_BLOCK_SIZE) : DEFAULT_BLOCK_SIZE;
  const daemonUrl = settings.daemonUrl;

  const providerOf: Wiring["providerOf"] = async (who) => {
    const [id, bond, , registered] = await publicClient.readContract({
      address, abi: ABI, functionName: "providerOf", args: [who],
    });
    return { id: Number(id), bond, registered };
  };

  const dealOf = async (dealId: number) => {
    const d = await publicClient.readContract({ address, abi: ABI, functionName: "dealOf", args: [dealId] });
    return {
      owner: d[0], startBlock: Number(d[1]), endBlock: Number(d[2]), providerId: Number(d[3]),
      flags: Number(d[4]), root: d[5], leafCount: Number(d[6]), size: Number(d[7]),
      challengeIndex: Number(d[8]), challengeStart: Number(d[9]), price: d[10], claimed: d[11],
    };
  };

  const chainApi: Wiring["chain"] = {
    async blockNumber() {
      return Number(await publicClient.getBlockNumber());
    },
    async bondOf(dealId) {
      const deal = await dealOf(dealId);
      const events = await publicClient.getContractEvents({
        address, abi: ABI, eventName: "ProviderRegistered", fromBlock: 0n,
      });
      const match = events.find((event) => Number(event.args.id) === deal.providerId);
      if (!match) throw new Error(`provider ${deal.providerId} has no registration event`);
      const provider = await providerOf(match.args.provider as Hex);
      return provider.bond;
    },
    async challengeStateOf(dealId) {
      const [open, index, start, deadline, expectedPathLength] = await publicClient.readContract({
        address, abi: ABI, functionName: "challengeStateOf", args: [dealId],
      });
      return {
        open: Boolean(open), index: Number(index), start: Number(start),
        deadline: Number(deadline), expectedPathLength: Number(expectedPathLength),
      };
    },
    async answer(dealId, data, path) {
      const hash = await walletClient.writeContract({
        address, abi: ABI, functionName: "answer", args: [dealId, data, path],
      });
      return { hash };
    },
    async estimateGas(tx) {
      return publicClient.estimateGas({
        account: account.address, to: address, data: tx.data, value: tx.value,
      });
    },
    async gasPrice() {
      return publicClient.getGasPrice();
    },
    async nonce() {
      return publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
    },
    async send(tx: TxRequest) {
      return walletClient.sendTransaction({
        account, to: address, data: tx.data, value: tx.value, gas: tx.gas,
        maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas, chain,
      });
    },
    async receipt(hash): Promise<Receipt> {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
      };
    },
    async waitForFinality(receipt): Promise<Finality> {
      for (let attempt = 0; attempt < 600; attempt++) {
        const finalized = await publicClient.getBlock({ blockTag: "finalized" });
        if (finalized.number >= receipt.blockNumber) return { kind: "tag", tag: "finalized" };
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error("no finalized block covered the receipt in time");
    },
    async read(target) {
      if (target === "created") {
        const events = await publicClient.getContractEvents({
          address, abi: ABI, eventName: "DealCreated", fromBlock: 0n,
        });
        const last = events.at(-1);
        if (!last) throw new Error("no DealCreated event found");
        return {
          dealId: Number(last.args.dealId), owner: last.args.owner,
          providerId: Number(last.args.providerId), root: last.args.root,
          size: Number(last.args.size), endBlock: Number(last.args.endBlock),
          price: (last.args.price ?? 0n).toString(),
        };
      }
      const deal = await dealOf(target);
      const [accrued, claimable] = await publicClient.readContract({
        address, abi: ABI, functionName: "accruedOf", args: [target],
      });
      const challenge = await chainApi.challengeStateOf(target);
      return {
        dealId: target,
        owner: deal.owner,
        startBlock: deal.startBlock,
        endBlock: deal.endBlock,
        flags: deal.flags,
        providerId: deal.providerId,
        leafCount: deal.leafCount,
        size: deal.size,
        price: deal.price.toString(),
        claimed: deal.claimed.toString(),
        accrued: accrued.toString(),
        claimable: claimable.toString(),
        challenge: {
          open: challenge.open, index: challenge.index, start: challenge.start,
          deadline: challenge.deadline, expectedPathLength: challenge.expectedPathLength,
        },
      };
    },
    async pollDeal(dealId) {
      for (let attempt = 0; attempt < 600; attempt++) {
        const deal = await dealOf(dealId);
        if (deal.flags & 1) return true;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return false;
    },
  };

  const uploader: Wiring["uploader"] = async (file, providerId) => {
    const bytes = readFileSync(file);
    const chunked = chunkFile(bytes, blockSize);
    const tree = buildTree(chunked.blocks);
    void providerId;
    for (let index = 0; index < chunked.leafCount; index++) {
      const response = await fetch(`${daemonUrl}/upload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root: tree.root, size: chunked.size, leafCount: chunked.leafCount,
          blockSize: chunked.blockSize, index,
          data: `0x${Buffer.from(chunked.blocks[index]).toString("hex")}`,
        }),
      });
      if (!response.ok) throw new Error(`upload rejected: ${await response.text()}`);
    }
    return { root: tree.root, size: chunked.size, leafCount: chunked.leafCount };
  };

  const reporter: Wiring["reporter"] = async () => {
    return JSON.stringify({ network: settings.network, contract: address, stateDir: settings.stateDir });
  };

  const discoverDeals: Wiring["discoverDeals"] = async (providerId) => {
    const events = await publicClient.getContractEvents({
      address, abi: ABI, eventName: "DealCreated", fromBlock: 0n,
    });
    return events
      .filter((event) => Number(event.args.providerId) === providerId)
      .map((event) => ({
        dealId: Number(event.args.dealId),
        owner: event.args.owner as Hex,
        root: event.args.root as Hex,
        endBlock: Number(event.args.endBlock),
      }));
  };

  const registerProvider = async (bondWei: bigint) => {
    return walletClient.writeContract({
      address, abi: ABI, functionName: "registerProvider", args: [], value: bondWei,
    });
  };

  return {
    address,
    account: account.address,
    chain: chainApi,
    uploader,
    reporter,
    providerOf,
    registerProvider,
    discoverDeals,
  };
}
