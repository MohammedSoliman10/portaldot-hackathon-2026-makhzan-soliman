import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../src/components/shared/Card";
import { Button } from "../src/components/shared/Button";
import { Chip } from "../src/components/shared/Chip";
import { Hero } from "../src/components/shared/Hero";
import { Stat } from "../src/components/shared/Stat";

describe("Shared Voltline design components", () => {
  describe("Card", () => {
    it("renders as a rounded white card with soft shadow", () => {
      const { container } = render(<Card>Card content</Card>);
      const card = container.firstChild as HTMLElement;
      expect(card).toBeInTheDocument();
      expect(card.className).toMatch(/bg-white/);
      expect(card.className).toMatch(/rounded-/);
      expect(card.className).toMatch(/shadow-/);
      expect(screen.getByText("Card content")).toBeInTheDocument();
    });
  });

  describe("Button", () => {
    it("renders a pill button with >= 44px touch target", () => {
      render(<Button variant="primary">Click me</Button>);
      const btn = screen.getByRole("button", { name: "Click me" });
      expect(btn).toBeInTheDocument();
      expect(btn.className).toMatch(/rounded-full/);
      expect(btn.className).toMatch(/min-h-\[44px\]/);
    });

    it("uses black text on gold for primary variant, never gold text", () => {
      render(<Button variant="primary">Start</Button>);
      const btn = screen.getByRole("button", { name: "Start" });
      expect(btn.className).toMatch(/bg-ochre/);
      expect(btn.className).toMatch(/text-ink/);
    });

    it("supports secondary and dark ink pill variants", () => {
      const { rerender } = render(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole("button", { name: "Secondary" }).className).toMatch(/border/);

      rerender(<Button variant="dark">Dark Hero Action</Button>);
      expect(screen.getByRole("button", { name: "Dark Hero Action" }).className).toMatch(/bg-/);
    });
  });

  describe("Chip", () => {
    it("renders pill chips with text labels", () => {
      render(<Chip label="MEASURED" />);
      const chip = screen.getByText("MEASURED");
      expect(chip).toBeInTheDocument();
      expect(chip.className).toMatch(/rounded-full/);
      expect(chip).toHaveAttribute("data-label", "MEASURED");
    });

    it("supports semantic status chips with explicit text", () => {
      render(<Chip label="REPORTED" tone="neutral" />);
      expect(screen.getByText("REPORTED")).toBeInTheDocument();
    });
  });

  describe("Hero", () => {
    it("renders a dark hero container with highlighter text support", () => {
      const { container } = render(
        <Hero
          headline={
            <>
              Don't trust your storage provider. Make them{" "}
              <span className="highlight-pill">prove</span> it.
            </>
          }
          subtitle="A storage-proof ledger on Portaldot"
        />
      );
      const hero = container.firstChild as HTMLElement;
      expect(hero).toBeInTheDocument();
      expect(hero.className).toMatch(/bg-/);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        /Don't trust your storage provider\. Make them prove it\./
      );
      expect(screen.getByText("A storage-proof ledger on Portaldot")).toBeInTheDocument();
    });
  });

  describe("Stat", () => {
    it("renders mono numerics with a label and chip", () => {
      render(<Stat value="2 deals" subtitle="verified on-chain" label="MEASURED" />);
      expect(screen.getByText("2 deals")).toHaveClass("font-mono");
      expect(screen.getByText("verified on-chain")).toBeInTheDocument();
      expect(screen.getByText("MEASURED")).toBeInTheDocument();
    });
  });
});
