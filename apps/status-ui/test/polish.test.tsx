import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("025-ui-polish: UI Readability and Polish", () => {
  it("Task 1: Mono only for data - captions, footer lines, subtitles, and 'Measured live' are sans at 15px", () => {
    const statSrc = readFileSync(resolve(__dirname, "../src/components/shared/Stat.tsx"), "utf8");
    // Stat footer detail line must not be font-mono and must be 15px
    expect(statSrc).not.toMatch(/detail[\s\S]*?font-mono/);
    expect(statSrc).toMatch(/detail[\s\S]*?text-\[15px\]/);

    // Measured live lines must not be font-mono and must be 15px
    const dealSrc = readFileSync(resolve(__dirname, "../src/pages/Deal.tsx"), "utf8");
    expect(dealSrc).not.toMatch(/deal-live[\s\S]*?font-mono/);
    expect(dealSrc).toMatch(/deal-live[\s\S]*?text-\[15px\]/);

    const judgesSrc = readFileSync(resolve(__dirname, "../src/pages/Judges.tsx"), "utf8");
    expect(judgesSrc).not.toMatch(/judges-live[\s\S]*?font-mono/);
    expect(judgesSrc).toMatch(/judges-live[\s\S]*?text-\[15px\]/);

    const overviewSrc = readFileSync(resolve(__dirname, "../src/pages/Overview.tsx"), "utf8");
    expect(overviewSrc).not.toMatch(/live-source[\s\S]*?font-mono/);
    expect(overviewSrc).toMatch(/live-source[\s\S]*?text-\[15px\]/);

    // Footer lines must not be font-mono
    const footerSrc = readFileSync(resolve(__dirname, "../src/components/layout/Footer.tsx"), "utf8");
    expect(footerSrc).not.toContain("font-mono break-words text-slate-700");
  });

  it("Task 2: Bigger text - hero paragraph 19px, stat labels 19px, left nav items 16px with more padding, table text 15px", () => {
    const heroSrc = readFileSync(resolve(__dirname, "../src/components/shared/Hero.tsx"), "utf8");
    expect(heroSrc).toMatch(/subtitle[\s\S]*?text-\[19px\]/);

    const statSrc = readFileSync(resolve(__dirname, "../src/components/shared/Stat.tsx"), "utf8");
    expect(statSrc).toMatch(/subtitle[\s\S]*?text-\[19px\]/);

    const sideIndexSrc = readFileSync(resolve(__dirname, "../src/components/layout/SideIndex.tsx"), "utf8");
    expect(sideIndexSrc).toMatch(/text-\[16px\]|text-base/);
    expect(sideIndexSrc).toMatch(/py-(2\.5|3)/);

    const appCss = readFileSync(resolve(__dirname, "../src/styles/app.css"), "utf8");
    expect(appCss).toMatch(/table\s*\{[^}]*font-size:\s*15px/);
  });

  it("Task 3: Stat cards equal height - items-stretch and footer pinned to bottom", () => {
    const overviewSrc = readFileSync(resolve(__dirname, "../src/pages/Overview.tsx"), "utf8");
    expect(overviewSrc).toMatch(/overview-stats-strip[\s\S]*?items-stretch/);

    const statSrc = readFileSync(resolve(__dirname, "../src/components/shared/Stat.tsx"), "utf8");
    expect(statSrc).toContain("h-full");
    expect(statSrc).not.toContain("h-fit");
  });

  it("Task 4: Cards have 1px slate-300 border, soft shadow, 20px radius; sections have at least 40px spacing", () => {
    const cardSrc = readFileSync(resolve(__dirname, "../src/components/shared/Card.tsx"), "utf8");
    expect(cardSrc).toContain("border-slate-300");
    expect(cardSrc).toMatch(/rounded-\[20px\]/);

    const overviewSrc = readFileSync(resolve(__dirname, "../src/pages/Overview.tsx"), "utf8");
    expect(overviewSrc).toMatch(/space-y-(10|12)/);
  });

  it("Task 5: Section headings (h2) one size bigger with thin gold underline accent", () => {
    const appCss = readFileSync(resolve(__dirname, "../src/styles/app.css"), "utf8");
    expect(appCss).toMatch(/\.eyebrow\s*\{[^}]*border-bottom:[^}]*var\(--ochre\)/);
  });
});
