/**
 * The read surface the tools are written against: nine view calls, nothing else.
 *
 * The tools never see a signer, a wallet client or a transaction; they see this interface. That is
 * what makes "read-only" checkable rather than a promise: there is no method here that could change
 * state, and the tests inject a fake to prove a wrong answer can only come from the tool logic.
 */
import {
  createPublicClient,
  defineChain,
  http,
  parseAbi,
  type Hex,
  type PublicClient,
} from "viem";
import { withRetry } from "./retry.ts";

export interface DealSnapshot {
  id: number;
  owner: Hex;
  startBlock: number;
  endBlock: number;
  providerId: number;
  /** bit 0 = settled */
  flags: number;
  root: Hex;
  leafCount: number;
  size: number;
  price: bigint;
  claimed: bigint;
}

export interface ProviderSnapshot {
  id: number;
  bond: bigint;
  activeDeals: number;
  registered: boolean;
}

export interface ChallengeSnapshot {
  open: boolean;
  index: number;
  start: number;
  deadline: number;
}

export interface AccruedSnapshot {
  accrued: bigint;
  claimable: bigint;
}

export interface GateLockSnapshot {
  payer: Hex;
  amount: bigint;
  payee: Hex;
  /** Provider bond floor in planck; 0 means the gate does not check the bond. */
  minBond: bigint;
  /** 0 none, 1 locked, 2 released, 3 refunded. */
  status: number;
}

export interface Reads {
  chainId(): Promise<number>;
  blockNumber(): Promise<number>;
  deal(dealId: number): Promise<DealSnapshot>;
  health(dealId: number): Promise<number>;
  provider(address: Hex): Promise<ProviderSnapshot>;
  accrued(dealId: number): Promise<AccruedSnapshot>;
  challenge(dealId: number): Promise<ChallengeSnapshot>;
  gateMakhzan(): Promise<Hex>;
  gateLock(dealId: number): Promise<GateLockSnapshot>;
}

const MAKHZAN_READS = parseAbi([
  "function dealOf(uint32 dealId) view returns (address owner, uint32 startBlock, uint32 endBlock, uint16 providerId, uint8 flags, bytes32 root, uint24 leafCount, uint32 size, uint32 challengeIndex, uint32 challengeStart, uint64 price, uint64 claimed)",
  "function healthOf(uint32 dealId) view returns (uint8)",
  "function providerOf(address who) view returns (uint16 id, uint64 bond, uint24 activeDeals, bool registered)",
  "function accruedOf(uint32 dealId) view returns (uint64 accrued, uint64 claimable)",
  "function challengeStateOf(uint32 dealId) view returns (bool open, uint32 index, uint32 start, uint32 deadline, uint32 expectedPathLength)",
]);

const GATE_READS = parseAbi([
  "function makhzan() view returns (address)",
  "function lockOf(uint32 dealId) view returns (address payer, uint96 amount, address payee, uint64 minBond, uint8 status)",
]);

export const ZERO_ADDRESS: Hex = "0x0000000000000000000000000000000000000000";

/** A read that cannot succeed on a second attempt: the deal is not there. */
export class MissingDealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingDealError";
  }
}

/**
 * True for a refusal that a retry cannot change. `fetchDealVerifyInput` in the CLI raises the same
 * wording as a plain Error, so its message is recognised too rather than restated here.
 */
export function isMissingDeal(error: unknown): boolean {
  if (error instanceof MissingDealError) return true;
  return error instanceof Error && /deal \d+ does not exist on 0x[0-9a-fA-F]{40}/.test(error.message);
}

export interface ViemReadsOptions {
  gate: Hex | null;
  timeoutMs: number;
}

/** Builds the read surface over a real node. Every call is retried once inside `timeoutMs`. */
export function viemReads(client: PublicClient, options: ViemReadsOptions): Reads {
  const at = (label: string) => <T>(fn: () => Promise<T>): Promise<T> =>
    withRetry(label, fn, {
      timeoutMs: options.timeoutMs,
      retryable: (error) => !(error instanceof MissingDealError),
    });
  const gate = (): Hex => {
    if (!options.gate) throw new Error("no gate address is configured (MAKHZAN_GATE is unset)");
    return options.gate;
  };

  return {
    chainId: () => at("eth_chainId")(() => client.getChainId()),
    blockNumber: () => at("eth_blockNumber")(async () => Number(await client.getBlockNumber())),

    deal: (dealId) =>
      at("dealOf")(async () => {
        const [owner, startBlock, endBlock, providerId, flags, root, leafCount, size, , , price, claimed] =
          await client.readContract({
            address: contractOf(client),
            abi: MAKHZAN_READS,
            functionName: "dealOf",
            args: [dealId],
          });
        if (owner === ZERO_ADDRESS) {
          throw new MissingDealError(
            `deal ${dealId} does not exist on ${contractOf(client)} (owner is the zero address)`,
          );
        }
        return { id: dealId, owner, startBlock, endBlock, providerId, flags, root, leafCount, size, price, claimed };
      }),
    health: (dealId) =>
      at("healthOf")(() =>
        client.readContract({
          address: contractOf(client),
          abi: MAKHZAN_READS,
          functionName: "healthOf",
          args: [dealId],
        }) as Promise<number>,
      ),
    provider: (address) =>
      at("providerOf")(async () => {
        const [id, bond, activeDeals, registered] = await client.readContract({
          address: contractOf(client),
          abi: MAKHZAN_READS,
          functionName: "providerOf",
          args: [address],
        });
        return { id, bond, activeDeals, registered };
      }),
    accrued: (dealId) =>
      at("accruedOf")(async () => {
        const [accrued, claimable] = await client.readContract({
          address: contractOf(client),
          abi: MAKHZAN_READS,
          functionName: "accruedOf",
          args: [dealId],
        });
        return { accrued, claimable };
      }),
    challenge: (dealId) =>
      at("challengeStateOf")(async () => {
        const [open, index, start, deadline] = await client.readContract({
          address: contractOf(client),
          abi: MAKHZAN_READS,
          functionName: "challengeStateOf",
          args: [dealId],
        });
        return { open, index, start, deadline };
      }),
    gateMakhzan: () =>
      at("makhzan()")(() =>
        client.readContract({ address: gate(), abi: GATE_READS, functionName: "makhzan" }) as Promise<Hex>,
      ),
    gateLock: (dealId) =>
      at("lockOf")(async () => {
        const [payer, amount, payee, minBond, status] = await client.readContract({
          address: gate(),
          abi: GATE_READS,
          functionName: "lockOf",
          args: [dealId],
        });
        return { payer, amount, payee, minBond, status };
      }),
  };
}

/**
 * The Makhzan address the client was built for. It is attached at construction because `Reads` has no
 * address argument: a tool asks about a deal, never about a contract.
 */
const CONTRACTS = new WeakMap<PublicClient, Hex>();

export function makeReadClient(options: {
  rpcUrl: string;
  chainId: number;
  contract: Hex;
  gate: Hex | null;
  timeoutMs: number;
}): PublicClient {
  const chain = defineChain({
    id: options.chainId,
    name: `portaldot-${options.chainId}`,
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 14 },
    rpcUrls: { default: { http: [options.rpcUrl] } },
  });
  const client = createPublicClient({
    chain,
    transport: http(options.rpcUrl, { timeout: options.timeoutMs, retryCount: 0 }),
  });
  CONTRACTS.set(client, options.contract);
  return client;
}

function contractOf(client: PublicClient): Hex {
  const contract = CONTRACTS.get(client);
  if (!contract) throw new Error("the read client was not built by makeReadClient, so no contract is attached");
  return contract;
}
