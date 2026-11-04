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
// Slot 0 with nextDealId = 6 (last assigned deal id is 6: deals 1, 2, 3, 4, 5, 6 exist)
const SLOT0_DEAL6 = "0x0000000189c00000006400010000000600038d7ea4c6800007d0040000000032";
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

function clientWithSixDeals(): ReadClient {
  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (functionName === "peek") return [SLOT0_DEAL6];
      if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
      if (functionName === "dealOf") {
        const id = Number(args?.[0]);
        return [
          OWNER,
          id === 6 ? 318035 : 172000 + id * 100,
          id === 6 ? 418835 : 172500 + id * 100,
          1,
          id === 6 ? 0 : 1, // deal 6 is not settled
          ROOT,
          1024,
          1048576,
          0,
          0,
          500000000000000n,
          id === 6 ? 0n : 500000000000000n,
        ];
      }
      if (functionName === "healthOf") {
        const id = Number(args?.[0]);
        return id === 6 ? 1 : 0;
      }
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x60006000"),
    getBlockNumber: vi.fn(async () => 318420n),
    getBalance: vi.fn(async () => 24000000000000000000n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
  } as unknown as ReadClient;
}

describe("Overview - Live Deal Chips (1..nextDealId)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders a deal chip for every deal 1..6 when nextDealId is 6 in a wrapping row", async () => {
    const client = clientWithSixDeals();
    const { findByTestId } = renderApp(<Overview client={client} />, {
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const chipsContainer = await findByTestId("overview-deal-chips");
    expect(chipsContainer).toBeInTheDocument();

    // Verify wrapping row styling
    expect(chipsContainer.className).toMatch(/flex-wrap/);

    const scope = within(chipsContainer);
    const links = scope.getAllByRole("link");

    // Must have 6 chips, not only 2
    expect(links.length).toBe(6);
    expect(links.length).not.toBe(2);

    for (let id = 1; id <= 6; id++) {
      const chip = scope.getByRole("link", { name: new RegExp(`deal ${id}`, "i") });
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveAttribute("href", `/deal/${id}`);
    }

    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual([
      "/deal/1",
      "/deal/2",
      "/deal/3",
      "/deal/4",
      "/deal/5",
      "/deal/6",
    ]);
  });
});
