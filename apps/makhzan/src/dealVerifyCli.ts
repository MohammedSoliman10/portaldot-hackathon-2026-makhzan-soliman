/**
 * Read-only `makhzan verify <dealId>`: read state and logs, then print PASS/FAIL lines.
 *
 * The command never loads a key and never builds a transaction. When the RPC refuses a log range the
 * failure is carried into the report (`logsError`) instead of being guessed around.
 */
import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  http,
  parseAbi,
  toEventSelector,
  type Hex,
  type PublicClient,
} from "viem";
import { DEFAULT_BLOCK_SIZE } from "./chain.ts";
import {
  renderVerify,
  verifyDeal,
  type DealLog,
  type DealVerifyInput,
  type VerifyReport,
} from "./dealVerify.ts";
import { loadReadOnlySettings } from "./settings.ts";

const EVENTS = parseAbi([
  "event ProviderRegistered(address indexed provider, uint16 indexed id, uint64 bond)",
  "event DealCreated(uint32 indexed dealId, address indexed owner, uint16 indexed providerId, bytes32 root, uint32 size, uint32 endBlock, uint64 price)",
  "event ChallengeOpened(uint32 indexed dealId, uint32 index, uint32 deadline)",
  "event ChallengePassed(uint32 indexed dealId)",
  "event ChallengeFailed(uint32 indexed dealId, uint64 slash)",
  "event Claimed(uint32 indexed dealId, uint64 amount)",
  "event Settled(uint32 indexed dealId, uint64 toProvider, uint64 remainder)",
]);

const READS = parseAbi([
  "function dealOf(uint32 dealId) view returns (address owner, uint32 startBlock, uint32 endBlock, uint16 providerId, uint8 flags, bytes32 root, uint24 leafCount, uint32 size, uint32 challengeIndex, uint32 challengeStart, uint64 price, uint64 claimed)",
  "function accruedOf(uint32 dealId) view returns (uint64 accrued, uint64 claimable)",
  "function challengeStateOf(uint32 dealId) view returns (bool open, uint32 index, uint32 start, uint32 deadline, uint32 expectedPathLength)",
  "function healthOf(uint32 dealId) view returns (uint8)",
  "function providerOf(address who) view returns (uint16 id, uint64 bond, uint24 activeDeals, bool registered)",
]);

const KEY_FLAGS = new Set(["--private-key", "--privatekey", "--key", "--secret", "--mnemonic", "--seed"]);

/** `verify` takes exactly one deal id and no options; a key on argv is refused like every command. */
export function parseVerifyArgv(argv: string[]): number {
  for (const arg of argv) {
    if (KEY_FLAGS.has(arg.toLowerCase())) {
      throw new Error("never pass a private key on argv; verify is read-only and needs no key");
    }
  }
  if (argv.length === 0) throw new Error("usage: makhzan verify <dealId>");
  if (argv.length > 1) throw new Error(`unexpected argument '${argv[1]}'`);
  if (!/^\d+$/.test(argv[0])) throw new Error(`dealId must be an integer, got ${JSON.stringify(argv[0])}`);
  const dealId = Number(argv[0]);
  if (!Number.isSafeInteger(dealId) || dealId <= 0 || dealId > 4_294_967_295) {
    throw new Error(`dealId must fit uint32 and be positive, got ${argv[0]}`);
  }
  return dealId;
}

interface RawLog {
  address: Hex;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
}

const topicFor = (value: number): Hex => `0x${value.toString(16).padStart(64, "0")}`;
const hexBlock = (value: bigint): Hex => `0x${value.toString(16)}`;

/**
 * `eth_getLogs` with a topic filter, splitting the range when the node refuses a wide span. Every
 * chunk that still fails is rethrown with the node's own words.
 */
