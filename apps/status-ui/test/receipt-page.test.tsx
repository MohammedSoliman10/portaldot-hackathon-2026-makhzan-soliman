import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../src/app/routes";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";
import run2 from "../public/evidence/portaldot-live-run2.json";

const bundle = run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle, verified: true, error: null, loading: false });
const SLASH_TX = "0x97da004710a5e01ea97b9d602f5b8ef5c5382ea5800c5d52b02951cb6809e8a3";

/** The value cell only: the source is rendered under the field name on a phone. */
function valueText(container: HTMLElement, field: string): string {
  const row = container.querySelector(`[data-testid="receipt-row-${field}"]`);
  return (row?.querySelector(".numeral")?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("the receipt page", () => {
  it("shows deal 2 as 30 to 24, with the exact slash and the owner credit", () => {
    const { container } = renderApp(<AppRoutes />, {
      route: "/receipt/2",
      evidence: evidenceState(),
    });

    expect(container.textContent).toMatch(/deal 2/i);
    expect(valueText(container, "bond-before")).toContain("30");
    expect(valueText(container, "bond-after")).toContain("24");
    expect(valueText(container, "slash")).toContain("6");
    expect(valueText(container, "slash")).toContain("600,000,000,000,000 units");
    expect(valueText(container, "owner-credited")).toContain("6");
    expect(valueText(container, "owner-credited")).toContain("6,000,000,000,000,000,000 wei");
    for (const row of container.querySelectorAll("[data-testid^='receipt-row-']")) {
      expect(row.querySelector("[data-label='REPORTED']")).not.toBeNull();
    }
  });

  it("shows deal 1 as 30 to 30 with no slash, and says so in words", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/receipt/1", evidence: evidenceState() });

    expect(valueText(container, "bond-before")).toContain("30");
    expect(valueText(container, "bond-after")).toContain("30");
    expect(valueText(container, "slash")).toMatch(/^0 tPOT/);
    expect(valueText(container, "owner-credited")).toMatch(/^0 tPOT/);
    expect(container.textContent).toMatch(/no slash/i);
  });

  it("links every hash to the evidence file and says where a block does open", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/receipt/2", evidence: evidenceState() });

    const links = [...container.querySelectorAll<HTMLAnchorElement>(
      `a[href="/evidence/portaldot-live-run2.json"]`,
    )];
    const link = links.find((item) => (item.textContent ?? "").includes(SLASH_TX));
    expect(link).toBeDefined();
    expect(links.length).toBeGreaterThanOrEqual(7);
    expect(container.textContent).toMatch(/no EVM explorer is configured/i);
    expect(container.textContent).toMatch(/block numbers open in the Portaldot node console/i);
  });

  it("copies a hash link that works without a server rewrite", async () => {
    const { getByRole, findByText, user } = renderApp(<AppRoutes />, {
      route: "/receipt/2",
      evidence: evidenceState(),
    });

    await user.click(getByRole("button", { name: /copy link/i }));
    await findByText(/copied/i);
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/#/receipt/2`);
  });

  it("exports a PNG, drawing the same numbers the page shows", async () => {
    const fillText = vi.fn();
    const ctx = {
      fillStyle: "",
      font: "",
      textAlign: "",
      fillRect: vi.fn(),
      fillText,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:receipt"),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const { getByRole, findByText } = renderApp(<AppRoutes />, {
      route: "/receipt/2",
      evidence: evidenceState(),
    });
    getByRole("button", { name: /download image/i }).click();

    await findByText(/image ready|downloaded|saved/i);
    const drawn = fillText.mock.calls.map((call) => String(call[0])).join(" | ");
    expect(drawn).toContain("Deal 2");
    expect(drawn).toContain("30 tPOT");
    expect(drawn).toContain("24 tPOT");
    expect(click).toHaveBeenCalled();
  });

  it("says there is no receipt for an id the evidence does not hold", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/receipt/9", evidence: evidenceState() });
    expect(container.textContent).toMatch(/no receipt/i);
    expect(container.querySelector("[data-testid^='receipt-row-']")).toBeNull();
  });

  it("says the evidence is not loaded instead of drawing an empty receipt", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/receipt/2" });
    expect(container.textContent).toMatch(/evidence/i);
    expect(container.querySelector("[data-testid^='receipt-row-']")).toBeNull();
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
