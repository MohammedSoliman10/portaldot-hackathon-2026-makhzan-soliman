import { describe, expect, it, vi } from "vitest";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { App } from "../src/app/App";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import { formatNative, formatWeiAsNative } from "../src/data/labels";
import type { EvidenceBundle } from "../src/data/schema";
import { Deal } from "../src/pages/Deal";
import { Gate } from "../src/pages/Gate";
import { renderApp } from "../src/test/render";

const MAKHZAN = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
const GATE = "0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA";
const RPC = "https://test-evm-rpc-v3.portaldot.dev";
const PAYER = "0x0948EBD7637D1C32858a6FC5D947E85A6600205C";
const PAYEE = "0xf4ec143c743FF57c0D32e829f50692551CBf6029"; // provider-1

const bundle = run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle, verified: true, error: null, loading: false });

const liveMode = resolveMode(
  parseConfig({
    VITE_MAKHZAN_MODE: "LIVE",
    VITE_MAKHZAN_RPC_URL: RPC,
    VITE_MAKHZAN_CONTRACT_ADDRESS: MAKHZAN,
    VITE_GATE_ADDRESS: GATE,
  }),
);

function makeClient(overrides: {
  lockStatus?: number;
  amountWei?: bigint;
  minBond?: bigint;
  health?: number;
  block?: number;
  endBlock?: number;
  providerBond?: bigint;
  dealReads?: Record<number, unknown[]>;
  healthReads?: Record<number, number>;
} = {}): ReadClient {
  const {
    lockStatus = 1,
    amountWei = 2_000_000_000_000_000_000n, // 2e18 wei = 2 tPOT
    minBond = 20_000_000_000_000_000n, // 20 tPOT in planck (2e15)
    health = 1,
    block = 252550,
    endBlock = 255544,
    providerBond = 24_000_000_000_000_000n, // 24 tPOT in planck (2.4e15)
    dealReads = {},
    healthReads = {},
  } = overrides;

  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      if (functionName === "lockOf") {
        return [PAYER, amountWei, PAYEE, minBond, lockStatus];
      }
      if (functionName === "healthOf") {
        const id = Number(args?.[0] ?? 1);
        if (id in healthReads) return healthReads[id];
        return health;
      }
      if (functionName === "dealOf") {
        const id = Number(args?.[0] ?? 1);
        if (id in dealReads) return dealReads[id];
        return [
          PAYER,
          252500,
          endBlock,
          1, // providerId
          0, // flags
          "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7",
          1024,
          1_048_576,
          0,
          0,
          500_000_000_000_000n, // 5 tPOT priceUnits in planck
          0n,
        ];
      }
      if (functionName === "providerOf") {
        return [1, providerBond, 1, true];
      }
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x6080604052"),
    getBlockNumber: vi.fn(async () => BigInt(block)),
    getBalance: vi.fn(async () => 0n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
  } as unknown as ReadClient;
}

describe("1. Amount units and planck vs wei formatting", () => {
  it("formats 2e18 wei as 2 tPOT via formatWeiAsNative", () => {
    expect(formatWeiAsNative("2000000000000000000")).toBe("2");
  });

  it("formats minBond 2e15 planck as 20 tPOT via formatNative", () => {
    expect(formatNative("2000000000000000")).toBe("20");
  });

  it("formats bond 2.4e15 planck as 24 tPOT via formatNative", () => {
    expect(formatNative("2400000000000000")).toBe("24");
  });

  it("displays 2 tPOT (not 20,000 tPOT) and wei (not planck) for 2e18 wei amount on /gate", async () => {
    const client = makeClient({ amountWei: 2_000_000_000_000_000_000n });
    const { findByTestId, container } = renderApp(<Gate client={client} />, {
      route: "/gate",
      mode: liveMode,
      evidence: evidenceState(),
    });
    await findByTestId("gate-live");

    const text = container.textContent ?? "";
    expect(text).toContain("2 tPOT");
    expect(text).not.toContain("20,000 tPOT");
    expect(text).toContain("2,000,000,000,000,000,000 wei");
    expect(text).not.toContain("2,000,000,000,000,000,000 planck");
  });
});

