import { describe, expect, it, vi } from "vitest";
import { Verify } from "../src/pages/Verify";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import { REFUSAL_CALLS, REFUSAL_CALLER, calldataFor } from "../src/data/refusals";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";
import run2 from "../public/evidence/portaldot-live-run2.json";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44" as const;
const SLOT0 = "0x0000000000000000000000000000000000000000000000000000000000000000";

const liveMode = () =>
  resolveMode(
    parseConfig({
      VITE_MAKHZAN_MODE: "LIVE",
      VITE_MAKHZAN_RPC_URL: "https://test-evm-rpc-v3.portaldot.dev",
      VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
    }),
  );

const evidenceState = () => ({
  bundle: run2 as unknown as EvidenceBundle,
  verified: true,
  error: null,
  loading: false,
});

function revertWith(data: string): Error {
  return Object.assign(new Error("CallExecutionError"), {
    cause: Object.assign(new Error("execution reverted"), { data }),
  });
}

/** Maps the calldata back to the selector the live contract returns for that call. */
const LIVE_ANSWER: Record<string, string> = {
  [calldataFor(REFUSAL_CALLS[0]!)]: "0x30cd7471",
  [calldataFor(REFUSAL_CALLS[1]!)]: "0x3480e2b2",
  [calldataFor(REFUSAL_CALLS[2]!)]: "0x019af637",
};

function refusalClient(overrides: Partial<ReadClient> = {}): ReadClient {
  return {
    call: vi.fn(async ({ data }: { data: string }) => {
      const selector = LIVE_ANSWER[data];
      if (selector === undefined) throw new Error(`unexpected calldata ${data.slice(0, 10)}`);
      throw revertWith(selector);
    }),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "peek") return [SLOT0];
      if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
      if (functionName === "dealOf")
        return [
          "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
          172578,
          172878,
          1,
          1,
          "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7",
          1024,
          1048576,
          0,
          0,
          500000000000000n,
          500000000000000n,
        ];
      if (functionName === "healthOf") return 0;
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x60006000"),
    getBlockNumber: vi.fn(async () => 216_300n),
    getBalance: vi.fn(async () => 24000000000000000000n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
    ...overrides,
  } as unknown as ReadClient;
}

describe("Verify, the refusal calls", () => {
  it("lists the three refusals with the check the contract runs first", () => {
    const { container } = renderApp(<Verify client={refusalClient()} />, {
      route: "/verify",
      mode: liveMode(),
      evidence: evidenceState(),
    });
    const text = container.textContent ?? "";
    for (const call of REFUSAL_CALLS) {
      expect(text).toContain(call.title);
      expect(text).toContain(call.expectedCheck);
    }
    expect(text).toMatch(/eth_call/i);
    expect(text).toContain(REFUSAL_CALLER);
    expect(text).toMatch(/no wallet|nothing is signed/i);
  });

  it("shows the returned selector and the decoded name for each refusal", async () => {
    const client = refusalClient();
    const { getAllByRole, findByTestId } = renderApp(<Verify client={client} />, {
      route: "/verify",
      mode: liveMode(),
      evidence: evidenceState(),
    });

    const buttons = getAllByRole("button", { name: /run the call/i });
    expect(buttons).toHaveLength(3);

    buttons[0]!.click();
    const first = await findByTestId("refusal-result-non-owner-challenge");
    expect(first.textContent).toContain("0x30cd7471");
    expect(first.textContent).toContain("NotOwner");
    expect(first.querySelector("[data-label='MEASURED']")).not.toBeNull();
    expect(first.textContent).toMatch(/decoded from the ABI/i);

    buttons[1]!.click();
    const second = await findByTestId("refusal-result-non-provider-answer");
    expect(second.textContent).toContain("0x3480e2b2");
    expect(second.textContent).toContain("NotProvider");

    buttons[2]!.click();
    const third = await findByTestId("refusal-result-bad-params-create");
    expect(third.textContent).toContain("0x019af637");
    expect(third.textContent).toContain("BadParams");

    expect(client.call).toHaveBeenCalledWith(
      expect.objectContaining({ to: ADDRESS, account: REFUSAL_CALLER }),
    );
  });

  it("keeps the buttons honest when there is no client to call", () => {
    const { container, getAllByRole } = renderApp(<Verify />, {
      route: "/verify",
      evidence: evidenceState(),
    });
    const buttons = getAllByRole("button", { name: /run the call/i });
    for (const button of buttons) expect(button).toBeDisabled();
    expect(container.textContent).toMatch(/PENDING LIVE RUN/);
  });

  it("says a timeout happened, and how many attempts it made", async () => {
    const client = refusalClient({ call: vi.fn(() => new Promise<never>(() => {})) });
    const { getAllByRole, findByTestId } = renderApp(
      <Verify client={client} refusalOptions={{ timeoutMs: 10, retries: 1, retryDelayMs: 0 }} />,
      { route: "/verify", mode: liveMode(), evidence: evidenceState() },
    );

    getAllByRole("button", { name: /run the call/i })[0]!.click();
    const result = await findByTestId("refusal-result-non-owner-challenge", {}, { timeout: 3000 });
    expect(result.textContent).toMatch(/timed out after 10 ms/);
    expect(result.textContent).toMatch(/2 attempts/);
    expect(client.call).toHaveBeenCalledTimes(2);
  });

  it("warns instead of claiming success when the call returns data", async () => {
    const client = refusalClient({ call: vi.fn(async () => "0x" as const) });
    const { getAllByRole, findByTestId } = renderApp(<Verify client={client} />, {
      route: "/verify",
      mode: liveMode(),
      evidence: evidenceState(),
    });

    getAllByRole("button", { name: /run the call/i })[0]!.click();
    const result = await findByTestId("refusal-result-non-owner-challenge");
    expect(result.textContent).toMatch(/did not revert/i);
    expect(result.textContent).toMatch(/do not trust/i);
  });
});
