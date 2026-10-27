import { describe, expect, it, vi } from "vitest";
import { REFUSAL_CALLER, REFUSAL_CALLS, calldataFor } from "../src/data/refusals";
import { runRefusal } from "../src/data/refusal-run";
import type { ReadClient } from "../src/data/client";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44" as const;
const challenge = REFUSAL_CALLS[0]!;

/** A revert the way viem reports one: the data hangs off `cause.data`, not the top-level error. */
function revertError(data: string): Error {
  const cause = Object.assign(new Error("execution reverted"), { data });
  return Object.assign(new Error("CallExecutionError"), { cause });
}

function clientWith(call: ReadClient["call"]): ReadClient {
  return { call } as unknown as ReadClient;
}

describe("running one refusal", () => {
  it("sends an eth_call from the burn address and decodes the revert", async () => {
    const call = vi.fn(async () => {
      throw revertError("0x30cd7471");
    });
    const outcome = await runRefusal(clientWith(call), ADDRESS, challenge, { now: () => 1_760_000_000_000 });

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith({
      to: ADDRESS,
      data: calldataFor(challenge),
      account: REFUSAL_CALLER,
    });
    expect(outcome.status).toBe("reverted");
    if (outcome.status !== "reverted") throw new Error("unreachable");
    expect(outcome.selector).toBe("0x30cd7471");
    expect(outcome.name).toBe("NotOwner");
    expect(outcome.raw).toBe("0x30cd7471");
    expect(outcome.at).toBe(new Date(1_760_000_000_000).toISOString());
    expect(outcome.calldata).toBe(calldataFor(challenge));
  });

  it("does not retry a revert: the revert is the answer", async () => {
    const call = vi.fn(async () => {
      throw revertError("0x3480e2b2");
    });
    const outcome = await runRefusal(clientWith(call), ADDRESS, challenge, { retries: 2 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("reverted");
  });

  it("retries a transport error, then reports the second failure", async () => {
    const call = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    const outcome = await runRefusal(clientWith(call), ADDRESS, challenge, { retries: 1, retryDelayMs: 0 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") throw new Error("unreachable");
    expect(outcome.message).toMatch(/fetch failed/);
    expect(outcome.attempts).toBe(2);
  });

  it("stops waiting at the timeout and says so", async () => {
    const call = vi.fn(() => new Promise<never>(() => {}));
    const outcome = await runRefusal(clientWith(call), ADDRESS, challenge, { timeoutMs: 20, retries: 0 });
    expect(outcome.status).toBe("timeout");
    if (outcome.status !== "timeout") throw new Error("unreachable");
    expect(outcome.message).toMatch(/timed out after 20 ms/);
  });

  it("keeps a success visible instead of pretending it reverted", async () => {
    const call = vi.fn(async () => "0x" as const);
    const outcome = await runRefusal(clientWith(call), ADDRESS, challenge);
    expect(outcome.status).toBe("returned");
    if (outcome.status !== "returned") throw new Error("unreachable");
    expect(outcome.note).toMatch(/did not revert/i);
  });

  it("reads revert data out of a plain message too", async () => {
    const call = vi.fn(async () => {
      throw new Error("execution reverted: 0x019af637");
    });
    const outcome = await runRefusal(clientWith(call), ADDRESS, REFUSAL_CALLS[2]!);
    expect(outcome.status).toBe("reverted");
    if (outcome.status !== "reverted") throw new Error("unreachable");
    expect(outcome.name).toBe("BadParams");
  });

  it("does not mistake the caller address in viem's message for revert data", async () => {
    const call = vi.fn(async () => {
      const inner = Object.assign(new Error("execution reverted"), { data: "0x30cd7471" });
      const rpc = Object.assign(new Error("RPC Request failed."), { data: "0x30cd7471", cause: inner });
      throw Object.assign(
        new Error(
          `Execution reverted for an unknown reason.\n\nRaw Call Arguments:\n  from:  ${REFUSAL_CALLER}\n  to:    0x60481DFcFCA34A8F095939D9675eC715127B2e44\n  data:  0xf3c72faa0000000000000000000000000000000000000000000000000000000000000001\n\nDetails: execution reverted`,
        ),
        { cause: rpc },
      );
    });
    const outcome = await runRefusal(clientWith(call), ADDRESS, challenge);
    expect(outcome.status).toBe("reverted");
    if (outcome.status !== "reverted") throw new Error("unreachable");
    expect(outcome.raw).toBe("0x30cd7471");
    expect(outcome.name).toBe("NotOwner");
  });

  it("refuses to read a selector out of the raw call arguments", async () => {
    const call = vi.fn(async () => {
      throw new Error(
        `Execution reverted.\n\nRaw Call Arguments:\n  from:  ${REFUSAL_CALLER}\n  data:  0xf3c72faa0000000000000000000000000000000000000000000000000000000000000001\n\nDetails: execution reverted`,
      );
    });
    const outcome = await runRefusal(clientWith(call), ADDRESS, challenge);
    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") throw new Error("unreachable");
    expect(outcome.message).toMatch(/Execution reverted/);
  });
});
