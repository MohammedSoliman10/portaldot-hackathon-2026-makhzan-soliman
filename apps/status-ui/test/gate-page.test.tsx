import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { App } from "../src/app/App";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { Gate } from "../src/pages/Gate";
import { renderApp } from "../src/test/render";

const MAKHZAN = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
const GATE = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const LIVE_GATE = "0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA";
const RPC = "https://test-evm-rpc-v3.portaldot.dev";
const PAYER = "0x0948EBD7637D1C32858a6FC5D947E85A6600205C";
const PAYEE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const AMOUNT = 500_000_000_000_000n; // 5 tPOT in planck (1e14 per tPOT)
const MIN_BOND = 2_400_000_000_000_000n; // 24 tPOT

const bundle = run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle, verified: true, error: null, loading: false });

const mode = (gate: string | null) =>
  resolveMode(
    parseConfig({
      VITE_MAKHZAN_MODE: "LIVE",
      VITE_MAKHZAN_RPC_URL: RPC,
      VITE_MAKHZAN_CONTRACT_ADDRESS: MAKHZAN,
      VITE_GATE_ADDRESS: gate ?? undefined,
    }),
  );

interface GateClientInput {
  status?: number;
  health?: number;
  endBlock?: number;
  block?: number;
  bond?: bigint;
  providerId?: number;
  payeeProviderId?: number;
  minBond?: bigint;
  code?: string;
}

function gateClient(input: GateClientInput = {}): ReadClient {
  const {
    status = 1,
    health = 1,
    endBlock = 172_878,
    block = 172_700,
    bond = 2_400_000_000_000_000n,
    providerId = 1,
    payeeProviderId = providerId,
    minBond = MIN_BOND,
    code = "0x6080604052",
  } = input;

  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "lockOf") return [PAYER, AMOUNT, PAYEE, minBond, status];
      if (functionName === "healthOf") return health;
      if (functionName === "dealOf")
        return [
          PAYER,
          172_578,
          endBlock,
          providerId,
          1,
          "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7",
          1024,
          1_048_576,
          0,
          0,
          5_000_000_000_000_000n,
          5_000_000_000_000_000n,
        ];
      if (functionName === "providerOf") return [payeeProviderId, bond, 0n, true];
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => code),
    getBlockNumber: vi.fn(async () => BigInt(block)),
    getBalance: vi.fn(async () => 0n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
  } as unknown as ReadClient;
}

const live = (client: ReadClient, gate: string | null = GATE) =>
  renderApp(<Gate client={client} />, { route: "/gate", mode: mode(gate), evidence: evidenceState() });

