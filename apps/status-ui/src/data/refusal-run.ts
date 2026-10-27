/**
 * Runs one refusal as an `eth_call` and reports what came back.
 *
 * A revert is the answer, so it is never retried; a timeout or a transport error is retried once,
 * because a phone on a bad network is the normal case. Nothing here signs, sends or pays: the call
 * carries no value and the caller is a fixed public address.
 */
import type { ReadClient } from "./client";
import { calldataFor, decodeRefusal, REFUSAL_CALLER, type RefusalCall } from "./refusals";
import type { Hex } from "./schema";

/** 8 s per attempt, one retry — the envelope the page shows in its copy. */
export const REFUSAL_TRANSPORT = { timeoutMs: 8000, retries: 1, retryDelayMs: 300 } as const;

export interface RefusalRunOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  now?: () => number;
}

interface OutcomeBase {
  calldata: Hex;
  at: string;
  ms: number;
  attempts: number;
}

export type RefusalOutcome =
  | (OutcomeBase & {
      status: "reverted";
      raw: Hex;
      selector: Hex | null;
      name: string | null;
      signature: string | null;
      args: readonly unknown[] | null;
      note: string;
    })
  | (OutcomeBase & { status: "returned"; raw: Hex; note: string })
  | (OutcomeBase & { status: "timeout"; message: string })
  | (OutcomeBase & { status: "error"; message: string });

const HEX_DATA = /^0x[0-9a-fA-F]{8,}$/;

/**
 * Finds the revert data in whatever viem wrapped it in: `.data` on the error or a cause, the node's
 * `info.error.data`, or a message that carries the hex. Returns null when there is none.
 */
export function revertDataOf(error: unknown): Hex | null {
  const seen = new Set<unknown>();
  let cursor: unknown = error;
  for (let depth = 0; depth < 8 && cursor !== null && typeof cursor === "object"; depth += 1) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const record = cursor as Record<string, unknown>;
    for (const key of ["data", "revertData", "returnData"]) {
      const value = record[key];
      if (typeof value === "string" && HEX_DATA.test(value)) return value as Hex;
    }
    const info = record.info;
    if (info !== null && typeof info === "object") {
      const nested = (info as Record<string, unknown>).error;
      if (nested !== null && typeof nested === "object") {
        const data = (nested as Record<string, unknown>).data;
        if (typeof data === "string" && HEX_DATA.test(data)) return data as Hex;
      }
    }
    if (typeof record.message === "string") {
      const match = /0x[0-9a-fA-F]{8,}/.exec(record.message);
      if (match !== null) return match[0] as Hex;
    }
    cursor = record.cause;
  }
  return null;
}

const messageOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() === "" ? "the node did not answer" : message;
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Attempt =
  | { kind: "revert"; raw: Hex }
  | { kind: "returned"; raw: Hex }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

async function attemptOnce(
  client: ReadClient,
  to: Hex,
  data: Hex,
  timeoutMs: number,
): Promise<Attempt> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Attempt>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
  });
  const call: Promise<Attempt> = client.call({ to, data, account: REFUSAL_CALLER }).then(
    (raw) => ({ kind: "returned" as const, raw }),
    (error: unknown) => {
      const revert = revertDataOf(error);
      return revert === null
        ? ({ kind: "error" as const, message: messageOf(error) } as Attempt)
        : ({ kind: "revert" as const, raw: revert } as Attempt);
    },
  );
  try {
    return await Promise.race([call, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Runs the call, retrying a timeout or a transport error, and decodes whatever revert came back. */
export async function runRefusal(
  client: ReadClient,
  to: Hex,
  call: RefusalCall,
  options: RefusalRunOptions = {},
): Promise<RefusalOutcome> {
  const timeoutMs = options.timeoutMs ?? REFUSAL_TRANSPORT.timeoutMs;
  const retries = options.retries ?? REFUSAL_TRANSPORT.retries;
  const retryDelayMs = options.retryDelayMs ?? REFUSAL_TRANSPORT.retryDelayMs;
  const now = options.now ?? (() => Date.now());
  const calldata = calldataFor(call);
  const startedAt = now();
  const base = (attempts: number) => ({ calldata, at: new Date(now()).toISOString(), ms: now() - startedAt, attempts });

  let attempts = 0;
  let lastMessage = "the call did not run";

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    attempts += 1;
    const result = await attemptOnce(client, to, calldata, timeoutMs);

    if (result.kind === "revert") {
      const decoded = decodeRefusal(result.raw);
      return {
        ...base(attempts),
        status: "reverted",
        raw: result.raw,
        selector: decoded.selector,
        name: decoded.name,
        signature: decoded.signature,
        args: decoded.args,
        note: decoded.note,
      };
    }
    if (result.kind === "returned") {
      return {
        ...base(attempts),
        status: "returned",
        raw: result.raw,
        note: "the call returned data and did not revert; that is not what this refusal expects, so do not trust this run",
      };
    }
    if (result.kind === "timeout") {
      lastMessage = `the call timed out after ${timeoutMs} ms`;
    } else {
      lastMessage = result.message;
    }
    if (attempt < retries) await delay(retryDelayMs);
  }

  return attempts > 0 && lastMessage.startsWith("the call timed out")
    ? { ...base(attempts), status: "timeout", message: `${lastMessage} (${attempts} attempt${attempts === 1 ? "" : "s"})` }
    : { ...base(attempts), status: "error", message: lastMessage };
}
