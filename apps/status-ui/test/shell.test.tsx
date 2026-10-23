import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { resolveMode } from "../src/config/modes";
import { parseConfig } from "../src/config/env";
import { evidenceState } from "../src/test/fixtures";
import { renderApp } from "../src/test/render";

const ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const modeOf = (values: Record<string, string> = {}) => resolveMode(parseConfig(values));

const recorded = () => modeOf();
const local = () =>
  modeOf({ VITE_MAKHZAN_MODE: "LOCAL", VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS, VITE_MAKHZAN_RPC_URL: "http://127.0.0.1:8564" });
const live = () =>
  modeOf({ VITE_MAKHZAN_MODE: "LIVE", VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS, VITE_MAKHZAN_RPC_URL: "http://127.0.0.1:8564" });

const render = (mode = recorded(), evidence = evidenceState(), route = "/") =>
  renderApp(<App mode={mode} evidence={evidence} />, { route, evidence });

describe("mode banner", () => {
  it("states RECORDED, the evidence time and that no RPC is read", () => {
    const { getByRole } = render();
    const banner = getByRole("status");
    expect(banner).toHaveTextContent("RECORDED");
    expect(banner).toHaveTextContent("2026-10-23T08:21Z");
    expect(banner).toHaveTextContent("No RPC is being read");
  });

  it("states LOCAL with the host and chain id", () => {
    const { getByRole } = render(local());
    const banner = getByRole("status");
    expect(banner).toHaveTextContent("LOCAL");
    expect(banner).toHaveTextContent("127.0.0.1:8564");
    expect(banner).toHaveTextContent("420420777");
    expect(banner).toHaveTextContent("Reads only");
  });

  it("states LIVE with the host", () => {
    const { getByRole } = render(live());
    const banner = getByRole("status");
    expect(banner).toHaveTextContent("LIVE");
    expect(banner).toHaveTextContent("via 127.0.0.1:8564");
  });
});

describe("blocking notices", () => {
  it("shows a configuration notice and keeps the recorded layer", () => {
    const mode = modeOf({ VITE_MAKHZAN_MODE: "LIVE" });
    const { getByRole } = render(mode);
    const banner = getByRole("status");
    expect(banner).toHaveTextContent("CONFIG");
    expect(banner).toHaveTextContent(/recorded evidence/i);
    expect(banner).toHaveTextContent(/contract address/i);
  });

  it("shows a chain mismatch naming both ids", () => {
    const mode = { ...local(), observedChainId: 31337, clientEnabled: false, blocking: { kind: "chain-mismatch" as const, detail: "CHAIN MISMATCH — expected 420420777, node reports 31337. Live reads paused." } };
    const { getByRole } = render(mode);
    const banner = getByRole("status");
    expect(banner).toHaveTextContent("CHAIN MISMATCH");
    expect(banner).toHaveTextContent("420420777");
    expect(banner).toHaveTextContent("31337");
  });

  it("shows an evidence/deployment mismatch warning", () => {
    const mode = { ...local(), blocking: { kind: "evidence-mismatch" as const, detail: "EVIDENCE — this bundle describes chain 420420777 at 0x5FbD…0aa3, not the configured deployment." } };
    const { getByRole } = render(mode);
    expect(getByRole("status")).toHaveTextContent("EVIDENCE");
    expect(getByRole("status")).toHaveTextContent("not the configured deployment");
  });
});

describe("evidence notice", () => {
  it("never blanks a route when the bundle is missing", () => {
    const { getByRole, getByText } = render(recorded(), { bundle: null, verified: false, error: "evidence manifest unavailable (HTTP 404)", loading: false });
    expect(getByText(/evidence manifest unavailable/i)).toBeInTheDocument();
    expect(getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("marks an unverified bundle without hiding it", () => {
    const { getByText } = render(recorded(), { ...evidenceState(), verified: false, error: "unverified evidence: hash mismatch" });
    expect(getByText(/unverified evidence/i)).toBeInTheDocument();
  });
});

describe("shell", () => {
  it("has a skip link to the main landmark", () => {
    const { getByText } = render();
    const skip = getByText(/skip to content/i);
    expect(skip).toHaveAttribute("href", "#main");
  });

  it("carries the label legend and both vocabularies", () => {
    const { getByTestId } = render();
    const legend = getByTestId("label-legend");
    for (const label of ["MEASURED", "REPORTED", "SIMULATED", "PENDING LIVE RUN"]) {
      expect(legend).toHaveTextContent(label);
    }
    expect(legend).toHaveTextContent("unanswered");
    expect(legend).toHaveTextContent("read back");
  });

  it("ends with the read-only source line", () => {
    const { getByTestId } = render();
    expect(getByTestId("footer")).toHaveTextContent("read-only: this page cannot sign, send or spend");
    expect(getByTestId("footer")).toHaveTextContent("local-anvil-2026-10-23");
  });

  it("renders a route inside the shell with one h1", () => {
    const { getAllByRole } = render(recorded(), evidenceState(), "/deal/2");
    expect(getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders a not-found page inside the shell for an unknown route", () => {
    const { getByRole, getByText } = render(recorded(), evidenceState(), "/nope");
    expect(getByRole("heading", { level: 1 })).toHaveTextContent(/not found/i);
    expect(getByText(/overview/i)).toBeInTheDocument();
    expect(getByText(/verify/i)).toBeInTheDocument();
  });
});