async function rangeLogs(
  client: PublicClient,
  address: Hex,
  topics: (Hex | null)[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RawLog[]> {
  try {
    const logs = await client.request({
      method: "eth_getLogs",
      params: [{ address, fromBlock: hexBlock(fromBlock), toBlock: hexBlock(toBlock), topics }],
    });
    return logs as unknown as RawLog[];
  } catch (error) {
    if (toBlock - fromBlock > 5_000n) {
      const mid = fromBlock + (toBlock - fromBlock) / 2n;
      const head = await rangeLogs(client, address, topics, fromBlock, mid);
      const tail = await rangeLogs(client, address, topics, mid + 1n, toBlock);
      return [...head, ...tail];
    }
    throw new Error(`eth_getLogs ${fromBlock}..${toBlock}: ${(error as Error).message}`);
  }
}

/** Decode the logs of one deal into the small shape the pure verifier uses. */
export function logsToDealLogs(raw: RawLog[], dealId: number): DealLog[] {
  const bySelector = new Map(EVENTS.map((event) => [toEventSelector(event), event]));
  const out: DealLog[] = [];
  for (const log of raw) {
    const event = bySelector.get(log.topics[0]);
    if (!event) continue;
    let decoded: ReturnType<typeof decodeEventLog>;
    try {
      decoded = decodeEventLog({
        abi: [event],
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data,
      });
    } catch {
      continue;
    }
    const args = decoded.args as Record<string, unknown>;
    if (Number(args.dealId) !== dealId) continue;
    const block = Number(BigInt(log.blockNumber));
    const base = { block, txHash: log.transactionHash };
    switch (decoded.eventName) {
      case "DealCreated":
        out.push({
          ...base,
          kind: "created",
          root: args.root as Hex,
          size: Number(args.size),
          endBlock: Number(args.endBlock),
          price: args.price as bigint,
        });
        break;
      case "ChallengeOpened":
        out.push({ ...base, kind: "opened", index: Number(args.index), deadline: Number(args.deadline) });
        break;
      case "ChallengePassed":
        out.push({ ...base, kind: "passed" });
        break;
      case "ChallengeFailed":
        out.push({ ...base, kind: "failed", slash: args.slash as bigint });
        break;
      case "Claimed":
        out.push({ ...base, kind: "claimed", amount: args.amount as bigint });
        break;
      case "Settled":
        out.push({ ...base, kind: "settled", toProvider: args.toProvider as bigint, remainder: args.remainder as bigint });
        break;
      default:
        break;
    }
  }
  return out.sort((a, b) => a.block - b.block);
}

/** Find the provider address from ProviderRegistered(id), then read providerOf at the same block. */
async function readProvider(
  client: PublicClient,
  contract: Hex,
  providerId: number,
  block: bigint,
): Promise<{ provider: DealVerifyInput["provider"]; providerError: string | null }> {
  const selector = toEventSelector(EVENTS[0]);
  try {
    const logs = await rangeLogs(client, contract, [selector, null, topicFor(providerId)], 0n, block);
    const log = logs[0];
    if (!log) return { provider: null, providerError: `no ProviderRegistered event for id ${providerId}` };
    const decoded = decodeEventLog({
      abi: [EVENTS[0]],
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    });
    const address = (decoded.args as { provider: Hex }).provider;
    const [id, bond, activeDeals, registered] = await client.readContract({
      address: contract,
      abi: READS,
      functionName: "providerOf",
      args: [address],
      blockNumber: block,
    });
    return { provider: { id, bond, activeDeals, registered }, providerError: null };
  } catch (error) {
    return { provider: null, providerError: (error as Error).message };
  }
}

export async function fetchDealVerifyInput(
  client: PublicClient,
  contract: Hex,
  dealId: number,
  blockSize = DEFAULT_BLOCK_SIZE,
): Promise<DealVerifyInput> {
  const latestBlock = await client.getBlockNumber();
  const [owner, startBlock, endBlock, providerId, flags, root, leafCount, size, , , price, claimed] =
    await client.readContract({
      address: contract,
      abi: READS,
      functionName: "dealOf",
      args: [dealId],
      blockNumber: latestBlock,
    });
  if (owner === "0x0000000000000000000000000000000000000000") {
    throw new Error(`deal ${dealId} does not exist on ${contract} (owner is the zero address)`);
  }
  const [accrued, claimable] = await client.readContract({
    address: contract,
    abi: READS,
    functionName: "accruedOf",
    args: [dealId],
    blockNumber: latestBlock,
  });
  const [open, index, start, deadline] = await client.readContract({
    address: contract,
    abi: READS,
    functionName: "challengeStateOf",
    args: [dealId],
    blockNumber: latestBlock,
  });
  const health = await client.readContract({
    address: contract,
    abi: READS,
    functionName: "healthOf",
    args: [dealId],
    blockNumber: latestBlock,
  });
  const { provider, providerError } = await readProvider(client, contract, providerId, latestBlock);

  let logs: DealLog[] | null = null;
  let logsError: string | null = null;
  try {
    const raw = await rangeLogs(client, contract, [null, topicFor(dealId)], BigInt(startBlock), latestBlock);
    logs = logsToDealLogs(raw, dealId);
  } catch (error) {
    logsError = (error as Error).message;
  }

  return {
    dealId,
    blockSize,
    latestBlock: Number(latestBlock),
    deal: { owner, startBlock, endBlock, providerId, flags, root, leafCount, size, price, claimed },
    provider,
    providerError,
    accrued: { accrued, claimable },
    challenge: { open, index, start, deadline },
    health,
    logs,
    logsError,
  };
}

/** `makhzan verify <dealId>` with no key: print the report and return 0 only on PASS. */
export async function runVerify(
  argv: string[],
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): Promise<number> {
  const dealId = parseVerifyArgv(argv);
  const settings = loadReadOnlySettings(env);
  const chain = defineChain({
    id: settings.chainId,
    name: settings.network === "local" ? "makhzan-local" : `makhzan-${settings.chainId}`,
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
    rpcUrls: { default: { http: [settings.rpcUrl] } },
  });
  const client = createPublicClient({ chain, transport: http(settings.rpcUrl) });
  log(`makhzan verify ${dealId} — read-only: no key, no transaction`);
  log(`network ${settings.network.toUpperCase()} chain ${settings.chainId} contract ${settings.contract}`);
  const blockSize = env.MAKHZAN_BLOCK_SIZE ? Number(env.MAKHZAN_BLOCK_SIZE) : DEFAULT_BLOCK_SIZE;
  const input = await fetchDealVerifyInput(client, settings.contract, dealId, blockSize);
  log(`block ${input.latestBlock}`);
  const report: VerifyReport = verifyDeal(input);
  for (const line of renderVerify(report)) log(line);
  return report.result === "PASS" ? 0 : 1;
}