describe("2. Released or refunded lock neutral state", () => {
  it("shows neutral 'Released: 2 tPOT paid to the payee' banner and NO red revert banner for released lock (status 2)", async () => {
    const client = makeClient({ lockStatus: 2, amountWei: 2_000_000_000_000_000_000n });
    const { findByTestId, queryByTestId, container } = renderApp(<Gate client={client} />, {
      route: "/gate",
      mode: liveMode,
      evidence: evidenceState(),
    });
    await findByTestId("gate-live");

    // Verdict banner (red error) must NOT be present
    expect(queryByTestId("gate-verdict")).toBeNull();
    expect(container.textContent).not.toContain("release would revert: NotLocked");

    // Neutral released banner must be present
    expect(container.textContent).toContain("Released: 2 tPOT paid to the payee");
  });

  it("shows neutral 'Refunded: 2 tPOT returned to the payer' banner and NO red revert banner for refunded lock (status 3)", async () => {
    const client = makeClient({ lockStatus: 3, amountWei: 2_000_000_000_000_000_000n });
    const { findByTestId, queryByTestId, container } = renderApp(<Gate client={client} />, {
      route: "/gate",
      mode: liveMode,
      evidence: evidenceState(),
    });
    await findByTestId("gate-live");

    expect(queryByTestId("gate-verdict")).toBeNull();
    expect(container.textContent).not.toContain("release would revert: NotLocked");
    expect(container.textContent).toContain("Refunded: 2 tPOT returned to the payer");
  });

  it("keeps verdict banner for locked locks only (status 1)", async () => {
    const client = makeClient({ lockStatus: 1 });
    const { findByTestId } = renderApp(<Gate client={client} />, {
      route: "/gate",
      mode: liveMode,
      evidence: evidenceState(),
    });
    const verdict = await findByTestId("gate-verdict");
    expect(verdict).toBeInTheDocument();
  });
});

describe("3. Expiry precedence note under verdict", () => {
  it("adds the expiry before bond floor precedence note under the verdict", async () => {
    const client = makeClient({ lockStatus: 1 });
    const { findByTestId } = renderApp(<Gate client={client} />, {
      route: "/gate",
      mode: liveMode,
      evidence: evidenceState(),
    });
    const verdict = await findByTestId("gate-verdict");
    expect(verdict.textContent).toContain(
      "The guard checks expiry before the bond floor, so an expired deal shows Expired even if the bond is too low.",
    );
  });
});

describe("4. /deal/:id for arbitrary deal IDs (e.g. 4)", () => {
  it("reads deal 4 live, displays MEASURED fields and the disclaimer note", async () => {
    const deal4Data = [
      PAYER, // owner
      252512, // startBlock
      255512, // endBlock
      1, // providerId
      0, // flags
      "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7", // root
      1024, // leafCount
      1048576, // size
      0, // challengeIndex
      0, // challengeStart
      500000000000000n, // priceUnits (5 tPOT)
      0n, // claimedUnits
    ];

    const client = makeClient({
      dealReads: { 4: deal4Data },
      healthReads: { 4: 1 },
    });

    const { findByTestId, container } = renderApp(<App mode={liveMode} evidence={evidenceState()} client={client} />, {
      route: "/deal/4",
      mode: liveMode,
      evidence: evidenceState(),
    });

    await findByTestId("deal-live");

    const text = container.textContent ?? "";
    expect(text).toContain("Deal 4");
    expect(text).toContain("The full story and receipts exist only for recorded deals 1 and 2.");
    expect(text).toContain(PAYER);
    expect(text).toContain("5 tPOT");
    expect(text).toContain("1,048,576");
    expect(text).toContain("255,512");
  });
});

describe("5. Live gate demo section on /gate", () => {
  it("renders the Live gate demo section listing deals 3, 4, and 5 with REPORTED labels and tx hashes", async () => {
    const client = makeClient();
    const { findByTestId, container } = renderApp(<Gate client={client} />, {
      route: "/gate",
      mode: liveMode,
      evidence: evidenceState(),
    });
    await findByTestId("gate-live");

    const demoSection = container.querySelector("#live-gate-demo-heading")?.closest("section");
    expect(demoSection).not.toBeNull();
    const demoText = demoSection?.textContent ?? "";

    expect(demoText).toContain("Live gate demo");
    expect(demoText).toContain("Deal 3");
    expect(demoText).toContain("Expired");
    expect(demoText).toContain("0x196d1ab6b059441ad92a17e83d98b5da2f8fa8c223ed6f79a42df238284689ee");

    expect(demoText).toContain("Deal 4");
    expect(demoText).toContain("0x3719248237ec37c916b11e3d014aebba05d84cedcdcdc79cc1b9feaa18a62203");
    expect(demoText).toContain("0x4c63d339e7db1cfa9ef7b48194d38f6b2c2613f60d6cf0d3d3c6afbbc6d35c3f");

    expect(demoText).toContain("Deal 5");
    expect(demoText).toContain("BondTooLow");
    expect(demoText).toContain("252560");
    expect(demoText).toContain("RefundNotAllowed");
    expect(demoText).toContain("0xf84af2e383b8239c350a16bdf074a14925cd954cacd3ca25ec1621a5fcf869db");

    // All must be labeled REPORTED
    const chips = demoSection?.querySelectorAll("[data-label='REPORTED']");
    expect(chips?.length).toBeGreaterThanOrEqual(3);
  });
});
