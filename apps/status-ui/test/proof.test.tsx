import { describe, expect, it, vi } from "vitest";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { Proof } from "../src/pages/Proof";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
const SLOT0 = "0x0000000189c00000006400010000000200038d7ea4c6800007d0040000000032";
const RESOLVE = "0x97da004710a5e01ea97b9d602f5b8ef5c5382ea5800c5d52b02951cb6809e8a3";

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

function liveClient(bond: bigint = 2400000000000000n): ReadClient {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "peek") return [SLOT0];
      if (functionName === "providerOf") return [1, bond, 0n, true];
      if (functionName === "dealOf") return ["0x0948EBD7637D1C32858a6FC5D947E85A6600205C", 172266, 172416, 1, 1, "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7", 1024, 1048576, 0, 0, 500000000000000n, 500000000000000n];
      if (functionName === "healthOf") return 0;
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x60006000"),
    getBlockNumber: vi.fn(async () => 173200n),
    getBalance: vi.fn(async () => 24000000000000000000n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
  } as unknown as ReadClient;
}

describe("Proof, recorded", () => {
  it("tells the slash story with before and after numbers", () => {
    const { container } = renderApp(<Proof />, { route: "/proof", evidence: evidenceState() });
    const text = container.textContent ?? "";
    expect(text).toContain("30");
    expect(text).toContain("24");
    expect(text).toContain("6 tPOT");
    expect(text).toMatch(/20%/);
    expect(text).toContain(RESOLVE);
    expect(text).toContain("172,658");
  });

  it("labels every proof number REPORTED when there is no live read", () => {
    const { container } = renderApp(<Proof />, { route: "/proof", evidence: evidenceState() });
    const labels = [...container.querySelectorAll("[data-label]")].map((node) => node.getAttribute("data-label"));
    expect(labels.length).toBeGreaterThan(4);
    for (const label of labels) expect(label).toBe("REPORTED");
  });
});

describe("Proof, live overlay", () => {
  it("adds the bond the chain holds now as MEASURED", async () => {
    const { container, findByTestId } = renderApp(<Proof client={liveClient()} />, {
      route: "/proof",
      mode: liveMode(),
      evidence: evidenceState(),
    });
    await findByTestId("proof-live");
    const text = container.textContent ?? "";
    expect(text).toMatch(/24/);
    expect(container.querySelectorAll("[data-label='MEASURED']").length).toBeGreaterThan(0);
  });
});
