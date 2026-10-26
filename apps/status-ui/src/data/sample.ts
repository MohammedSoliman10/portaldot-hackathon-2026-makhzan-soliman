import type { Hex } from "./schema";

/**
 * The 1 MiB demo file committed by deals 1 and 2 on the Portaldot deployment.
 *
 * It is served byte-for-byte at `url`, so the sha256 and the root below can be checked by anyone.
 * `scripts/check-sample.mjs` re-derives all of them from the bytes on every build.
 */
export interface SampleInfo {
  url: string;
  name: string;
  size: number;
  blockSize: number;
  blockCount: number;
  sha256: Hex;
  root: Hex;
  createdUtc: string;
  command: string;
  provenance: string;
}

export const SAMPLE: SampleInfo = {
  url: "/samples/demo-1mib.bin",
  name: "demo-1mib.bin",
  size: 1_048_576,
  blockSize: 1024,
  blockCount: 1024,
  sha256: "0x7f2fd6d50bfe106c35d95a8aaef403c4b2ca53df7cb4ef1bca9b9fa8cb89e21e",
  root: "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7",
  createdUtc: "2026-10-24T08:52Z",
  command: "dd if=/dev/urandom of=demo-1mib.bin bs=1024 count=1024",
  provenance:
    "Random bytes, not a seed: created with dd if=/dev/urandom, so no seed reproduces it. The file is served byte-for-byte, and the sha256 above is how anyone checks the bytes they received.",
};

export async function loadSample(fetchImpl: typeof fetch): Promise<Uint8Array> {
  const response = await fetchImpl(SAMPLE.url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`sample file unavailable (HTTP ${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}
