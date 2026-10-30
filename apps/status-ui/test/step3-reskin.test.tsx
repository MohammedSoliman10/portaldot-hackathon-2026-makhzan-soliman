import { describe, expect, it } from "vitest";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { App } from "../src/app/App";
import { resolveMode } from "../src/config/modes";
import { parseConfig } from "../src/config/env";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const evidence = (): EvidenceBundle => run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle: evidence(), verified: true, error: null, loading: false });
const recorded = () => resolveMode(parseConfig({}));

describe("Step 3 Reskin: Deal and Verify pages", () => {
  it("renders Deal cards using Voltline rounded white cards with soft shadows", () => {
    const { container } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/deal/1",
      evidence: evidenceState(),
    });
    const deal1 = container.querySelector("#deal-1");
    expect(deal1).toBeInTheDocument();
    // Voltline card classes
    expect(deal1?.className).toMatch(/rounded-2xl/);
    expect(deal1?.className).toMatch(/bg-white/);
    expect(deal1?.className).toMatch(/shadow/);

    // Selected deal indicator
    expect(deal1).toHaveAttribute("data-selected", "true");
    expect(deal1?.className).toMatch(/ring-2|border-ochre/);
  });

  it("renders Deal page action links with at least 44px touch targets", () => {
    const { container } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/deal/1",
      evidence: evidenceState(),
    });
    const deal1 = container.querySelector("#deal-1");
    expect(deal1).toBeInTheDocument();
    const links = deal1?.querySelectorAll("ul a");
    expect(links?.length).toBeGreaterThanOrEqual(3);
    for (const link of links ?? []) {
      expect(link.className).toMatch(/min-h-\[44px\]/);
    }
  });

  it("renders Verify page sections inside Voltline rounded Card containers", () => {
    const { container } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/verify",
      evidence: evidenceState(),
    });
    const cards = container.querySelectorAll(".rounded-2xl.bg-white");
    expect(cards.length).toBeGreaterThanOrEqual(3); // Sample meta, dropzone card, refusals card
  });

  it("renders pill buttons on Verify page with at least 44px touch targets", () => {
    const { getByRole } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/verify",
      evidence: evidenceState(),
    });
    const sampleBtn = getByRole("button", { name: /use the sample file/i });
    expect(sampleBtn).toBeInTheDocument();
    expect(sampleBtn.className).toMatch(/rounded-full/);
    expect(sampleBtn.className).toMatch(/min-h-\[44px\]/);
  });
});
