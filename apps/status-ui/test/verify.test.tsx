import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { Verify } from "../src/pages/Verify";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";
import type { ReadClient } from "../src/data/client";
import type { EvidenceBundle } from "../src/data/schema";
import { renderApp } from "../src/test/render";

const ADDRESS = "0x60481DFcFCA34A8F095939D9675eC715127B2e44";
const SLOT0 = "0x0000000189c00000006400010000000200038d7ea4c6800007d0040000000032";
const OWNER = "0x0948EBD7637D1C32858a6FC5D947E85A6600205C";
const DEAL_ROOT = "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7";
const SAMPLE_SHA256 = "0x7f2fd6d50bfe106c35d95a8aaef403c4b2ca53df7cb4ef1bca9b9fa8cb89e21e";
const SAMPLE = new Uint8Array(readFileSync(join(process.cwd(), "public/samples/demo-1mib.bin")));

/**
 * Hashing 1 MiB is real work — 1,024 keccak leaves plus ten tree levels, and most tests hash the
 * sample more than once. One full-gate run on a loaded machine took longer than the 1 s default
 * `findBy*` wait and failed a test whose assertions were all correct. This is only a longer wait:
 * every expectation below is unchanged, and a hashing bug still fails on the assertion.
 */
const HASH_WAIT = { timeout: 10_000 };

const evidence = (): EvidenceBundle => run2 as unknown as EvidenceBundle;
const evidenceState = () => ({ bundle: evidence(), verified: true, error: null, loading: false });
const liveMode = () =>
  resolveMode(
    parseConfig({
      VITE_MAKHZAN_MODE: "LIVE",
      VITE_MAKHZAN_RPC_URL: "https://test-evm-rpc-v3.portaldot.dev",
      VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
    }),
  );

function liveClient(root: string = DEAL_ROOT, size = 1048576, leafCount = 1024): ReadClient {
  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (functionName === "peek") return [SLOT0];
      if (functionName === "providerOf") return [1, 2400000000000000n, 0n, true];
      if (functionName === "dealOf") {
        const id = Number(args?.[0]);
        return [
          OWNER,
          id === 1 ? 172266 : 172578,
          id === 1 ? 172416 : 172878,
          1,
          1,
          root,
          leafCount,
          size,
          0,
          0,
          500000000000000n,
          500000000000000n,
        ];
      }
      if (functionName === "healthOf") return 0;
      return 0;
    }),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x60006000"),
    getBlockNumber: vi.fn(async () => 173200n),
    getBalance: vi.fn(async () => 24000000000000000000n),
    getBlock: vi.fn(async () => ({ timestamp: 1_760_000_000n })),
  } as unknown as ReadClient;
}

const sampleFetch = () => vi.fn(async () => new Response(SAMPLE, { status: 200 }));

describe("Verify, the sample file", () => {
  it("shows the sample's sha256, size, block count and provenance before any click", () => {
    const { container } = renderApp(<Verify fetchImpl={sampleFetch()} />, {
      route: "/verify",
      evidence: evidenceState(),
    });
    const text = container.textContent ?? "";
    expect(text).toContain(SAMPLE_SHA256);
    expect(text).toContain("1,048,576");
    expect(text).toContain("1,024");
    expect(text).toMatch(/dd if=\/dev\/urandom/);
    expect(text).toMatch(/no seed/i);
  });

  it("hashes the sample and passes against the root read live from deal 2", async () => {
    const { getByRole, findByTestId, container } = renderApp(
      <Verify client={liveClient()} fetchImpl={sampleFetch()} />,
      { route: "/verify", mode: liveMode(), evidence: evidenceState() },
    );

    getByRole("button", { name: /use the sample file/i }).click();
    await findByTestId("verify-result", {}, HASH_WAIT);

    const text = container.textContent ?? "";
    expect(container.querySelector("[data-testid='verify-verdict']")?.textContent).toMatch(/PASS/);
    expect(text).toContain(SAMPLE_SHA256);
    expect(text).toContain(DEAL_ROOT);
    expect(text).toContain("1,024");
    expect(text).toMatch(/1,048,576/);
    expect(container.querySelectorAll("[data-label='MEASURED']").length).toBeGreaterThan(3);
  });

  it("flips one byte on a copy and fails at the first mismatching block", async () => {
    const { getByRole, findByTestId, container } = renderApp(
      <Verify client={liveClient()} fetchImpl={sampleFetch()} />,
      { route: "/verify", mode: liveMode(), evidence: evidenceState() },
    );

    getByRole("button", { name: /use the sample file/i }).click();
    await findByTestId("verify-result", {}, HASH_WAIT);

    getByRole("button", { name: /flip one byte/i }).click();
    await findByTestId("tamper-result", {}, HASH_WAIT);

    const text = container.textContent ?? "";
    expect(text).toMatch(/tampered/i);
    expect(text).toMatch(/1,023/);
    expect(text).toMatch(/FAIL/);
    expect(text).toMatch(/rejected/i);
    expect(container.querySelector("[data-testid='verify-verdict']")?.textContent).toMatch(/PASS/);
  });
});

describe("Verify, a dropped file", () => {
  it("shows progress while hashing and finishes without freezing the page", async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { container, findByTestId, user } = renderApp(
      <Verify
        client={liveClient()}
        fetchImpl={sampleFetch()}
        buildOptions={{ chunkBlocks: 1, yieldTo: () => gate }}
      />,
      { route: "/verify", mode: liveMode(), evidence: evidenceState() },
    );

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([SAMPLE.subarray(0, 4096)], "four-blocks.bin");
    await user.upload(input, file);

    const progress = await findByTestId("verify-progress", {}, HASH_WAIT);
    expect(progress.textContent).toMatch(/hashing/i);

    await act(async () => {
      release();
    });
    await findByTestId("verify-result", {}, HASH_WAIT);
  });

  it("fails a file whose size is not the deal size, and says so", async () => {
    const { container, findByTestId, user } = renderApp(
      <Verify client={liveClient()} fetchImpl={sampleFetch()} />,
      { route: "/verify", mode: liveMode(), evidence: evidenceState() },
    );

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([new Uint8Array(2048)], "too-small.bin");
    await user.upload(input, file);
    await findByTestId("verify-result", {}, HASH_WAIT);

    expect(container.querySelector("[data-testid='verify-verdict']")?.textContent).toMatch(/FAIL/);
    expect(container.textContent).toMatch(/size/i);
  });

  it("does not claim a verdict when no deal root is available", async () => {
    const { getByRole, findByTestId, container } = renderApp(<Verify fetchImpl={sampleFetch()} />, {
      route: "/verify",
      evidence: { bundle: null, verified: false, error: null, loading: false },
    });

    getByRole("button", { name: /use the sample file/i }).click();
    await findByTestId("verify-result", {}, HASH_WAIT);

    expect(container.querySelector("[data-testid='verify-verdict']")?.textContent).toMatch(/PENDING/);
    expect(container.textContent).toMatch(/no deal root/i);
  });
});
