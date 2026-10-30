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

describe("Step 5 Reskin: Receipt page and PNG export", () => {
  it("renders Receipt page sections inside Voltline rounded Card containers", () => {
    const { container } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/receipt/2",
      evidence: evidenceState(),
    });

    const cards = container.querySelectorAll(".rounded-2xl.bg-white");
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it("renders pill-styled action buttons with minimum 44px touch targets", () => {
    const { getByRole } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/receipt/2",
      evidence: evidenceState(),
    });

    const downloadBtn = getByRole("button", { name: /download image/i });
    expect(downloadBtn.className).toMatch(/rounded-full/);
    expect(downloadBtn.className).toMatch(/min-h-\[44px\]/);

    const copyBtn = getByRole("button", { name: /copy link/i });
    expect(copyBtn.className).toMatch(/min-h-\[44px\]/);
  });
});
