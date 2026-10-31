import { describe, expect, it, vi, beforeEach } from "vitest";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { Overview } from "../src/pages/Overview";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
// Slot0 with nextDealId = 6 (5 deals created: 1, 2, 3, 4, 5)
const SLOT0_DEALS5 = "0x0000000189c00000006400010000000600038d7ea4c6800007d0040000000032";
const OWNER = "0x0948EBD7637D1C32858a6FC5D947E85A6600205C";
const ROOT = "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7";

const evidence = (): EvidenceBundle => run2 as unknown as EvidenceBundle;
const liveMode = () =>
  resolveMode(
    parseConfig({
      VITE_MAKHZAN_MODE: "LIVE",
      VITE_MAKHZAN_RPC_URL: "https://test-evm-rpc-v3.portaldot.dev",
      VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
    }),
  );

const evidenceState = () => ({ bundle: evidence(), verified: true, error: null, loading: false });

function makeMockClient(options: {
  slot0?: string;
  blockNumber?: bigint;
  failDeals?: boolean;
} = {}): ReadClient {
  const slot0 = options.slot0 ?? SLOT0_DEALS5;
  const currentBlock = options.blockNumber ?? 260000n;

  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (functionName === "peek") return [slot0];
      if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
      if (options.failDeals && (functionName === "dealOf" || functionName === "healthOf")) {
        throw new Error("RPC timeout: cannot fetch deals");
      }
      if (functionName === "dealOf") {
        const id = Number(args?.[0]);
        // Deal 1: ended & settled
        if (id === 1) return [OWNER, 172266, 172416, 1, 1, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 500000000000000n];
        // Deal 2: ended & settled
        if (id === 2) return [OWNER, 172578, 172878, 1, 1, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 500000000000000n];
        // Deal 3: ended & settled
        if (id === 3) return [OWNER, 250092, 250692, 1, 1, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 500000000000000n];
        // Deal 4: ended & settled
        if (id === 4) return [OWNER, 252512, 255512, 1, 1, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 500000000000000n];
        // Deal 5: ended, not settled (endBlock 255544 < currentBlock 260000, health 1)
        if (id === 5) return [OWNER, 252544, 255544, 1, 0, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 0n];
        return [OWNER, 250000, 270000, 1, 0, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 0n];
      }
      if (functionName === "healthOf") {
        const id = Number(args?.[0]);
        if (id === 5) return 1; // Unsettled, block >= endBlock -> "term ended, not settled"
        return 0; // Deals 1-4 are settled -> "settled or none"
      }
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x60006000"),
    getBlockNumber: vi.fn(async () => currentBlock),
    getBalance: vi.fn(async () => 24000000000000000000n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
  } as unknown as ReadClient;
}

