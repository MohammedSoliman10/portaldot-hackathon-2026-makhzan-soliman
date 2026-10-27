import { describe, expect, it, vi } from "vitest";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { Overview } from "../src/pages/Overview";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
const TX = "0xf29a52c507726ceed20861f2cc4cc5f937542d0caa42a7e2a369ea08c998e3e7";
const SLOT0 = "0x0000000189c00000006400010000000200038d7ea4c6800007d0040000000032";
const OWNER = "0x0948EBD7637D1C32858a6FC5D947E85A6600205C";
const ROOT = "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7";

const evidence = (): EvidenceBundle => run2 as unknown as EvidenceBundle;
const live = () =>
  resolveMode(
    parseConfig({
      VITE_MAKHZAN_MODE: "LIVE",
      VITE_MAKHZAN_RPC_URL: "https://test-evm-rpc-v3.portaldot.dev",
      VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
    }),
  );

const evidenceState = () => ({ bundle: evidence(), verified: true, error: null, loading: false });

function liveClient(overrides: Partial<ReadClient> = {}): ReadClient {
  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (functionName === "peek") return [SLOT0];
      if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
      if (functionName === "dealOf") {
        const id = Number(args?.[0]);
        return [OWNER, id === 1 ? 172266 : 172578, id === 1 ? 172416 : 172878, 1, 1, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 500000000000000n];
      }
      if (functionName === "healthOf") return 0;
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x60006000"),
    getBlockNumber: vi.fn(async () => 173200n),
    getBalance: vi.fn(async () => 24000000000000000000n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
    ...overrides,
  } as unknown as ReadClient;
}

describe("Overview, recorded", () => {
  it("shows the deployment identity from the evidence", () => {
    const { container, getByText } = renderApp(<Overview />, { evidence: evidenceState() });
    const text = container.textContent ?? "";
    expect(text).toContain(ADDRESS);
    expect(text).toContain(TX);
    expect(text).toContain("171,308");
    expect(text).toContain("420420777");
    expect(getByText(/runtime code hash/i)).toBeInTheDocument();
  });

  it("labels every number REPORTED or PENDING, never MEASURED, when no RPC is read", () => {
    const { container } = renderApp(<Overview />, { evidence: evidenceState() });
    const labels = [...container.querySelectorAll("[data-label]")].map((node) => node.getAttribute("data-label"));
    expect(labels.length).toBeGreaterThan(12);
    for (const label of labels) expect(["REPORTED", "PENDING LIVE RUN"]).toContain(label);
    expect(container.querySelector("[data-label='MEASURED']")).toBeNull();
  });

  it("states the on-chain config", () => {
    const { container } = renderApp(<Overview />, { evidence: evidenceState() });
    const text = container.textContent ?? "";
    for (const expected of ["50", "1,024", "2,000 bps", "10", "100", "100,800"]) {
      expect(text).toContain(expected);
    }
  });

  it("shows the recorded run: pass answer, slash resolve, claims and settles", () => {
    const { container } = renderApp(<Overview />, { evidence: evidenceState() });
    const text = container.textContent ?? "";
    expect(text).toMatch(/live results/i);
    expect(text).toContain("172,585");
    expect(text).toContain("172,658");
    expect(text).toContain("172,557");
    expect(text).toContain("172,564");
    expect(text).toContain("172,881");
    expect(text).toContain("172,887");
    expect(text).toContain("6 tPOT");
    expect(text).toContain("0xb1ddb1fb54e6f4c4405cfcb85640cae51808ef6ce7509f0e14acc422c3621210");
    expect(text).toContain("0x97da004710a5e01ea97b9d602f5b8ef5c5382ea5800c5d52b02951cb6809e8a3");
  });

  it("links to the repository and the README", () => {
    const { getByRole } = renderApp(<Overview />, { evidence: evidenceState() });
    expect(getByRole("link", { name: /repository/i })).toHaveAttribute(
      "href",
      "https://github.com/MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman",
    );
    expect(getByRole("link", { name: /readme/i })).toHaveAttribute(
      "href",
      "https://github.com/MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman#readme",
    );
  });
});

describe("Overview, live overlay", () => {
  it("replaces the config with MEASURED values and a block/time source", async () => {
    const { container, findByTestId } = renderApp(<Overview client={liveClient()} />, {
      mode: live(),
      evidence: evidenceState(),
    });
    await findByTestId("live-source");
    const measured = [...container.querySelectorAll("[data-label='MEASURED']")];
    expect(measured.length).toBeGreaterThan(6);
    expect(container.textContent).toContain("173,200");
    expect(container.textContent).toMatch(/test-evm-rpc-v3\.portaldot\.dev/);
  });

  it("reads the provider bond, both deal healths and the contract balance", async () => {
    const { container, findByTestId } = renderApp(<Overview client={liveClient()} />, {
      mode: live(),
      evidence: evidenceState(),
    });
    await findByTestId("live-results");
    const text = container.textContent ?? "";
    expect(text).toMatch(/provider 1 bond/i);
    expect(text).toContain("24");
    expect(text).toMatch(/deal 1 health/i);
    expect(text).toMatch(/deal 2 health/i);
    expect(text).toMatch(/contract balance/i);
    expect(text).toContain("24 tPOT");
  });

  it("says deals 1 and 2 are settled, so health 0 reads as settled and not as a fault", async () => {
    const { container, findByTestId } = renderApp(<Overview client={liveClient()} />, {
      mode: live(),
      evidence: evidenceState(),
    });
    await findByTestId("live-results");
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/deals 1 and 2 are both settled/i);
    expect(text).toMatch(/health 0 is the settled state, not a fault/i);
    expect(text).toMatch(/deal 1 was answered in time/i);
    expect(text).toMatch(/deal 2 took one slash/i);
  });

  it("keeps the last good value and shows STALE after a failed re-read", async () => {
    let clock = Date.UTC(2026, 9, 24, 10, 0, 0);
    let fail = false;
    const client = liveClient({
      readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
        if (fail) throw new Error("rpc down");
        if (functionName === "peek") return [SLOT0];
        if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
        if (functionName === "dealOf") {
          const id = Number(args?.[0]);
          return [OWNER, id === 1 ? 172266 : 172578, id === 1 ? 172416 : 172878, 1, 1, ROOT, 1024, 1048576, 0, 0, 500000000000000n, 500000000000000n];
        }
        if (functionName === "healthOf") return 0;
        return 0;
      }),
    });

    const { findByTestId, getByRole, container } = renderApp(<Overview client={client} now={() => clock} />, {
      mode: live(),
      evidence: evidenceState(),
    });

    await findByTestId("live-source");
    clock += 31_000;
    fail = true;
    getByRole("button", { name: /re-read/i }).click();

    await findByTestId("live-stale");
    expect(container.textContent).toContain("50");
  });
});
