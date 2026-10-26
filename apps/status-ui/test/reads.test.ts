import { describe, expect, it, vi } from "vitest";
import {
  CircuitBreaker,
  TRANSPORT,
  checkChain,
  createReadClient,
  runRead,
} from "../src/data/client";
import {
  accruedOf,
  challengeStateOf,
  codeOf,
  dealOf,
  healthOf,
  peekConfig,
  providerOf,
} from "../src/data/reads";
import { resolveMode } from "../src/config/modes";
import { parseConfig } from "../src/config/env";
import type { ReadClient } from "../src/data/client";

const ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const PROVIDER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const DEAL_ROOT = "0xd6bcfc4d0c933f0680ec2e7b1c0ea8aecba797de45bf726ae0ca4c8c286325b7";
const SLOT0 = "0x0000000003e80000000a000100000003002386f26fc1000007d004000000000a";

function mockClient(overrides: Partial<ReadClient> = {}): ReadClient {
  return {
    readContract: vi.fn(async () => {
      throw new Error("unexpected readContract call");
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x6000"),
    getBlockNumber: vi.fn(async () => 56n),
    getBlock: vi.fn(async () => ({ timestamp: 1700000000n })),
    ...overrides,
  } as unknown as ReadClient;
}

describe("client construction", () => {
  it("pins the reliability envelope", () => {
    expect(TRANSPORT).toEqual({ timeout: 4000, retryCount: 2, retryDelay: 300 });
  });

  it("creates no client in RECORDED", () => {
    const mode = resolveMode(parseConfig({}));
    expect(mode.mode).toBe("RECORDED");
    expect(createReadClient(mode)).toBeNull();
  });

  it("creates a read-only client for a live mode with an address", () => {
    const mode = resolveMode(
      parseConfig({
        VITE_MAKHZAN_MODE: "LOCAL",
        VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
        VITE_MAKHZAN_RPC_URL: "http://127.0.0.1:1",
      }),
    );
    const client = createReadClient(mode);
    expect(client).not.toBeNull();
    expect(typeof client?.readContract).toBe("function");
    // No wallet surface: a public client has no account, no send and no signing method.
    expect((client as unknown as Record<string, unknown>).account).toBeUndefined();
    expect((client as unknown as Record<string, unknown>).sendTransaction).toBeUndefined();
    expect((client as unknown as Record<string, unknown>).signMessage).toBeUndefined();
  });

  it("retries a failing HTTP call three times in total", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const mode = resolveMode(
      parseConfig({
        VITE_MAKHZAN_MODE: "LOCAL",
        VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
        VITE_MAKHZAN_RPC_URL: "http://127.0.0.1:1",
      }),
    );
    const client = createReadClient(mode)!;
    await expect(client.getChainId()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("runRead", () => {
  it("returns a measured value with a UTC timestamp", async () => {
    const result = await runRead(async () => 42, { now: () => Date.UTC(2026, 9, 23, 8, 30, 0), block: 56 });
    expect(result.value).toBe(42);
    expect(result.label).toBe("MEASURED");
    expect(result.at).toBe("2026-10-23T08:30:00.000Z");
    expect(result.block).toBe(56);
    expect(result.error).toBeNull();
  });

  it("times out a hung read", async () => {
    const result = await runRead(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      { timeoutMs: 20 },
    );
    expect(result.value).toBeNull();
    expect(result.error?.kind).toBe("timeout");
  });

  it("stops calling the transport after three consecutive failures", async () => {
    const breaker = new CircuitBreaker(3, 30_000);
    const failing = vi.fn(async () => {
      throw new Error("rpc down");
    });
    for (let i = 0; i < 3; i += 1) {
      const result = await runRead(failing, { breaker });
      expect(result.error?.kind).toBe("rpc");
    }
    expect(breaker.open).toBe(true);
    const shorted = await runRead(failing, { breaker });
    expect(shorted.error?.message).toMatch(/circuit/i);
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it("closes the breaker again after a success", async () => {
    const breaker = new CircuitBreaker(3, 30_000);
    await runRead(async () => 1, { breaker });
    expect(breaker.open).toBe(false);
  });

  it("aborts on an external signal", async () => {
    const controller = new AbortController();
    const pending = runRead(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      { signal: controller.signal },
    );
    controller.abort();
    const result = await pending;
    expect(result.value).toBeNull();
    expect(result.error?.message).toMatch(/abort/i);
  });

  it("classifies a revert without inventing a value", async () => {
    const result = await runRead(async () => {
      throw new Error("execution reverted: HealthUnavailable");
    });
    expect(result.value).toBeNull();
    expect(result.error?.kind).toBe("reverted");
  });
});

describe("chain guard", () => {
  it("accepts the expected chain id", async () => {
    const result = await checkChain(mockClient(), 420420777);
    expect(result.ok).toBe(true);
    expect(result.observed).toBe(420420777);
  });

  it("blocks a mismatch and names both ids", async () => {
    const result = await checkChain(mockClient({ getChainId: async () => 31337 }), 420420777);
    expect(result.ok).toBe(false);
    expect(result.observed).toBe(31337);
    expect(result.message).toContain("420420777");
    expect(result.message).toContain("31337");
  });
});

describe("the seven view calls", () => {
  const reads: Record<string, unknown> = {
    peek: [SLOT0],
    providerOf: [1n, 8_000_000_000_000_000n, 0n, true],
    dealOf: [
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      34,
      54,
      1,
      1,
      DEAL_ROOT,
      8,
      8192,
      0,
      0,
      5_000_000_000_000_000n,
      5_000_000_000_000_000n,
    ],
    challengeStateOf: [false, 1, 35, 45, 3],
    accruedOf: [2_000_000_000_000_000n, 0n],
    healthOf: 1,
  };

  const client = mockClient({
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => reads[functionName]),
  });

  it("peek decodes the packed config", async () => {
    const result = await peekConfig(client, ADDRESS);
    expect(result.value?.challengeWindowBlocks).toBe(10);
    expect(result.value?.nextDealId).toBe(3);
  });

  it("providerOf returns id, bond, active deals and registration", async () => {
    const result = await providerOf(client, ADDRESS, PROVIDER);
    expect(result.value).toEqual({ id: 1, bondUnits: "8000000000000000", activeDeals: 0, registered: true });
  });

  it("dealOf maps all twelve fields", async () => {
    const result = await dealOf(client, ADDRESS, 2);
    expect(result.value).toMatchObject({
      owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      startBlock: 34,
      endBlock: 54,
      providerId: 1,
      flags: 1,
      root: DEAL_ROOT,
      leafCount: 8,
      size: 8192,
      challengeIndex: 0,
      challengeStart: 0,
      priceUnits: "5000000000000000",
      claimedUnits: "5000000000000000",
    });
  });

  it("challengeStateOf maps open, index, start, deadline and path length", async () => {
    const result = await challengeStateOf(client, ADDRESS, 2);
    expect(result.value).toEqual({ open: false, index: 1, start: 35, deadline: 45, expectedPathLength: 3 });
  });

  it("accruedOf returns accrued and claimable as decimal strings", async () => {
    const result = await accruedOf(client, ADDRESS, 2);
    expect(result.value).toEqual({ accruedUnits: "2000000000000000", claimableUnits: "0" });
  });

  it("healthOf returns the four-value vocabulary", async () => {
    const result = await healthOf(client, ADDRESS, 2);
    expect(result.value).toBe(1);
  });

  it("codeOf returns the runtime code hash input", async () => {
    const result = await codeOf(mockClient({ getCode: async () => "0x60006000" }), ADDRESS);
    expect(result.value).toBe("0x60006000");
  });

  it("never calls a non-view function", async () => {
    const spy = vi.fn(async ({ functionName }: { functionName: string }) => reads[functionName]);
    const viewClient = mockClient({ readContract: spy });
    await peekConfig(viewClient, ADDRESS);
    await providerOf(viewClient, ADDRESS, PROVIDER);
    await dealOf(viewClient, ADDRESS, 2);
    await challengeStateOf(viewClient, ADDRESS, 2);
    await accruedOf(viewClient, ADDRESS, 2);
    await healthOf(viewClient, ADDRESS, 2);
    const names = spy.mock.calls.map(([args]) => (args as { functionName: string }).functionName);
    expect(names).toEqual(["peek", "providerOf", "dealOf", "challengeStateOf", "accruedOf", "healthOf"]);
  });
});
