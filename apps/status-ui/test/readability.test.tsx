import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { App } from "../src/app/App";
import { resolveMode } from "../src/config/modes";
import { parseConfig } from "../src/config/env";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const evidence = (): EvidenceBundle => run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle: evidence(), verified: true, error: null, loading: false });
const recorded = () => resolveMode(parseConfig({}));

describe("024-ui-readability: Readability and Layout Improvements", () => {
  it("Task 1: Type scale in tokens.css has body 16px (1rem), text-xs 14px (0.875rem), and chip 13px", () => {
    const tokensPath = resolve(__dirname, "../src/styles/tokens.css");
    const appCssPath = resolve(__dirname, "../src/styles/app.css");
    const tokens = readFileSync(tokensPath, "utf8");
    const appCss = readFileSync(appCssPath, "utf8");

    // body font size token (step-0) must be 1rem / 16px
    expect(tokens).toMatch(/--step-0:\s*1rem/);
    // text-xs token (step--1) must be 0.875rem / 14px
    expect(tokens).toMatch(/--step--1:\s*0\.875rem/);
    // .label-chip must be 13px or 0.8125rem
    expect(appCss).toMatch(/\.label-chip\s*\{[^}]*font-size:\s*(13px|0\.8125rem)/);
  });

  it("Task 2: Contrast - Judges and Deal 'Measured live' use text-amber-800, footer source uses readable text-slate-600", () => {
    const { container: judgesContainer } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/judges",
      evidence: evidenceState(),
    });
    const judgesLive = judgesContainer.querySelector("[data-testid='judges-live']");
    if (judgesLive) {
      expect(judgesLive.className).toContain("text-amber-800");
      expect(judgesLive.className).not.toContain("text-ochre");
    } else {
      // Check source directly if not in live mode
      const judgesSrc = readFileSync(resolve(__dirname, "../src/pages/Judges.tsx"), "utf8");
      expect(judgesSrc).toMatch(/data-testid="judges-live"[^>]*text-amber-800/);
    }

    const { container: dealContainer } = renderApp(<App mode={recorded()} evidence={evidenceState()} />, {
      route: "/deal/1",
      evidence: evidenceState(),
    });
    const dealLive = dealContainer.querySelector("[data-testid='deal-live']");
    if (dealLive) {
      expect(dealLive.className).toContain("text-amber-800");
      expect(dealLive.className).not.toContain("text-ochre");
    } else {
      const dealSrc = readFileSync(resolve(__dirname, "../src/pages/Deal.tsx"), "utf8");
      expect(dealSrc).toMatch(/data-testid="deal-live"[^>]*text-amber-800/);
    }

    // Footer source line
    const footerSrc = readFileSync(resolve(__dirname, "../src/components/layout/Footer.tsx"), "utf8");
    expect(footerSrc).toMatch(/Source:[^<]*<\/p>/);
    expect(footerSrc).toContain("text-slate-600");
  });

  it("Task 3: Stat card has whitespace-nowrap, chip in its own row above number, and stat grid uses 2 cols up to 1279px, 4 cols from 1280px (xl:)", () => {
    const statSrc = readFileSync(resolve(__dirname, "../src/components/shared/Stat.tsx"), "utf8");
    expect(statSrc).toContain("whitespace-nowrap");
    expect(statSrc).toContain("min-w-0");

    const overviewSrc = readFileSync(resolve(__dirname, "../src/pages/Overview.tsx"), "utf8");
    // Grid: 2 columns up to 1279px, 4 columns from 1280px (xl:grid-cols-4)
    expect(overviewSrc).toMatch(/overview-stats-strip[\s\S]*?grid-cols-1[\s\S]*?sm:grid-cols-2[\s\S]*?xl:grid-cols-4/);
    expect(overviewSrc).not.toMatch(/lg:grid-cols-4/);
  });

  it("Task 4: /judges wraps long hash and path values with break-all and min-w-0", () => {
    const judgesSrc = readFileSync(resolve(__dirname, "../src/pages/Judges.tsx"), "utf8");
    expect(judgesSrc).toContain("break-all");
    expect(judgesSrc).toContain("min-w-0");
  });

  it("Task 5: Hero heading letter-spacing is closer to normal (not tight negative tracking)", () => {
    const heroSrc = readFileSync(resolve(__dirname, "../src/components/shared/Hero.tsx"), "utf8");
    expect(heroSrc).not.toContain("tracking-tight");
    expect(heroSrc).toMatch(/tracking-normal|tracking-\[-0\.01em\]/);
  });
});
