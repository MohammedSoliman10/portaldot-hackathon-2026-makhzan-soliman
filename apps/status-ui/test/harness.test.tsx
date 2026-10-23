import { describe, expect, it } from "vitest";
import { renderApp } from "../src/test/render";

describe("test harness", () => {
  it("renders a component with the evidence layer injected", () => {
    const { getByRole } = renderApp(<h1>harness</h1>);
    expect(getByRole("heading", { level: 1 })).toHaveTextContent("harness");
  });
});
