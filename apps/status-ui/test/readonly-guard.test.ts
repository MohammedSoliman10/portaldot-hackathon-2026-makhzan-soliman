import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORBIDDEN, VIEW_FUNCTIONS_FOUND, scanText, scanTree } from "./readonly-scan";

const appRoot = process.cwd();

describe("read-only guard", () => {
  it("finds no forbidden symbol in src, package.json or the lockfile", () => {
    expect(scanTree(appRoot)).toEqual([]);
  });

  it("catches a planted transaction call in a fixture file", () => {
    const findings = scanText([
      { path: "src/planted.ts", text: "await client.sendTransaction({ to: owner, value: 1n });" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: "src/planted.ts", pattern: "sendTransaction" });
  });

  it("catches a planted wallet dependency", () => {
    const findings = scanText([
      {
        path: "package.json",
        text: JSON.stringify({ dependencies: { wagmi: "2.0.0" } }),
      },
    ]);
    expect(findings.map((finding) => finding.pattern)).toContain("wagmi");
  });

  it("does not flag a read-only client or the word 'write' in prose", () => {
    const findings = scanText([
      { path: "src/ok.ts", text: "// there is no write path here\nconst client = createPublicClient({});" },
    ]);
    expect(findings).toEqual([]);
  });

  it("keeps the forbidden list explicit", () => {
    expect(FORBIDDEN).toEqual(
      expect.arrayContaining([
        "sendTransaction",
        "writeContract",
        "createWalletClient",
        "privateKeyToAccount",
        "window.ethereum",
        "eth_sendTransaction",
        "wagmi",
        "ethers",
        "web3",
      ]),
    );
  });
});

describe("ABI guard", () => {
  it("only calls the six view functions from reads.ts", () => {
    const source = readFileSync(join(appRoot, "src/data/reads.ts"), "utf8");
    const names = [...source.matchAll(/functionName: "([^"]+)"/g)].map((match) => match[1]!);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(VIEW_FUNCTIONS_FOUND).toContain(name);
    expect([...new Set(names)].sort()).toEqual([...VIEW_FUNCTIONS_FOUND].sort());
  });

  it("keeps write functions out of the ABI text", () => {
    const source = readFileSync(join(appRoot, "src/data/reads.ts"), "utf8");
    for (const write of ["function createDeal", "function answer", "function settle", "function claim", "function resolve"]) {
      expect(source).not.toContain(write);
    }
  });
});