describe("the gate page without an address", () => {
  it("says StorageGate is not deployed yet and shows no address at all", () => {
    const { container, getByText } = renderApp(<Gate />, {
      route: "/gate",
      mode: mode(null),
      evidence: evidenceState(),
    });
    expect(getByText("StorageGate is not deployed yet")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(container.textContent).toMatch(/VITE_GATE_ADDRESS/);
    expect(container.querySelector("[data-label='DESIGN NOTE']")).not.toBeNull();
  });

  it("reports a malformed address instead of inventing one", () => {
    const parsed = parseConfig({
      VITE_MAKHZAN_MODE: "LIVE",
      VITE_MAKHZAN_RPC_URL: RPC,
      VITE_MAKHZAN_CONTRACT_ADDRESS: MAKHZAN,
      VITE_GATE_ADDRESS: "0x1234",
    });
    const { container } = renderApp(<Gate />, {
      route: "/gate",
      mode: resolveMode(parsed),
      evidence: evidenceState(),
    });
    expect(container.textContent).toMatch(/VITE_GATE_ADDRESS/);
    expect(container.textContent).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });
});

describe("the gate page with an address", () => {
  it("shows the lock, the guard decision and a release that would pass now", async () => {
    const { findByTestId, container } = live(gateClient());
    await findByTestId("gate-live");

    const text = container.textContent ?? "";
    expect(text).toContain(GATE);
    expect(text).toContain(PAYER);
    expect(text).toContain(PAYEE);
    expect(text).toContain("5 tPOT");
    expect(text).toContain("24 tPOT");
    expect(text).toContain("locked");
    expect(text).toContain("172,878");
    expect(await findByTestId("gate-decision")).toHaveTextContent("healthy");
    expect(await findByTestId("gate-verdict")).toHaveTextContent("release would pass now");
    expect(container.querySelectorAll("[data-label='MEASURED']").length).toBeGreaterThan(4);
    expect(container.querySelectorAll("[data-label='REPORTED']").length).toBeGreaterThan(0);
    expect(text).toContain(
      "healthOf == 1 means no open challenge, not proof the file is stored; minBond is how a consumer notices a past slash.",
    );
  });

  it("names Pending when a challenge is open", async () => {
    const { findByTestId } = live(gateClient({ health: 2 }));
    expect(await findByTestId("gate-verdict")).toHaveTextContent("release would revert: Pending");
    expect(await findByTestId("gate-decision")).toHaveTextContent("pending");
  });

  it("names Default when a challenge is past its deadline", async () => {
    const { findByTestId } = live(gateClient({ health: 3 }));
    expect(await findByTestId("gate-verdict")).toHaveTextContent("release would revert: Default");
    expect(await findByTestId("gate-decision")).toHaveTextContent("default");
  });

  it("names SettledOrNone when the deal is settled or never existed", async () => {
    const { findByTestId } = live(gateClient({ health: 0 }));
    expect(await findByTestId("gate-verdict")).toHaveTextContent("release would revert: SettledOrNone");
    expect(await findByTestId("gate-decision")).toHaveTextContent("settled-or-none");
  });

  it("names Expired when health is 1 but the end block has passed", async () => {
    const { findByTestId, container } = live(gateClient({ block: 172_900, endBlock: 172_878 }));
    expect(await findByTestId("gate-verdict")).toHaveTextContent("release would revert: Expired");
    expect(await findByTestId("gate-decision")).toHaveTextContent("expired");
    expect(container.textContent).toMatch(/end block/i);
  });

  it("names BondTooLow when the payee's bond is under the floor", async () => {
    const { findByTestId } = live(gateClient({ bond: 2_300_000_000_000_000n, minBond: MIN_BOND }));
    expect(await findByTestId("gate-verdict")).toHaveTextContent("release would revert: BondTooLow");
  });

  it("names NotLocked when the payment was already released", async () => {
    const { findByTestId } = live(gateClient({ status: 2 }));
    expect(await findByTestId("gate-verdict")).toHaveTextContent("release would revert: NotLocked");
  });

  it("names NotLocked when nothing is locked yet (status 0)", async () => {
    const { findByTestId } = live(gateClient({ status: 0 }));
    expect(await findByTestId("gate-verdict")).toHaveTextContent("release would revert: NotLocked");
  });

  it("renders the makhzan address as a link to the overview page", async () => {
    const { findByTestId, container } = live(gateClient());
    await findByTestId("gate-live");
    const makhzanLink = container.querySelector(`a[href="/"]`);
    expect(makhzanLink).not.toBeNull();
    expect(makhzanLink?.textContent).toContain(MAKHZAN);
  });

  it("displays the live gate address when configured", async () => {
    const { findByTestId, container } = live(gateClient(), LIVE_GATE);
    await findByTestId("gate-live");
    expect(container.textContent).toContain(LIVE_GATE);
  });

  it("counts no bond when the payee is not the deal's provider", async () => {
    const { findByTestId, container } = live(gateClient({ providerId: 1, payeeProviderId: 2 }));
    await findByTestId("gate-live");
    expect(container.textContent).toMatch(/not the deal's provider/i);
  });

  it("says there is no contract when the address holds no code", async () => {
    const { findByTestId } = live(gateClient({ code: "0x" }));
    expect(await findByTestId("gate-no-code")).toHaveTextContent(/no contract/i);
  });

  it("reads a typed deal id and says when the evidence does not hold it", async () => {
    const client = gateClient();
    const { getByLabelText, getByRole, getByTestId, findByTestId, user } = live(client);
    await findByTestId("gate-live");
    await user.clear(getByLabelText(/deal id/i));
    await user.type(getByLabelText(/deal id/i), "7");
    await user.click(getByRole("button", { name: /^read$/i }));
    await waitFor(() => expect(getByTestId("gate-live")).toHaveAttribute("data-deal-id", "7"));
    const mock = client.readContract as unknown as { mock: { calls: Array<[{ functionName: string; args?: unknown[] }]> } };
    expect(
      mock.mock.calls.some(
        ([args]) => args.functionName === "lockOf" && JSON.stringify(args.args) === "[7]",
      ),
    ).toBe(true);
    expect(await findByTestId("gate-evidence")).toHaveTextContent(/not in the evidence/i);
  });

  it("says a recorded build opens no socket, even with an address set", () => {
    const recorded = resolveMode(parseConfig({ VITE_MAKHZAN_MODE: "RECORDED", VITE_GATE_ADDRESS: GATE }));
    const { container } = renderApp(<Gate />, {
      route: "/gate",
      mode: recorded,
      evidence: evidenceState(),
    });
    expect(container.textContent).toMatch(/makes no live read/i);
  });

  it("is reachable from the nav", () => {
    const { container } = renderApp(<App mode={mode(null)} evidence={evidenceState()} />, {
      route: "/gate",
      mode: mode(null),
      evidence: evidenceState(),
    });
    const link = container.querySelector("nav[aria-label='Sections'] a[href='/gate']");
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Gate");
    expect(container.textContent).toContain("StorageGate is not deployed yet");
  });
});
