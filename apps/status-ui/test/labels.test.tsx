import { describe, expect, it } from "vitest";
import { Metric as MetricView } from "../src/components/Metric";
import { formatBytes, formatCount, formatNative, formatWei, metric, pendingLiveRun, toDecimal } from "../src/data/labels";
import { renderApp } from "../src/test/render";

describe("formatting", () => {
  it("formats native units with 14 decimals and trims trailing zeros", () => {
    expect(formatNative("10000000000000000")).toBe("100");
    expect(formatNative("8000000000000000")).toBe("80");
    expect(formatNative("2000000000000000")).toBe("20");
    expect(formatNative("1000000000000000")).toBe("10");
    expect(formatNative("5000000000000")).toBe("0.05");
    expect(formatNative("1000000000000")).toBe("0.01");
  });

  it("never prints a rounded zero for a positive amount", () => {
    expect(formatNative("1")).toBe("< 0.0001");
    expect(formatNative("0")).toBe("0");
  });

  it("formats wei and counts with grouping", () => {
    expect(formatWei("20000000000000000000")).toBe("20,000,000,000,000,000,000");
    expect(formatCount(8192)).toBe("8,192");
    expect(formatBytes(6566)).toBe("6,566 bytes");
  });

  it("guards decimal strings instead of using Number", () => {
    expect(toDecimal("0")).toBe(0n);
    expect(toDecimal("8000000000000000")).toBe(8000000000000000n);
    for (const bad of ["1.5", "007", "-1", "", "1e18", " 1"]) {
      expect(() => toDecimal(bad)).toThrow();
    }
  });
});

describe("metric contract", () => {
  it("requires a label and a source", () => {
    const value = metric({ value: "80", unit: "tPOT", label: "REPORTED", source: "evidence/local.json" });
    expect(value.label).toBe("REPORTED");
    expect(value.source).toBe("evidence/local.json");
    expect(value.stale).toBe(false);

    expect(() =>
      metric({ value: "80", unit: "tPOT", label: undefined as never, source: "x" }),
    ).toThrow(/label/);
    expect(() => metric({ value: "80", unit: "tPOT", label: "REPORTED", source: "" })).toThrow(/source/);
  });

  it("gives PENDING LIVE RUN no value", () => {
    const pending = pendingLiveRun("evidence/local.json");
    expect(pending.value).toBeNull();
    expect(pending.label).toBe("PENDING LIVE RUN");
    expect(pending.unavailableReason).toContain("pending live run");
    expect(() =>
      metric({ value: "1", unit: "tPOT", label: "PENDING LIVE RUN", source: "x" }),
    ).toThrow(/PENDING LIVE RUN/);
  });

  it("allows a stale badge only on a measured value", () => {
    expect(() =>
      metric({ value: "80", unit: "tPOT", label: "MEASURED", source: "chain", stale: true }),
    ).not.toThrow();
    expect(() =>
      metric({ value: "80", unit: "tPOT", label: "REPORTED", source: "evidence", stale: true }),
    ).toThrow(/stale/i);
  });

  it("requires a reason whenever the value is absent", () => {
    expect(() => metric({ value: null, unit: "", label: "REPORTED", source: "x" })).toThrow(/reason/);
    const unavailable = metric({
      value: null,
      unit: "",
      label: "REPORTED",
      source: "x",
      unavailableReason: "not recorded by the run",
    });
    expect(unavailable.value).toBeNull();
  });
});

describe("Metric component", () => {
  it("renders the value with its label and source", () => {
    const { container } = renderApp(
      <MetricView metric={metric({ value: "80", unit: "tPOT", label: "REPORTED", source: "evidence/local-anvil.json" })} />,
    );
    expect(container.textContent).toContain("80");
    expect(container.textContent).toContain("tPOT");
    expect(container.textContent).toContain("REPORTED");
    expect(container.textContent).toContain("evidence/local-anvil.json");
    expect(container.querySelector("[data-stale='true']")).toBeNull();
  });

  it("renders the reason instead of a number when a value is missing", () => {
    const { container } = renderApp(<MetricView metric={pendingLiveRun("evidence/local.json")} />);
    expect(container.textContent).toContain("PENDING LIVE RUN");
    expect(container.textContent).toMatch(/pending live run/i);
    expect(container.querySelector(".metric-value")?.textContent).not.toMatch(/\d/);
  });

  it("shows a stale badge with the last-good time", () => {
    const stale = metric({
      value: "120",
      unit: "tPOT",
      label: "MEASURED",
      source: "chain 420420777 @ block 42",
      at: "2026-10-23T08:30:00Z",
      stale: true,
    });
    const { container } = renderApp(<MetricView metric={stale} />);
    expect(container.textContent).toContain("STALE");
    expect(container.textContent).toContain("2026-10-23T08:30:00Z");
  });
});
