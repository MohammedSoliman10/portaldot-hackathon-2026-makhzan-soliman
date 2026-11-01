import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App } from "../src/app/App";
import { resolveMode } from "../src/config/modes";
import { parseConfig } from "../src/config/env";
import { evidenceState } from "../src/test/fixtures";
import { renderApp } from "../src/test/render";

const recorded = () => resolveMode(parseConfig({}));

const render = (route = "/") =>
  renderApp(<App mode={recorded()} evidence={evidenceState()} />, { route, evidence: evidenceState() });

/** Standard relative luminance formula per WCAG 2.1 */
function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("accessibility pass", () => {
  describe("color contrast", () => {
    it("ensures every text token clears 4.5:1 on every surface the site draws", () => {
      const tokensPath = resolve(__dirname, "../src/styles/tokens.css");
      const css = readFileSync(tokensPath, "utf8");

      // Resolve one level of `var(--x)` indirection, because the light-era names now alias the
      // semantic ones.
      const raw = (name: string): string => {
        const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
        if (!match || !match[1]) throw new Error(`Missing token --${name}`);
        return match[1].trim();
      };
      const extract = (name: string): string => {
        let value = raw(name);
        const alias = value.match(/^var\(--([\w-]+)\)$/);
        if (alias) value = raw(alias[1]!);
        if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
          throw new Error(`Token --${name} is "${value}", not a 6-digit hex`);
        }
        return value;
      };

      const surfaces = ["bg", "surface", "surface-2"].map((name) => ({
        name,
        color: extract(name),
      }));

      const textTokens = ["ink", "muted", "gold", "gold-bright"].map((name) => ({
        name,
        color: extract(name),
      }));

      for (const token of textTokens) {
        for (const surface of surfaces) {
          const ratio = contrastRatio(token.color, surface.color);
          expect(
            ratio,
            `Token --${token.name} (${token.color}) vs --${surface.name} (${surface.color}) is ${ratio.toFixed(2)}, expected >= 4.5:1`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }

      // Voltline brand rule: black text on gold, >= 4.5:1
      const ratioBlackOnGold = contrastRatio(extract("on-gold"), extract("gold"));
      expect(
        ratioBlackOnGold,
        `Black text on gold contrast is ${ratioBlackOnGold.toFixed(2)}, expected >= 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);

      // The hero panel is still a fixed dark plate; its own ink must stay readable on it.
      const ratioHero = contrastRatio(extract("ink"), "#0c0d10");
      expect(
        ratioHero,
        `Ink on the dark hero contrast is ${ratioHero.toFixed(2)}, expected >= 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("button and input labels", () => {
    const routesToTest = ["/", "/deal/1", "/verify", "/proof", "/gate", "/judges", "/replay", "/receipt/1"];

    for (const route of routesToTest) {
      it(`ensures all buttons on ${route} have accessible names`, () => {
        const { container } = render(route);
        const buttons = container.querySelectorAll("button");
        for (const btn of buttons) {
          const name = btn.getAttribute("aria-label") || btn.textContent?.trim();
          expect(
            name,
            `Button in ${route} must have accessible text or aria-label: ${btn.outerHTML}`
          ).toBeTruthy();
        }
      });
    }

    it("ensures file input on /verify has an accessible label", () => {
      const { container } = render("/verify");
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      const label = fileInput?.getAttribute("aria-label") || fileInput?.closest("label")?.textContent?.trim();
      expect(label).toBeTruthy();
      expect(label).toMatch(/file/i);
    });

    it("ensures deal id input on /gate has an accessible label when configured", () => {
      const GATE = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
      const gateMode = resolveMode(
        parseConfig({
          VITE_MAKHZAN_MODE: "LIVE",
          VITE_MAKHZAN_RPC_URL: "https://test-evm-rpc-v3.portaldot.dev",
          VITE_MAKHZAN_CONTRACT_ADDRESS: "0x60481DFcFCA34A8F095939D9675eC715127B2e44",
          VITE_GATE_ADDRESS: GATE,
        })
      );
      const { getByRole } = renderApp(<App mode={gateMode} evidence={evidenceState()} />, {
        route: "/gate",
        evidence: evidenceState(),
      });
      const input = getByRole("spinbutton", { name: /deal id/i });
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("id", "gate-deal-id");
    });
  });

  describe("no color-only meaning for status labels", () => {
    it("verifies status chips carry explicit text labels", () => {
      const { container } = render("/");
      const chips = container.querySelectorAll(".label-chip");
      expect(chips.length).toBeGreaterThan(0);
      for (const chip of chips) {
        expect(chip.textContent?.trim()).toBeTruthy();
        expect(["MEASURED", "REPORTED", "SIMULATED", "PENDING LIVE RUN", "DESIGN NOTE"]).toContain(
          chip.textContent?.trim()
        );
      }
    });
  });

  describe("visible focus indicators", () => {
    it("verifies global focus-visible rule is present in app.css", () => {
      const appCssPath = resolve(__dirname, "../src/styles/app.css");
      const css = readFileSync(appCssPath, "utf8");
      expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:/);
    });
  });
});
