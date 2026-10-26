import { describe, expect, it, vi } from "vitest";
import { loadEvidence } from "../src/data/evidence";
import { sha256FallbackHex, sha256Hex } from "../src/data/sha256";
import { fixture } from "../src/test/fixtures";

const BUNDLE_TEXT = JSON.stringify(fixture, null, 2);

const ok = (body: string) => new Response(body, { status: 200 });
const missing = () => new Response("not found", { status: 404 });

function manifestFor(sha256: string) {
  return JSON.stringify({
    schema: "makhzan.evidence-index/v0",
    current: fixture.id,
    files: [
      {
        id: fixture.id,
        url: `/evidence/${fixture.id}.json`,
        sha256,
        environment: fixture.environment,
        generatedAt: fixture.generatedAt,
      },
    ],
  });
}

async function realHash(): Promise<string> {
  const digest = await sha256Hex(new TextEncoder().encode(BUNDLE_TEXT));
  return digest;
}

describe("sha256", () => {
  it("hashes the known vector for 'abc'", async () => {
    const bytes = new TextEncoder().encode("abc");
    expect(await sha256Hex(bytes)).toBe("0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("the pure-TypeScript fallback matches the same vector", () => {
    const bytes = new TextEncoder().encode("abc");
    expect(sha256FallbackHex(bytes)).toBe("0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("loadEvidence", () => {
  it("loads the current bundle and verifies its hash", async () => {
    const hash = await realHash();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/evidence/index.json")) return ok(manifestFor(hash));
      if (url.endsWith(`/evidence/${fixture.id}.json`)) return ok(BUNDLE_TEXT);
      return missing();
    }) as unknown as typeof fetch;

    const state = await loadEvidence({ fetchImpl });
    expect(state.error).toBeNull();
    expect(state.verified).toBe(true);
    expect(state.bundle?.id).toBe(fixture.id);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("warns but still returns a bundle whose hash does not match", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/evidence/index.json")) return ok(manifestFor(`0x${"ab".repeat(32)}`));
      return ok(BUNDLE_TEXT);
    }) as unknown as typeof fetch;

    const state = await loadEvidence({ fetchImpl });
    expect(state.verified).toBe(false);
    expect(state.bundle?.id).toBe(fixture.id);
    expect(state.error).toMatch(/unverified/i);
  });

  it("returns an evidence notice when the bundle file is missing", async () => {
    const hash = await realHash();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.endsWith("/evidence/index.json") ? ok(manifestFor(hash)) : missing();
    }) as unknown as typeof fetch;

    const state = await loadEvidence({ fetchImpl });
    expect(state.bundle).toBeNull();
    expect(state.verified).toBe(false);
    expect(state.error).toMatch(/404|unavailable/i);
  });

  it("returns an evidence notice on a network error and never throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const state = await loadEvidence({ fetchImpl });
    expect(state.bundle).toBeNull();
    expect(state.error).toMatch(/Failed to fetch|network/i);
  });

  it("rejects an unsupported manifest schema", async () => {
    const fetchImpl = vi.fn(async () =>
      ok(JSON.stringify({ schema: "makhzan.evidence-index/v1", current: "x", files: [] })),
    ) as unknown as typeof fetch;

    const state = await loadEvidence({ fetchImpl });
    expect(state.bundle).toBeNull();
    expect(state.error).toMatch(/manifest/i);
  });

  it("rejects a manifest whose current id is not listed", async () => {
    const fetchImpl = vi.fn(async () =>
      ok(
        JSON.stringify({
          schema: "makhzan.evidence-index/v0",
          current: "other",
          files: [
            {
              id: fixture.id,
              url: `/evidence/${fixture.id}.json`,
              sha256: `0x${"ab".repeat(32)}`,
              environment: fixture.environment,
              generatedAt: fixture.generatedAt,
            },
          ],
        }),
      ),
    ) as unknown as typeof fetch;

    const state = await loadEvidence({ fetchImpl });
    expect(state.bundle).toBeNull();
    expect(state.error).toMatch(/current/i);
  });

  it("rejects a bundle that fails validation", async () => {
    const hash = await realHash();
    const broken = JSON.stringify({ ...fixture, schema: "makhzan.evidence/v2" });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.endsWith("/evidence/index.json") ? ok(manifestFor(hash)) : ok(broken);
    }) as unknown as typeof fetch;

    const state = await loadEvidence({ fetchImpl });
    expect(state.bundle).toBeNull();
    expect(state.error).toMatch(/schema/i);
  });
});
