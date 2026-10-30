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

describe("Step 4 Reskin: Replay, Gate, Proof, and Judges pages", () => {
  it("renders Replay controls and cards using Voltline rounded Cards and pill buttons", () => {
    const { container, getByRole } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/replay",
      evidence: evidenceState(),
    });

    const cards = container.querySelectorAll(".rounded-2xl.bg-white");
    expect(cards.length).toBeGreaterThanOrEqual(2);

    const nextBtn = getByRole("button", { name: /next step/i });
    expect(nextBtn.className).toMatch(/rounded-full/);
    expect(nextBtn.className).toMatch(/min-h-\[44px\]/);

    const prevBtn = getByRole("button", { name: /previous step/i });
    expect(prevBtn.className).toMatch(/rounded-full/);
    expect(prevBtn.className).toMatch(/min-h-\[44px\]/);
  });

  it("renders Gate page sections inside rounded Card containers with pill controls", () => {
    const { container } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/gate",
      evidence: evidenceState(),
    });

    const cards = container.querySelectorAll(".rounded-2xl.bg-white");
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("renders Proof page tables inside rounded Card containers", () => {
    const { container } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/proof",
      evidence: evidenceState(),
    });

    const cards = container.querySelectorAll(".rounded-2xl.bg-white");
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("renders Judges page checklist inside rounded Card container", () => {
    const { container } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/judges",
      evidence: evidenceState(),
    });

    const cards = container.querySelectorAll(".rounded-2xl.bg-white");
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });
});
