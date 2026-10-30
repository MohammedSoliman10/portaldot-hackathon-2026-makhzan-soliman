import { describe, expect, it } from "vitest";
import { within } from "@testing-library/react";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { Overview } from "../src/pages/Overview";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const evidence = (): EvidenceBundle => run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle: evidence(), verified: true, error: null, loading: false });

describe("Overview Voltline Reskin", () => {
  it("renders dark hero panel with editorial headline and 'prove' highlighted", () => {
    const { container } = renderApp(<Overview />, { evidence: evidenceState() });
    const hero = container.querySelector("section.bg-\\[\\#0c0d10\\]") || container.querySelector("header");
    expect(hero).toBeInTheDocument();

    const headline = container.querySelector("h1");
    expect(headline).toBeInTheDocument();
    expect(headline?.textContent).toContain("Don't trust your storage provider. Make them prove it.");

    const highlighted = headline?.querySelector(".highlight-pill");
    expect(highlighted).toBeInTheDocument();
    expect(highlighted?.textContent).toBe("prove");
  });

  it("renders the stats strip with 4 required figures, each labeled REPORTED in recorded mode", () => {
    const { getByTestId } = renderApp(<Overview />, { evidence: evidenceState() });
    const statsStrip = getByTestId("overview-stats-strip");
    expect(statsStrip).toBeInTheDocument();
    const scope = within(statsStrip);

    // 1. 2 deals verified
    expect(scope.getByText("2")).toBeInTheDocument();
    expect(scope.getByText(/deals verified/i)).toBeInTheDocument();

    // 2. 6 tPOT slashed = exactly 20% of the bond
    expect(scope.getByText("6 tPOT")).toBeInTheDocument();
    expect(scope.getByText(/slashed = exactly 20% of the bond/i)).toBeInTheDocument();

    // 3. 1 MiB = 1,024 blocks
    expect(scope.getByText("1 MiB")).toBeInTheDocument();
    expect(scope.getByText(/1,024 blocks/i)).toBeInTheDocument();

    // 4. 208 contract tests
    expect(scope.getByText("208")).toBeInTheDocument();
    expect(scope.getByText(/contract tests/i)).toBeInTheDocument();

    // All labeled with explicit chip
    const chips = statsStrip.querySelectorAll(".label-chip");
    expect(chips.length).toBe(4);
    for (const chip of chips) {
      expect(chip.getAttribute("data-label")).toBe("REPORTED");
    }
  });

  it("renders three action cards linking to /verify, /replay, and /gate", () => {
    const { getByTestId } = renderApp(<Overview />, { evidence: evidenceState() });
    const actionCards = getByTestId("overview-action-cards");
    expect(actionCards).toBeInTheDocument();
    const scope = within(actionCards);

    const verifyLink = scope.getByRole("link", { name: /verify/i });
    expect(verifyLink).toHaveAttribute("href", "/verify");

    const replayLink = scope.getByRole("link", { name: /replay/i });
    expect(replayLink).toHaveAttribute("href", "/replay");

    const gateLink = scope.getByRole("link", { name: /gate/i });
    expect(gateLink).toHaveAttribute("href", "/gate");
  });
});
