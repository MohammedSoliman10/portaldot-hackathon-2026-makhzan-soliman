import { describe, expect, it, vi } from "vitest";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { Deal } from "../src/pages/Deal";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
const SLOT0 = "0x0000000189c00000006400010000000200038d7ea4c6800007d0040000000032";
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

/** A live chain whose deal 1 start block deliberately differs from the recorded 172266. */
function liveClient(overrides: Partial<ReadClient> = {}): ReadClient {
  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (functionName === "peek") return [SLOT0];
      if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
      if (functionName === "dealOf") {
        const id = Number(args?.[0]);
        return [OWNER, id === 1 ? 172300 : 172578, id === 1 ? 172450 : 172878, 1, 1, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 500000000000000n];
      }
      if (functionName === "healthOf") return 0;
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x60006000"),
    getBlockNumber: vi.fn(async () => 173200n),
    getBalance: vi.fn(async () => 24000000000000000000n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
    ...overrides,
  } as unknown as ReadClient;
}

describe("Deals, recorded", () => {
  it("lists deal 1 and deal 2 with price, blocks, state and evidence", () => {
    const { container, getAllByRole } = renderApp(<Deal />, { route: "/deal/1", evidence: evidenceState() });
    const text = container.textContent ?? "";
    expect(text).toContain("Deal 1");
    expect(text).toContain("Deal 2");
    expect(text).toContain("5 tPOT");
    expect(text).toContain("172,266");
    expect(text).toContain("172,416");
    expect(text).toContain("172,578");
    expect(text).toContain("172,878");
    expect(text).toMatch(/settled/);
    const links = getAllByRole("link", { name: /evidence/i }).map((node) => node.getAttribute("href"));
    expect(links.every((href) => href === "/evidence/portaldot-live-run2.json")).toBe(true);
  });

  it("labels recorded deal facts REPORTED and shows no MEASURED value without an RPC", () => {
    const { container } = renderApp(<Deal />, { route: "/deal/2", evidence: evidenceState() });
    const labels = [...container.querySelectorAll("[data-label]")].map((node) => node.getAttribute("data-label"));
    expect(labels.length).toBeGreaterThan(3);
    for (const label of labels) expect(label).toBe("REPORTED");
  });
});

describe("Deals, live overlay", () => {
  it("replaces start, end and health with MEASURED values read from the chain", async () => {
    const { container, findByTestId } = renderApp(<Deal client={liveClient()} />, {
      route: "/deal/1",
      mode: liveMode(),
      evidence: evidenceState(),
    });
    await findByTestId("deal-live");
    const text = container.textContent ?? "";
    expect(text).toContain("172,300");
    expect(text).toContain("172,450");
    expect(container.querySelectorAll("[data-label='MEASURED']").length).toBeGreaterThan(3);
    expect(text).toMatch(/health/i);
    expect(text).toMatch(/settled/i);
  });
});
