import { describe, expect, it } from "vitest";
import { AppRoutes } from "../src/app/routes";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";
import run2 from "../public/evidence/portaldot-live-run2.json";

const bundle = run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle, verified: true, error: null, loading: false });

describe("the replay page", () => {
  it("opens on deal 2 at step 1 with a progress bar that says how many steps there are", () => {
    const { container, getByTestId, getByRole } = renderApp(<AppRoutes />, {
      route: "/replay",
      evidence: evidenceState(),
    });

    expect(container.textContent).toMatch(/recorded run, step by step/i);
    const bar = getByTestId("replay-progress");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
    expect(getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(getByRole("button", { name: /next/i })).toBeEnabled();
    expect(getByTestId("replay-step-title").textContent).toMatch(/create deal 2/i);
    expect(container.textContent).toContain("172,578");
    expect(container.textContent).toMatch(/REPORTED/);
    expect(container.textContent).toMatch(/recording, not a live read/i);
  });

  it("steps forward and back, and stops at both ends", async () => {
    const { getByTestId, getByRole, user } = renderApp(<AppRoutes />, {
      route: "/replay",
      evidence: evidenceState(),
    });

    await user.click(getByRole("button", { name: /next/i }));
    expect(getByTestId("replay-progress")).toHaveAttribute("aria-valuenow", "2");
    expect(getByTestId("replay-step-title").textContent).toMatch(/challenge 1 of 2/i);
    expect(getByTestId("replay-step").textContent).toContain("172,584");

    await user.click(getByRole("button", { name: /previous/i }));
    expect(getByTestId("replay-progress")).toHaveAttribute("aria-valuenow", "1");

    for (let i = 1; i < 8; i += 1) await user.click(getByRole("button", { name: /next/i }));
    expect(getByTestId("replay-progress")).toHaveAttribute("aria-valuenow", "8");
    expect(getByRole("button", { name: /next/i })).toBeDisabled();
    expect(getByTestId("replay-step-title").textContent).toMatch(/settle/i);
  });

  it("shows the slash on the resolve step, in tPOT and in raw units", async () => {
    const { getByTestId, getByRole, user } = renderApp(<AppRoutes />, {
      route: "/replay",
      evidence: evidenceState(),
    });

    await user.click(getByRole("button", { name: /resolve — the slash/i }));
    expect(getByTestId("replay-progress")).toHaveAttribute("aria-valuenow", "6");
    const step = getByTestId("replay-step").textContent ?? "";
    expect(step).toMatch(/30 tPOT to 24 tPOT/);
    expect(step).toContain("600,000,000,000,000 units");
    expect(step).toContain("6,000,000,000,000,000,000 wei");
    expect(step).toContain("0x97da004710a5e01ea97b9d602f5b8ef5c5382ea5800c5d52b02951cb6809e8a3");
  });

  it("replays deal 1 without a slash step", async () => {
    const { getByTestId, getByRole, user } = renderApp(<AppRoutes />, {
      route: "/replay",
      evidence: evidenceState(),
    });

    await user.click(getByRole("button", { name: /deal 1/i }));
    expect(getByTestId("replay-progress")).toHaveAttribute("aria-valuemax", "5");
    expect(getByTestId("replay-step-title").textContent).toMatch(/create deal 1/i);
    expect(getByTestId("replay-steps").textContent).not.toMatch(/the slash/i);
  });

  it("links to the live reads instead of pretending the replay is one", () => {
    const { container } = renderApp(<AppRoutes />, {
      route: "/replay",
      evidence: evidenceState(),
    });
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/verify");
    expect(hrefs).toContain("/proof");
    expect(container.textContent).toMatch(/recording/i);
  });

  it("says the evidence is missing rather than replaying nothing", () => {
    const { container } = renderApp(<AppRoutes />, { route: "/replay" });
    expect(container.textContent).toMatch(/evidence/i);
    expect(container.querySelector("[data-testid='replay-step']")).toBeNull();
  });
});
