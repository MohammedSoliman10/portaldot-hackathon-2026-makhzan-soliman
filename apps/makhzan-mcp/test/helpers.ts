/**
 * Shared fakes for the MCP tool tests. Nothing here touches a network: every `Reads` method returns
 * a value the test chose, so a wrong answer can only come from the tool logic.
 */
import type { Hex } from "viem";
import type { DealVerifyInput } from "../../makhzan/src/dealVerify.ts";
import type {
  ChallengeSnapshot,
  DealSnapshot,
  GateLockSnapshot,
  ProviderSnapshot,
  Reads,
} from "../src/reads.ts";

export const CONTRACT: Hex = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
export const GATE: Hex = "0x1111111111111111111111111111111111111111";
export const ROOT: Hex = `0x${"ab".repeat(32)}`;
export const PAYER: Hex = "0x0948EBD7637D1C32858a6FC5D947E85A6600205C";
export const PAYEE: Hex = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export const TPOT = 100_000_000_000_000n; // 1 tPOT = 1e14 planck

/** A deal whose whole history has already been checked by `verifyDeal`; shared by story and server tests. */
export function storyInput(): DealVerifyInput {
  const tx = (n: number): Hex => `0x${String(n).repeat(64).slice(0, 64)}` as Hex;
  return {
    dealId: 2,
    blockSize: 1024,
    latestBlock: 150,
    deal: {
      owner: PAYEE,
      startBlock: 100,
      endBlock: 200,
      providerId: 1,
      flags: 0,
      root: ROOT,
      leafCount: 2,
      size: 2048,
      price: 500_000_000_000_000n,
      claimed: 0n,
    },
    provider: { id: 1, bond: 2_400_000_000_000_000n, activeDeals: 0, registered: true },
    accrued: { accrued: 0n, claimable: 0n },
    challenge: { open: false, index: 0, start: 0, deadline: 0 },
    health: 1,
    logs: [
      { kind: "created", block: 100, txHash: tx(1), root: ROOT, size: 2048, endBlock: 200, price: 500_000_000_000_000n },
      { kind: "opened", block: 110, txHash: tx(2), index: 1, deadline: 160 },
      { kind: "passed", block: 120, txHash: tx(3) },
    ],
    logsError: null,
  };
}

export interface FakeReads extends Reads {
  calls: string[];
}

export function fakeReads(overrides: Partial<Reads> = {}): FakeReads {
  const calls: string[] = [];
  const deal = (id: number): DealSnapshot => ({
    id,
    owner: PAYER,
    startBlock: 172_578,
    endBlock: 172_878,
    providerId: 1,
    flags: 0,
    root: ROOT,
    leafCount: 1024,
    size: 1_048_576,
    price: 5n * TPOT,
    claimed: 0n,
  });
  const provider = (): ProviderSnapshot => ({
    id: 1,
    bond: 24n * TPOT,
    activeDeals: 0,
    registered: true,
  });
  const challenge = (): ChallengeSnapshot => ({ open: false, index: 0, start: 0, deadline: 0 });
  const gateLock = (): GateLockSnapshot => ({
    payer: PAYER,
    amount: 5n * TPOT,
    payee: PAYEE,
    minBond: 0n,
    status: 1,
  });

  const base: Reads = {
    chainId: async () => {
      calls.push("chainId");
      return 420_420_777;
    },
    blockNumber: async () => {
      calls.push("blockNumber");
      // 122 blocks before the default deal's endBlock, so the default fixture is inside its term.
      return 172_756;
    },
    deal: async (dealId) => {
      calls.push(`deal:${dealId}`);
      return deal(dealId);
    },
    health: async (dealId) => {
      calls.push(`health:${dealId}`);
      return 1;
    },
    provider: async (address) => {
      calls.push(`provider:${address}`);
      return provider();
    },
    accrued: async (dealId) => {
      calls.push(`accrued:${dealId}`);
      return { accrued: 0n, claimable: 0n };
    },
    challenge: async (dealId) => {
      calls.push(`challenge:${dealId}`);
      return challenge();
    },
    gateMakhzan: async () => {
      calls.push("gateMakhzan");
      return CONTRACT;
    },
    gateLock: async (dealId) => {
      calls.push(`gateLock:${dealId}`);
      return gateLock();
    },
  };

  return Object.assign({ calls }, base, overrides) as FakeReads;
}
