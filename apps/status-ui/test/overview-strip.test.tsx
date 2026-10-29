import { describe, expect, it } from "vitest";
import { within } from "@testing-library/react";
import { App } from "../src/app/App";
import { resolveMode } from "../src/config/modes";
import { parseConfig } from "../src/config/env";
import { evidenceState } from "../src/test/fixtures";
import { renderApp } from "../src/test/render";

const recorded = () => resolveMode(parseConfig({}));

const render = (route = "/") =>
  renderApp(<App mode={recorded()} evidence={evidenceState()} />, { route, evidence: evidenceState() });

describe("Start here for judges strip", () => {
  it("renders the 'Start here for judges' strip at the top of the Overview", () => {
    const { getByTestId } = render("/");
    const strip = getByTestId("judges-strip");
    expect(strip).toBeInTheDocument();
    expect(within(strip).getByRole("heading", { name: /start here for judges/i })).toBeInTheDocument();
  });

  it("contains the three required action links: Verify a file, Watch the slash replay, See the gate", () => {
    const { getByTestId } = render("/");
    const strip = getByTestId("judges-strip");
    const scope = within(strip);

    const verifyLink = scope.getByRole("link", { name: /verify a file/i });
    expect(verifyLink).toHaveAttribute("href", "/verify");
    expect(verifyLink.className).toMatch(/min-h-\[44px\]/);

    const replayLink = scope.getByRole("link", { name: /watch the slash replay/i });
    expect(replayLink).toHaveAttribute("href", "/replay");
    expect(replayLink.className).toMatch(/min-h-\[44px\]/);

    const gateLink = scope.getByRole("link", { name: /see the gate/i });
    expect(gateLink).toHaveAttribute("href", "/gate");
    expect(gateLink.className).toMatch(/min-h-\[44px\]/);
  });

  it("keeps each link as one line of plain text with no extra claims", () => {
    const { getByTestId } = render("/");
    const strip = getByTestId("judges-strip");
    const scope = within(strip);

    expect(scope.getByRole("link", { name: /verify a file/i }).textContent).toMatch(/verify a file/i);
    expect(scope.getByRole("link", { name: /watch the slash replay/i }).textContent).toMatch(/watch the slash replay/i);
    expect(scope.getByRole("link", { name: /see the gate/i }).textContent).toMatch(/see the gate/i);
  });
});
