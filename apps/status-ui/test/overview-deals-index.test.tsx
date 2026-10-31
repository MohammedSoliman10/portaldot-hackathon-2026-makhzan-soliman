import { describe, expect, it, vi, beforeEach } from "vitest";
import { within } from "@testing-library/react";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { Overview } from "../src/pages/Overview";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
// Real on-chain slot 0 word where nextDealId = 5 (last assigned id: deals 1, 2, 3, 4, 5 exist)
const SLOT0_DEALS5 = "0x0000000189c00000006400010000000500038d7ea4c6800007d0040000000032";
// Slot 0 with nextDealId = 25 (25 deals exist)
const SLOT0_DEALS25 = "0x0000000189c00000006400010000001900038d7ea4c6800007d0040000000032";
// Slot 0 with nextDealId = 0 (0 deals created)
const SLOT0_DEALS0 = "0x0000000189c00000006400010000000000038d7ea4c6800007d0040000000032";

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
  totalDeals?: number;
  unsettledIds?: number[];
} = {}): ReadClient {
  const slot0 = options.slot0 ?? SLOT0_DEALS5;
  const currentBlock = options.blockNumber ?? 265000n;
  const unsettledSet = new Set(options.unsettledIds ?? []);

  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (functionName === "peek") return [slot0];
      if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
      if (options.failDeals && (functionName === "dealOf" || functionName === "healthOf")) {
        throw new Error("RPC timeout: cannot fetch deals");
      }
      if (functionName === "dealOf") {
        const id = Number(args?.[0]);
        if (id < 1 || (options.totalDeals !== undefined && id > options.totalDeals)) {
          return ["0x0000000000000000000000000000000000000000", 0, 0, 0, 0, "0x00", 0, 0, 0, 0, 0n, 0n];
        }
        return [
          OWNER,
          172000 + id * 1000,
          172500 + id * 1000,
          1,
          unsettledSet.has(id) ? 0 : 1, // flags: 1 = settled
          ROOT,
          1024,
          1048576,
          0,
          0,
          500000000000000n,
          500000000000000n,
        ];
      }
      if (functionName === "healthOf") {
        const id = Number(args?.[0]);
        if (unsettledSet.has(id)) return 1;
        return 0; // settled
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

describe("Overview - Deal Count & Live Index Corrections", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("nextDealId 5 gives 5 created, deals 1 to 5 listed (5 down to 1), 5 settled, 0 healthy now", async () => {
    // Real chain state: nextDealId = 5, all 5 deals exist and are settled
    const client = makeMockClient({ slot0: SLOT0_DEALS5, totalDeals: 5 });
    const { findByTestId } = renderApp(<Overview client={client} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const statsStrip = await findByTestId("overview-stats-strip");
    const scope = within(statsStrip);

    // 1. deals created: nextDealId = 5 (NOT 4)
    expect(scope.getByText("5")).toBeInTheDocument();
    expect(scope.getByText(/deals created/i)).toBeInTheDocument();

    // 2. settled count: 5 (covers all 5 deals)
    expect(scope.getByText("5")).toBeInTheDocument();
    expect(scope.getByText(/^settled$/i)).toBeInTheDocument();

    // 3. healthy now: 0 (all 5 are settled)
    expect(scope.getByText("0")).toBeInTheDocument();
    expect(scope.getByText(/healthy now/i)).toBeInTheDocument();

    // 4. 6 tPOT slashed kept as REPORTED
    expect(scope.getByText("6 tPOT")).toBeInTheDocument();

    // Live deals card
    const card = await findByTestId("overview-live-deals-card");
    const cardScope = within(card);

    // All 5 deals listed
    for (let id = 1; id <= 5; id++) {
      expect(cardScope.getByRole("link", { name: new RegExp(`deal ${id}`, "i") })).toHaveAttribute("href", `/deal/${id}`);
    }

    // Verify ordering: descending from 5 down to 1
    const dealLinks = cardScope.getAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/deal/"));
    expect(dealLinks.map((l) => l.getAttribute("href"))).toEqual([
      "/deal/5",
      "/deal/4",
      "/deal/3",
      "/deal/2",
      "/deal/1",
    ]);
  });

  it("nextDealId 25 lists exactly 20 rows (25 down to 6) and settled count covers every deal", async () => {
    // 25 deals created, 23 settled, 2 healthy now (deals 24 and 25 end in future)
    const client = makeMockClient({
      slot0: SLOT0_DEALS25,
      totalDeals: 25,
      blockNumber: 170000n, // before endBlock of deals 24 and 25
      unsettledIds: [24, 25],
    });

    const { findByTestId } = renderApp(<Overview client={client} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const statsStrip = await findByTestId("overview-stats-strip");
    const scope = within(statsStrip);

    // deals created = 25
    expect(scope.getByText("25")).toBeInTheDocument();
    // settled covers all 25 deals (23 settled)
    expect(scope.getByText("23")).toBeInTheDocument();
    // healthy now covers all 25 deals (2 healthy)
    expect(scope.getByText("2")).toBeInTheDocument();

    const card = await findByTestId("overview-live-deals-card");
    const cardScope = within(card);

    // Exactly 20 deal rows in table
    const dealLinks = cardScope.getAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/deal/"));
    expect(dealLinks.length).toBe(20);

    // IDs are 25 down to 6
    expect(dealLinks[0]).toHaveAttribute("href", "/deal/25");
    expect(dealLinks[19]).toHaveAttribute("href", "/deal/6");

    // Older deals (1..5) should not be in the latest 20 table
    expect(cardScope.queryByRole("link", { name: /deal 5\b/i })).not.toBeInTheDocument();
    expect(cardScope.queryByRole("link", { name: /deal 1\b/i })).not.toBeInTheDocument();
  });

  it("nextDealId 0 shows an empty state", async () => {
    const client = makeMockClient({ slot0: SLOT0_DEALS0, totalDeals: 0 });
    const { findByTestId } = renderApp(<Overview client={client} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const statsStrip = await findByTestId("overview-stats-strip");
    const scope = within(statsStrip);

    const createdCard = within(scope.getByText(/deals created/i).closest("div")!);
    expect(createdCard.getByText("0")).toBeInTheDocument();

    const card = await findByTestId("overview-live-deals-card");
    const cardScope = within(card);

    // Empty state rendered
    expect(cardScope.getByText(/no deals created yet/i)).toBeInTheDocument();
    // No deal links
    const dealLinks = cardScope.queryAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/deal/"));
    expect(dealLinks.length).toBe(0);
  });

  it("handles RPC failure with clear retry state and no invented values", async () => {
    const client = makeMockClient({ failDeals: true });
    const { findByTestId } = renderApp(<Overview client={client} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const card = await findByTestId("overview-live-deals-card");
    const scope = within(card);

    expect(scope.getByText(/cannot fetch deals/i)).toBeInTheDocument();
    const retryBtn = scope.getByRole("button", { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it("renders 'Gate demo' card on Overview with 5 REPORTED lines linking to /gate", async () => {
    const { findByTestId } = renderApp(<Overview />, {
      evidence: evidenceState(),
    });

    const card = await findByTestId("overview-gate-demo-card");
    expect(card).toBeInTheDocument();
    const scope = within(card);

    expect(scope.getByText(/Gate demo/i)).toBeInTheDocument();
    expect(scope.getByText(/deal 4: locked and released/i)).toBeInTheDocument();
    expect(scope.getByText(/deal 5: locked with 2 tPOT, refunded to payer/i)).toBeInTheDocument();
    expect(scope.getByText(/deal 3: lock refused Expired/i)).toBeInTheDocument();
    expect(scope.getByText(/deal 5: release refused BondTooLow/i)).toBeInTheDocument();
    expect(scope.getByText(/deal 5: refund refused RefundNotAllowed/i)).toBeInTheDocument();

    const links = scope.getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/gate/);
    }
  });
});
