import { parseAbi } from "viem";
import { runRead, type ReadClient, type ReadResult } from "./client";
import { decodeSlot0, type PeekConfig } from "./peek";
import type { Hex } from "./schema";

/**
 * The read surface, copied field for field from `apps/makhzan/src/chain.ts`. Every entry is a view:
 * there is no write function in this ABI, so the app cannot construct one by accident.
 */
export const ABI = parseAbi([
  "function peek(uint256 slot) view returns (bytes32)",
  "function providerOf(address who) view returns (uint16 id, uint64 bond, uint24 activeDeals, bool registered)",
  "function dealOf(uint32 dealId) view returns (address owner, uint32 startBlock, uint32 endBlock, uint16 providerId, uint8 flags, bytes32 root, uint24 leafCount, uint32 size, uint32 challengeIndex, uint32 challengeStart, uint64 price, uint64 claimed)",
  "function challengeStateOf(uint32 dealId) view returns (bool open, uint32 index, uint32 start, uint32 deadline, uint32 expectedPathLength)",
  "function accruedOf(uint32 dealId) view returns (uint64 accrued, uint64 claimable)",
  "function healthOf(uint32 dealId) view returns (uint8)",
]);

export const VIEW_FUNCTIONS = [
  "peek",
  "providerOf",
  "dealOf",
  "challengeStateOf",
  "accruedOf",
  "healthOf",
] as const;

export interface ProviderView {
  id: number;
  bondUnits: string;
  activeDeals: number;
  registered: boolean;
}

export interface DealRead {
  owner: Hex;
  startBlock: number;
  endBlock: number;
  providerId: number;
  flags: number;
  root: Hex;
  leafCount: number;
  size: number;
  challengeIndex: number;
  challengeStart: number;
  priceUnits: string;
  claimedUnits: string;
}

export interface ChallengeRead {
  open: boolean;
  index: number;
  start: number;
  deadline: number;
  expectedPathLength: number;
}

export interface AccruedRead {
  accruedUnits: string;
  claimableUnits: string;
}

const tuple = (value: unknown): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error("malformed read: expected a tuple");
  return value;
};

export function peekConfig(client: ReadClient, address: Hex): Promise<ReadResult<PeekConfig>> {
  return runRead(async () => {
    const raw = (await client.readContract({ address, abi: ABI, functionName: "peek", args: [0n] })) as Hex;
    return decodeSlot0(raw);
  });
}

export function providerOf(client: ReadClient, address: Hex, who: Hex): Promise<ReadResult<ProviderView>> {
  return runRead(async () => {
    const [id, bond, activeDeals, registered] = tuple(
      await client.readContract({ address, abi: ABI, functionName: "providerOf", args: [who] }),
    );
    return {
      id: Number(id),
      bondUnits: String(bond),
      activeDeals: Number(activeDeals),
      registered: Boolean(registered),
    };
  });
}

export function dealOf(client: ReadClient, address: Hex, dealId: number): Promise<ReadResult<DealRead>> {
  return runRead(async () => {
    const fields = tuple(
      await client.readContract({ address, abi: ABI, functionName: "dealOf", args: [dealId] }),
    );
    return {
      owner: String(fields[0]) as Hex,
      startBlock: Number(fields[1]),
      endBlock: Number(fields[2]),
      providerId: Number(fields[3]),
      flags: Number(fields[4]),
      root: String(fields[5]) as Hex,
      leafCount: Number(fields[6]),
      size: Number(fields[7]),
      challengeIndex: Number(fields[8]),
      challengeStart: Number(fields[9]),
      priceUnits: String(fields[10]),
      claimedUnits: String(fields[11]),
    };
  });
}

export function challengeStateOf(
  client: ReadClient,
  address: Hex,
  dealId: number,
): Promise<ReadResult<ChallengeRead>> {
  return runRead(async () => {
    const [open, index, start, deadline, expectedPathLength] = tuple(
      await client.readContract({ address, abi: ABI, functionName: "challengeStateOf", args: [dealId] }),
    );
    return {
      open: Boolean(open),
      index: Number(index),
      start: Number(start),
      deadline: Number(deadline),
      expectedPathLength: Number(expectedPathLength),
    };
  });
}

export function accruedOf(client: ReadClient, address: Hex, dealId: number): Promise<ReadResult<AccruedRead>> {
  return runRead(async () => {
    const [accrued, claimable] = tuple(
      await client.readContract({ address, abi: ABI, functionName: "accruedOf", args: [dealId] }),
    );
    return { accruedUnits: String(accrued), claimableUnits: String(claimable) };
  });
}

export function healthOf(client: ReadClient, address: Hex, dealId: number): Promise<ReadResult<number>> {
  return runRead(async () => {
    const value = await client.readContract({ address, abi: ABI, functionName: "healthOf", args: [dealId] });
    const health = Number(value);
    if (![0, 1, 2, 3].includes(health)) throw new Error(`malformed health value ${String(value)}`);
    return health;
  });
}

export function codeOf(client: ReadClient, address: Hex): Promise<ReadResult<Hex>> {
  return runRead(async () => (await client.getCode({ address })) ?? "0x");
}
