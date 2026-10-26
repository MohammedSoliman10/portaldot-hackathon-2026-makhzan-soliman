import { describe, expect, it, vi } from "vitest";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { Judges } from "../src/pages/Judges";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
const SLOT0 = "0x0000000189c00000006400010000000200038d7ea4c6800007d0040000000032";
const RETRIEVAL_SHA256 = "0x7f2fd6d50bfe106c35d95a8aaef403c4b2ca53df7cb4ef1bca9b9fa8cb89e21e";
const DESIGN_NOTE =
  "Why not the native TransactionStorage pallet: it stores bytes but, as far as we can tell, has no promise, payment or penalty; Makhzan adds a bonded provider, a random challenge and a slash.";

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

function liveClient(): ReadClient {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "peek") return [SLOT0];
      if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
      if (functionName === "dealOf")
        return [
          "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
          172266,
          172416,
          1,
          1,
          "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7",
          1024,
          1048576,
          0,
          0,
          500000000000000n,
          500000000000000n,
        ];
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

describe("Judges, the walkthrough", () => {
  it("puts Overview, Deals, Proof and Verify in that order", () => {
    const { getAllByRole } = renderApp(<Judges />, { route: "/judges", evidence: evidenceState() });
    const steps = getAllByRole("link")
      .map((node) => node.getAttribute("href"))
      .filter((href) => ["/", "/deal/1", "/proof", "/verify"].includes(href ?? ""));
    expect(steps).toEqual(["/", "/deal/1", "/proof", "/verify"]);
  });

  it("lists every measured-live line with a label and an evidence link", () => {
    const { container, getAllByRole } = renderApp(<Judges />, {
      route: "/judges",
      evidence: evidenceState(),
    });
    const text = container.textContent ?? "";

    expect(text).toMatch(/deploy/i);
    expect(text).toContain("171,308");
    expect(text).toMatch(/register/i);
    expect(text).toContain("172,240");
    expect(text).toContain("172,585");
    expect(text).toContain("172,658");
    expect(text).toContain("30");
    expect(text).toContain("24");
    expect(text).toContain("6 tPOT");
    expect(text).toContain("172,557");
    expect(text).toContain("172,564");
    expect(text).toContain("172,881");
    expect(text).toContain("172,887");
    expect(text).toContain(RETRIEVAL_SHA256);
    expect(text).toMatch(/tamper/i);
    expect(text).toMatch(/rejected/i);

    const rows = [...container.querySelectorAll("[data-judges-row]")];
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const row of rows) {
      expect(row.querySelector("[data-label]")).not.toBeNull();
      const link = row.querySelector("a[href='/evidence/portaldot-live-run2.json']");
      expect(link).not.toBeNull();
    }
    expect(getAllByRole("link", { name: /evidence/i }).length).toBeGreaterThanOrEqual(7);
  });

  it("says what is not proven, and does not claim a size limit or retention", () => {
    const { container, getByRole } = renderApp(<Judges />, {
      route: "/judges",
      evidence: evidenceState(),
    });
    const box = getByRole("note", { name: /what is not proven/i });
    expect(box.textContent).toMatch(/no explorer/i);
    expect(box.textContent).toMatch(/same operator|independent/i);
    expect(container.textContent).not.toMatch(/retention period/i);
    expect(container.textContent).not.toMatch(/maximum file size/i);
  });

  it("carries exactly one DESIGN NOTE with the required reasoning", () => {
    const { getAllByText, container } = renderApp(<Judges />, {
      route: "/judges",
      evidence: evidenceState(),
    });
    expect(getAllByText(DESIGN_NOTE)).toHaveLength(1);
    expect(container.querySelectorAll("[data-label='DESIGN NOTE']")).toHaveLength(1);
  });
});

describe("Judges, live overlay", () => {
  it("adds the bond the chain holds now as MEASURED", async () => {
    const { container, findByTestId } = renderApp(<Judges client={liveClient()} />, {
      route: "/judges",
      mode: liveMode(),
      evidence: evidenceState(),
    });
    await findByTestId("judges-live");
    expect(container.textContent).toMatch(/24 tPOT/);
    expect(container.querySelectorAll("[data-label='MEASURED']").length).toBeGreaterThan(0);
  });
});