describe("Overview - Live Deals Index, Derived Stats, and Gate Demo", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders live-derived stats strip in live mode with MEASURED chips", async () => {
    const client = makeMockClient();
    const { findByTestId } = renderApp(<Overview client={client} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const statsStrip = await findByTestId("overview-stats-strip");
    const scope = within(statsStrip);

    // deals created: nextDealId - 1 = 5
    expect(scope.getByText("5")).toBeInTheDocument();
    expect(scope.getByText(/deals created/i)).toBeInTheDocument();

    // settled count: 4 (deals 1-4 have health 0)
    expect(scope.getByText("4")).toBeInTheDocument();
    expect(scope.getByText(/^settled$/i)).toBeInTheDocument();

    // healthy now: 0 (deal 5 is past endBlock)
    expect(scope.getByText("0")).toBeInTheDocument();
    expect(scope.getByText(/healthy now/i)).toBeInTheDocument();

    // 6 tPOT slashed kept as REPORTED
    expect(scope.getByText("6 tPOT")).toBeInTheDocument();
    expect(scope.getByText(/slashed = exactly 20% of the bond/i)).toBeInTheDocument();

    // Check MEASURED chips for live stats
    const measuredChips = statsStrip.querySelectorAll('[data-label="MEASURED"]');
    expect(measuredChips.length).toBeGreaterThanOrEqual(3);
  });

  it("renders 'Live deals' card with MEASURED label and latest deals up to 20", async () => {
    const client = makeMockClient();
    const { findByTestId } = renderApp(<Overview client={client} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const card = await findByTestId("overview-live-deals-card");
    expect(card).toBeInTheDocument();
    const scope = within(card);

    expect(scope.getByText(/Live deals/i)).toBeInTheDocument();
    const chip = card.querySelector(".label-chip");
    expect(chip?.getAttribute("data-label")).toBe("MEASURED");

    // All deals 1, 2, 3, 4, 5 rendered with rows linking to /deal/:id
    for (let id = 1; id <= 5; id++) {
      const dealLink = scope.getByRole("link", { name: new RegExp(`deal ${id}`, "i") });
      expect(dealLink).toHaveAttribute("href", `/deal/${id}`);
    }

    // Check columns rendered: owner, provider, price, endBlock, blocks left, flags, healthOf
    expect(scope.getAllByText(/provider 1/i).length).toBe(5);
    expect(scope.getAllByText(/0.005 tPOT/i).length).toBe(5);

    // Health labels:
    // Deals 1-4 are settled -> "settled or none"
    expect(scope.getAllByText(/settled or none/i).length).toBe(4);
    // Deal 5 has health 1 and endBlock 255544 < currentBlock 260000 -> "term ended, not settled"
    expect(scope.getByText(/term ended, not settled/i)).toBeInTheDocument();
  });

  it("handles RPC failure with clear retry state and no invented values", async () => {
    const client = makeMockClient({ failDeals: true });
    const { findByTestId } = renderApp(<Overview client={client} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const card = await findByTestId("overview-live-deals-card");
    const scope = within(card);

    // Should show error and retry button
    expect(scope.getByText(/cannot fetch deals/i)).toBeInTheDocument();
    const retryBtn = scope.getByRole("button", { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    // No invented deals in the table
    expect(scope.queryByText(/Deal 999/i)).not.toBeInTheDocument();
  });

  it("caches live deals in session storage across renders", async () => {
    const client = makeMockClient();
    const { findByTestId, unmount } = renderApp(<Overview client={client} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    await findByTestId("overview-live-deals-card");
    // Verify sessionStorage has cached deals
    const keys = Object.keys(sessionStorage);
    const dealsKey = keys.find((k) => k.includes("live-deals") || k.includes("deals"));
    expect(dealsKey).toBeDefined();

    unmount();

    // Next render with failing client loads from session cache
    const failingClient = makeMockClient({ failDeals: true });
    const { findByTestId: findAgain } = renderApp(<Overview client={failingClient} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const cachedCard = await findAgain("overview-live-deals-card");
    expect(within(cachedCard).getByText(/Deal 5/i)).toBeInTheDocument();
  });

  it("renders 'Gate demo' card on Overview with 5 REPORTED lines linking to /gate", async () => {
    const { findByTestId } = renderApp(<Overview />, {
      evidence: evidenceState(),
    });

    const card = await findByTestId("overview-gate-demo-card");
    expect(card).toBeInTheDocument();
    const scope = within(card);

    expect(scope.getByText(/Gate demo/i)).toBeInTheDocument();

    // 1. Recorded release (deal 4)
    expect(scope.getByText(/deal 4.*release/i)).toBeInTheDocument();

    // 2. Recorded refund (deal 5)
    expect(scope.getByText(/deal 5.*refund/i)).toBeInTheDocument();

    // 3. Three refusals: Expired, BondTooLow, RefundNotAllowed
    expect(scope.getByText(/deal 3.*Expired/i)).toBeInTheDocument();
    expect(scope.getByText(/deal 5.*BondTooLow/i)).toBeInTheDocument();
    expect(scope.getByText(/deal 5.*RefundNotAllowed/i)).toBeInTheDocument();

    // Every entry links to /gate
    const links = scope.getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/gate/);
    }

    // All labeled REPORTED
    const chips = card.querySelectorAll('[data-label="REPORTED"]');
    expect(chips.length).toBeGreaterThanOrEqual(5);
  });
});
