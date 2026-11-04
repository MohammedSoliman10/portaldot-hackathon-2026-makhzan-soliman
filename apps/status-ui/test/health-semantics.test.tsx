import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { Deal } from "../src/pages/Deal";
import { Overview } from "../src/pages/Overview";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";
import { HEALTH_TEXT, healthLabel } from "../src/data/health";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
const SLOT0_DEAL1 = "0x0000000189c00000006400010000000100038d7ea4c6800007d0040000000032";
const OWNER = "0x0948EBD7637D1C32858a6FC5D947E85A6600205C";
const ROOT = "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7";

const evidence = (): EvidenceBundle => run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle: evidence(), verified: true, error: null, loading: false });
const liveMode = () =>
  resolveMode(
    parseConfig({
      VITE_MAKHZAN_MODE: "LIVE",
      VITE_MAKHZAN_RPC_URL: "https://test-evm-rpc-v3.portaldot.dev",
      VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
    }),
  );

function mockClientWithHealth(healthCode: number, blockNumber: bigint = 300000n, endBlock: number = 200000): ReadClient {
  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (functionName === "peek") return [SLOT0_DEAL1];
      if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
      if (functionName === "dealOf") {
        return [OWNER, 100000, endBlock, 1, 0, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 0n];
      }
      if (functionName === "healthOf") {
        return healthCode;
      }
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x60006000"),
    getBlockNumber: vi.fn(async () => blockNumber),
    getBalance: vi.fn(async () => 24000000000000000000n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
  } as unknown as ReadClient;
}

describe("Health semantics contract alignment", () => {
  it("maps code 0 to none or settled", () => {
    expect(HEALTH_TEXT[0]).toBe("none or settled");
    expect(healthLabel(0)).toBe("none or settled");
  });

  it("maps code 1 to healthy and stays healthy even past end block", () => {
    expect(HEALTH_TEXT[1]).toBe("healthy");
    expect(healthLabel(1)).toBe("healthy");
  });

  it("maps code 2 to challenge open inside its window and never labels as faulted or failed", () => {
    expect(HEALTH_TEXT[2]).toBe("challenge open inside its window");
    expect(healthLabel(2)).toBe("challenge open inside its window");
    expect(healthLabel(2)).not.toMatch(/faulted|failed/i);
  });

  it("maps code 3 to challenge open past its deadline (provider in default)", () => {
    expect(HEALTH_TEXT[3]).toBe("challenge open past its deadline (provider in default)");
    expect(healthLabel(3)).toBe("challenge open past its deadline (provider in default)");
  });

  it("maps any unknown code (4, 99, 255) to unknown rather than a guess", () => {
    expect(healthLabel(4)).toBe("unknown");
    expect(healthLabel(99)).toBe("unknown");
    expect(healthLabel(255)).toBe("unknown");
    expect(healthLabel(4)).not.toBe("settled");
    expect(healthLabel(4)).not.toBe("healthy");
  });

  it("renders code 0 as 'none or settled' on Deal page", async () => {
    const { findByTestId, container } = renderApp(
      <Routes>
        <Route path="/deal/:id" element={<Deal client={mockClientWithHealth(0)} />} />
      </Routes>,
      { route: "/deal/1", mode: liveMode(), evidence: evidenceState() },
    );
    await findByTestId("deal-live");
    expect(container.textContent).toContain("none or settled");
  });

  it("renders code 1 as 'healthy' on Deal page even past the end block", async () => {
    // Current block (300,000) > endBlock (200,000): healthOf remains 1 (healthy)
    const { findByTestId, container } = renderApp(
      <Routes>
        <Route path="/deal/:id" element={<Deal client={mockClientWithHealth(1, 300000n, 200000)} />} />
      </Routes>,
      { route: "/deal/1", mode: liveMode(), evidence: evidenceState() },
    );
    await findByTestId("deal-live");
    const deal1 = container.querySelector("#deal-1");
    expect(deal1?.textContent).toMatch(/health.*healthy/i);
    // Must NOT be overridden to expired on the health field
    expect(deal1?.textContent).not.toMatch(/health.*expired/i);
  });

  it("renders code 2 as 'challenge open inside its window' and not faulted or failed on Deal page", async () => {
    const { findByTestId, container } = renderApp(
      <Routes>
        <Route path="/deal/:id" element={<Deal client={mockClientWithHealth(2)} />} />
      </Routes>,
      { route: "/deal/1", mode: liveMode(), evidence: evidenceState() },
    );
    await findByTestId("deal-live");
    const deal1 = container.querySelector("#deal-1");
    expect(deal1?.textContent).toContain("challenge open inside its window");
    expect(deal1?.textContent).not.toMatch(/faulted|failed/i);
  });

  it("renders code 3 as 'challenge open past its deadline (provider in default)' on Deal page", async () => {
    const { findByTestId, container } = renderApp(
      <Routes>
        <Route path="/deal/:id" element={<Deal client={mockClientWithHealth(3)} />} />
      </Routes>,
      { route: "/deal/1", mode: liveMode(), evidence: evidenceState() },
    );
    await findByTestId("deal-live");
    const deal1 = container.querySelector("#deal-1");
    expect(deal1?.textContent).toContain("challenge open past its deadline (provider in default)");
  });

  it("renders unknown code 4 as 'unknown' rather than a guess on Deal page", async () => {
    const { findByTestId, container } = renderApp(
      <Routes>
        <Route path="/deal/:id" element={<Deal client={mockClientWithHealth(4)} />} />
      </Routes>,
      { route: "/deal/1", mode: liveMode(), evidence: evidenceState() },
    );
    await findByTestId("deal-live");
    const deal1 = container.querySelector("#deal-1");
    expect(deal1?.textContent).toMatch(/health.*unknown/i);
  });
});
