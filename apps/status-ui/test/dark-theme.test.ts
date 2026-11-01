import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * 026-ui-dark-gold: the site is black and gold.
 *
 * These tests are the contract for the theme: the eight semantic tokens exist with the agreed
 * values, no component names a light-grey or white surface class any more, and every text token
 * clears 4.5:1 against every surface it is allowed to sit on. The contrast numbers are computed
 * here from the token values, so a future palette edit fails the suite instead of shipping.
 */

const SRC = resolve(__dirname, "../src");
const tokensCss = readFileSync(resolve(SRC, "styles/tokens.css"), "utf8");
const appCss = readFileSync(resolve(SRC, "styles/app.css"), "utf8");

const token = (name: string): string => {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (match === null) throw new Error(`token --${name} is not defined in tokens.css`);
  return match[1]!.trim();
};

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex !== null) {
    const digits = hex[1]!;
    const pairs =
      digits.length === 3
        ? digits.split("").map((d) => `${d}${d}`)
        : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
    const [r, g, b] = pairs.map((pair) => parseInt(pair, 16)) as [number, number, number];
    return { r, g, b, a: 1 };
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba !== null) {
    const parts = rgba[1]!.split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 };
  }
  throw new Error(`cannot parse colour "${value}"`);
}

/** Composite a possibly translucent foreground over an opaque background. */
function over(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const background = parseColor(bg);
  const foreground = over(parseColor(fg), background);
  const [light, dark] = [luminance(foreground), luminance(background)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const SOURCES = walk(SRC).filter((path) => path.endsWith(".tsx") || path.endsWith(".css"));

describe("the semantic palette", () => {
  it("defines the eight agreed tokens with the agreed values", () => {
    expect(token("bg")).toBe("#0a0a0a");
    expect(token("surface")).toBe("#141414");
    expect(token("surface-2")).toBe("#1c1c1c");
    expect(token("line")).toBe("rgba(217, 164, 65, 0.28)");
    expect(token("ink")).toBe("#f5f1e6");
    expect(token("muted")).toBe("#b9b2a1");
    expect(token("gold")).toBe("#d9a441");
    expect(token("gold-bright")).toBe("#ecbf5a");
  });

  it("tells the browser the page is dark, so native controls follow", () => {
    expect(appCss).toMatch(/color-scheme:\s*dark/);
    expect(appCss).toMatch(/body\s*\{[^}]*background:\s*var\(--bg\)/);
  });

  it("keeps the old token names pointing at the new palette instead of a light value", () => {
    expect(token("canvas")).toMatch(/var\(--bg\)/);
    expect(token("canvas-card")).toMatch(/var\(--surface\)/);
    expect(token("ash")).toMatch(/var\(--muted\)/);
    expect(token("ochre")).toMatch(/var\(--gold\)/);
    expect(token("rule")).toMatch(/var\(--line\)/);
  });
});

describe("contrast", () => {
  const surfaces = ["bg", "surface", "surface-2"] as const;

  it("every body and secondary text token clears 4.5:1 on every surface", () => {
    for (const text of ["ink", "muted"] as const) {
      for (const surface of surfaces) {
        const ratio = contrast(token(text), token(surface));
        expect(
          ratio,
          `${text} on ${surface} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("gold headings and big numbers clear 4.5:1 on every surface", () => {
    for (const text of ["gold", "gold-bright"] as const) {
      for (const surface of surfaces) {
        const ratio = contrast(token(text), token(surface));
        expect(ratio, `${text} on ${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("black on gold is the primary-button pair and clears 4.5:1", () => {
    expect(contrast(token("on-gold"), token("gold"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("on-gold"), token("gold-bright"))).toBeGreaterThanOrEqual(4.5);
  });

  it("each status badge colour clears 4.5:1 on its own dark surface", () => {
    expect(contrast(token("ok"), token("ok-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("danger"), token("danger-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("info"), token("info-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("warn"), token("warn-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("gold"), token("surface-2"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the border a control is drawn with clears 3:1 against the surface behind it", () => {
    for (const surface of surfaces) {
      const ratio = contrast(token("line-strong"), token(surface));
      expect(ratio, `line-strong on ${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("no light surface survives in the markup", () => {
  const FORBIDDEN = [
    // solid white / light-grey fills (translucent white overlays on the dark hero are allowed)
    /(?<![\w-])bg-white(?!\/)/,
    /(?<![\w-])bg-slate-\d+/,
    /(?<![\w-])text-slate-\d+/,
    /(?<![\w-])border-slate-\d+/,
    /(?<![\w-])bg-(amber|red|blue|emerald|yellow|orange)-\d+/,
    /(?<![\w-])text-(amber|red|blue|emerald|yellow|orange)-\d+/,
    /(?<![\w-])border-(amber|red|blue|emerald|yellow|orange)-\d+/,
    /\[#(?:fff|ffffff|fef7ea|f3d289|e5b350|c99432|f8fafc|fef3c7|eff6ff)\]/i,
  ];

  // The hero is a fixed dark panel and keeps its own palette (brief, item 5).
  const EXEMPT = ["components/shared/Hero.tsx"];

  it("no component names a hard-coded light fill, text or border", () => {
    const offenders: string[] = [];
    for (const path of SOURCES) {
      const relative = path.slice(SRC.length + 1);
      if (EXEMPT.includes(relative)) continue;
      const source = readFileSync(path, "utf8");
      for (const pattern of FORBIDDEN) {
        const match = source.match(pattern);
        if (match !== null) offenders.push(`${relative}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the label chips are re-cut for dark, not white pills", () => {
    expect(appCss).toMatch(/\.label-chip\s*\{[^}]*background:\s*var\(--surface-2\)/);
    expect(appCss).not.toMatch(/\.label-chip[^{]*\{[^}]*#ffffff/);
    for (const label of ["MEASURED", "REPORTED", "SIMULATED", "PENDING LIVE RUN", "DESIGN NOTE"]) {
      expect(appCss).toContain(`data-label="${label}"`);
    }
  });

  it("every gold fill carries dark text, never the light body ink", () => {
    const offenders: string[] = [];
    for (const path of SOURCES) {
      if (!path.endsWith(".tsx")) continue;
      const lines = readFileSync(path, "utf8").split("\n");
      lines.forEach((line, index) => {
        // `bg-gold` but not the `bg-gold-bright` hover, and only where the same class string
        // also sets a text colour.
        if (!/(?<![\w-])bg-gold(?!-bright)/.test(line)) return;
        if (!/(?<![\w-])text-/.test(line)) return;
        if (/(?<![\w-])text-on-gold(\/[\d.]+)?/.test(line)) return;
        offenders.push(`${path.slice(SRC.length + 1)}:${index + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
