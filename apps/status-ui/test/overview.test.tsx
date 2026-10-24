import { describe, expect, it, vi } from "vitest";
import liveJson from "../public/evidence/portaldot-live-2026-10-24.json";
import { Overview } from "../src/pages/Overview";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
const TX = "0xf29a52c507726ceed20861f2cc4cc5f937542d0caa42a7e2a369ea08c998e3e7";
const LIVE_SLOT0 = "0x0000000189c00000006400000000000000038d7ea4c6800007d0040000000032";

const evidence = (): EvidenceBundle => liveJson as unknown as EvidenceBundle;
const live = () =>
  resolveMode(
    parseConfig({
      VITE_MAKHZAN_MODE: "LIVE",
      VITE_MAKHZAN_RPC_URL: "https://test-evm-rpc-v3.portaldot.dev",
      VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
    }),
  );

const evidenceState = () => ({ bundle: evidence(), verified: true, error: null, loading: false });

function liveClient(overrides: Partial<ReadClient> = {}): ReadClient {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
      functionName === "peek" ? [LIVE_SLOT0] : 0,
    ),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x60006000"),
    getBlockNumber: vi.fn(async () => 171406n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
    ...overrides,
  } as unknown as ReadClient;
}

describe("Overview, recorded", () => {
  it("shows the deployment identity from the evidence", () => {
    const { container, getByText } = renderApp(<Overview />, { evidence: evidenceState() });
    const text = container.textContent ?? "";
    expect(text).toContain(ADDRESS);
    expect(text).toContain(TX);
    expect(text).toContain("171,308");
    expect(text).toContain("420420777");
    expect(getByText(/runtime code hash/i)).toBeInTheDocument();
  });

  it("labels every number REPORTED or PENDING, never MEASURED, when no RPC is read", () => {
    const { container } = renderApp(<Overview />, { evidence: evidenceState() });
    const labels = [...container.querySelectorAll("[data-label]")].map((node) => node.getAttribute("data-label"));
    expect(labels.length).toBeGreaterThan(8);
    for (const label of labels) expect(["REPORTED", "PENDING LIVE RUN"]).toContain(label);
    expect(container.querySelector("[data-label='MEASURED']")).toBeNull();
  });

  it("states the on-chain config and the pending round status", () => {
    const { container } = renderApp(<Overview />, { evidence: evidenceState() });
    const text = container.textContent ?? "";
    for (const expected of ["50", "1,024", "2,000 bps", "10", "100", "100,800"]) {
      expect(text).toContain(expected);
    }
    expect(text).toMatch(/live challenge rounds/i);
    expect(text).toMatch(/pending/i);
  });

  it("links to the repository and the README", () => {
    const { getByRole } = renderApp(<Overview />, { evidence: evidenceState() });
    expect(getByRole("link", { name: /repository/i })).toHaveAttribute(
      "href",
      "https://github.com/MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman",
    );
    expect(getByRole("link", { name: /readme/i })).toHaveAttribute(
      "href",
      "https://github.com/MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman#readme",
    );
  });
});

describe("Overview, live overlay", () => {
  it("replaces the config with MEASURED values and a block/time source", async () => {
    const { container, findByTestId } = renderApp(<Overview client={liveClient()} />, {
      mode: live(),
      evidence: evidenceState(),
    });
    await findByTestId("live-source");
    const measured = [...container.querySelectorAll("[data-label='MEASURED']")];
    expect(measured.length).toBeGreaterThan(3);
    expect(container.textContent).toContain("171,406");
    expect(container.textContent).toMatch(/test-evm-rpc-v3\.portaldot\.dev/);
  });

  it("keeps the last good value and shows STALE after a failed re-read", async () => {
    let clock = Date.UTC(2026, 9, 24, 10, 0, 0);
    let calls = 0;
    const client = liveClient({
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        calls += 1;
        if (calls > 1) throw new Error("rpc down");
        return functionName === "peek" ? [LIVE_SLOT0] : 0;
      }),
    });

    const { findByTestId, getByRole, container } = renderApp(<Overview client={client} now={() => clock} />, {
      mode: live(),
      evidence: evidenceState(),
    });

    await findByTestId("live-source");
    clock += 31_000;
    getByRole("button", { name: /re-read/i }).click();

    await findByTestId("live-stale");
    expect(container.textContent).toContain("50");
  });
});
