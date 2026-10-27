import { describe, expect, it } from "vitest";
import { AppRoutes } from "../src/app/routes";
import { BlockLink } from "../src/components/BlockLink";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";
import run2 from "../public/evidence/portaldot-live-run2.json";

const bundle = run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle, verified: true, error: null, loading: false });
const CONSOLE = "https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/";

/** Every block link on the page, as `{ block, href }`. */
function blockLinks(container: HTMLElement): Array<{ block: string; href: string; target: string | null }> {
  return [...container.querySelectorAll("a[href*='#/explorer/query/']")].map((a) => ({
    block: (a.getAttribute("href") ?? "").split("#/explorer/query/")[1] ?? "",
    href: a.getAttribute("href") ?? "",
    target: a.getAttribute("target"),
  }));
}

describe("a block number links to the node console", () => {
  it("renders the number, opens in a new tab and never leaks the referrer", () => {
    const { container } = renderApp(<BlockLink block={172658} />);
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe(`${CONSOLE}172658`);
    expect(link?.textContent).toBe("172,658");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noreferrer");
  });

  it("says 'not recorded' instead of inventing a link", () => {
    const { container } = renderApp(<BlockLink block={null} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("not recorded");
  });

  it("links each replay step to the block it happened in", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/replay", evidence: evidenceState() });
    const links = blockLinks(container);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.href).toBe(`${CONSOLE}${link.block}`);
      expect(link.target).toBe("_blank");
    }
    expect(links.map((link) => link.block)).toContain("172578");
  });

  it("links the resolve block on the proof page", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/proof", evidence: evidenceState() });
    expect(blockLinks(container).map((link) => link.block)).toContain("172658");
  });

  it("links the inclusion blocks on the receipt, and keeps the hash on the evidence file", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/receipt/2", evidence: evidenceState() });
    const blocks = blockLinks(container).map((link) => link.block);
    expect(blocks).toContain("172658");
    expect(blocks).toContain("172887");
    const hash = "0x97da004710a5e01ea97b9d602f5b8ef5c5382ea5800c5d52b02951cb6809e8a3";
    const hashLink = [...container.querySelectorAll("a")].find((a) =>
      (a.textContent ?? "").includes(hash),
    );
    expect(hashLink?.getAttribute("href")).toBe("/evidence/portaldot-live-run2.json");
    expect(container.textContent).toMatch(/block numbers open in the Portaldot node console/i);
  });

  it("links the deal range and the recorded transactions on the deal page", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/deal/2", evidence: evidenceState() });
    expect(blockLinks(container).length).toBeGreaterThan(0);
  });

  it("links the deployment block and the transaction table on the overview", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/", evidence: evidenceState() });
    const blocks = blockLinks(container).map((link) => link.block);
    expect(blocks.length).toBeGreaterThan(3);
    expect(blocks).toContain("172658");
  });

  it("keeps every link on the checked console, not a guess", () => {
    for (const route of ["/", "/deal/2", "/proof", "/receipt/2", "/replay"]) {
      const { container } = renderApp(<AppRoutes />, { route, evidence: evidenceState() });
      for (const link of blockLinks(container)) {
        expect(link.href.startsWith(CONSOLE)).toBe(true);
        expect(link.block).toMatch(/^\d+$/);
      }
    }
  });
});
