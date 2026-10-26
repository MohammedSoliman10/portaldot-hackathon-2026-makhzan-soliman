import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface ScannedFile {
  path: string;
  text: string;
}

export interface Finding {
  path: string;
  pattern: string;
}

/** The guard input from `contracts/ui-contract.md`, kept in one literal list. */
export const FORBIDDEN = [
  "sendTransaction",
  "writeContract",
  "writeContracts",
  "createWalletClient",
  "walletClient",
  "privateKeyToAccount",
  "mnemonicToAccount",
  "hdKeyToAccount",
  "window.ethereum",
  "eth_sendTransaction",
  "eth_requestAccounts",
  "eth_sign",
  "personal_sign",
  "eth_signTypedData",
  "wagmi",
  "@wagmi/",
  "@rainbow-me/",
  "ethers",
  "web3",
  "@solana/",
] as const;

/** Dependencies are checked by name, so a wallet package cannot arrive as a transitive "convenience". */
const FORBIDDEN_DEPENDENCIES = ["wagmi", "@wagmi/", "@rainbow-me/", "ethers", "web3", "@solana/"];

export const VIEW_FUNCTIONS_FOUND = [
  "peek",
  "providerOf",
  "dealOf",
  "challengeStateOf",
  "accruedOf",
  "healthOf",
] as const;

export function scanText(files: ScannedFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    for (const pattern of FORBIDDEN) {
      if (file.text.includes(pattern)) findings.push({ path: file.path, pattern });
    }
    if (file.path.endsWith("package.json") || file.path.endsWith("package-lock.json")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(file.text);
      } catch {
        continue;
      }
      const names = new Set<string>();
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        if (value && typeof value === "object") {
          for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            if (key === "dependencies" || key === "devDependencies" || key === "peerDependencies") {
              Object.keys(child as Record<string, unknown>).forEach((name) => names.add(name));
            }
            walk(child);
          }
        }
      };
      walk(parsed);
      for (const name of names) {
        if (FORBIDDEN_DEPENDENCIES.some((bad) => name === bad || name.startsWith(bad))) {
          findings.push({ path: file.path, pattern: name });
        }
      }
    }
  }
  return findings;
}

function collect(directory: string, files: ScannedFile[], root: string): void {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      collect(full, files, root);
      continue;
    }
    if (!/\.(ts|tsx|mjs|js|json)$/.test(entry)) continue;
    files.push({ path: relative(root, full), text: readFileSync(full, "utf8") });
  }
}

/** Scans the shipped source and the dependency manifests. Tests are not scanned (they name the guard). */
export function scanTree(appRoot: string): Finding[] {
  const files: ScannedFile[] = [];
  collect(join(appRoot, "src"), files, appRoot);
  for (const manifest of ["package.json", "package-lock.json"]) {
    const full = join(appRoot, manifest);
    try {
      files.push({ path: manifest, text: readFileSync(full, "utf8") });
    } catch {
      // A missing lockfile is not this guard's problem.
    }
  }
  return scanText(files);
}
