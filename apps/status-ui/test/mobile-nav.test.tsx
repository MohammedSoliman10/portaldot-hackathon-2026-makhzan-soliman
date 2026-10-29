import { describe, expect, it } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { App } from "../src/app/App";
import { resolveMode } from "../src/config/modes";
import { parseConfig } from "../src/config/env";
import { evidenceState } from "../src/test/fixtures";
import { renderApp } from "../src/test/render";

const recorded = () => resolveMode(parseConfig({}));

const render = (route = "/") =>
  renderApp(<App mode={recorded()} evidence={evidenceState()} />, { route, evidence: evidenceState() });

describe("mobile navigation", () => {
  it("renders a mobile menu button with aria-expanded, aria-controls and min 44px touch target", () => {
    const { getByRole } = render();
    const toggle = getByRole("button", { name: /menu/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "mobile-navigation-menu");
    // Touch target check
    expect(toggle.className).toMatch(/min-h-\[44px\]/);
    expect(toggle.className).toMatch(/min-w-\[44px\]/);
  });

  it("toggles the menu open and closed when clicked", () => {
    const { getByRole, queryByRole } = render();
    const toggle = getByRole("button", { name: /menu/i });

    expect(queryByRole("navigation", { name: /mobile navigation/i })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const mobileNav = getByRole("navigation", { name: /mobile navigation/i });
    expect(mobileNav).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(queryByRole("navigation", { name: /mobile navigation/i })).not.toBeInTheDocument();
  });

  it("contains every required route with >= 44px touch target: /, /deal, /verify, /proof, /judges, /replay, /gate, receipts", () => {
    const { getByRole } = render();
    const toggle = getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);

    const mobileNav = getByRole("navigation", { name: /mobile navigation/i });
    const navScope = within(mobileNav);

    const expectedRoutes = [
      { name: /overview/i, href: "/" },
      { name: /deal/i, href: "/deal/1" },
      { name: /verify/i, href: "/verify" },
      { name: /proof/i, href: "/proof" },
      { name: /gate/i, href: "/gate" },
      { name: /judges/i, href: "/judges" },
      { name: /replay/i, href: "/replay" },
      { name: /receipt 1/i, href: "/receipt/1" },
      { name: /receipt 2/i, href: "/receipt/2" },
    ];

    for (const route of expectedRoutes) {
      const link = navScope.getByRole("link", { name: route.name });
      expect(link).toHaveAttribute("href", route.href);
      expect(link.className).toMatch(/min-h-\[44px\]/);
    }
  });

  it("closes the mobile menu when Escape key is pressed", () => {
    const { getByRole, queryByRole } = render();
    const toggle = getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);
    expect(getByRole("navigation", { name: /mobile navigation/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(queryByRole("navigation", { name: /mobile navigation/i })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the mobile menu when a navigation link is clicked", () => {
    const { getByRole, queryByRole } = render();
    const toggle = getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);

    const mobileNav = getByRole("navigation", { name: /mobile navigation/i });
    const link = within(mobileNav).getByRole("link", { name: /verify/i });
    fireEvent.click(link);

    expect(queryByRole("navigation", { name: /mobile navigation/i })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("sets aria-current='page' on the active route in mobile menu", () => {
    const { getByRole } = render("/gate");
    const toggle = getByRole("button", { name: /menu/i });
    fireEvent.click(toggle);

    const mobileNav = getByRole("navigation", { name: /mobile navigation/i });
    const gateLink = within(mobileNav).getByRole("link", { name: /gate/i });
    expect(gateLink).toHaveAttribute("aria-current", "page");

    const overviewLink = within(mobileNav).getByRole("link", { name: /overview/i });
    expect(overviewLink).not.toHaveAttribute("aria-current");
  });
});
