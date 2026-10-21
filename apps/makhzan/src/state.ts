/** Atomic JSON state store for the daemon and the CLI (`.state/state.json`). */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface FileEntry {
  size: number;
  leafCount: number;
  path: string;
}

export interface DealState {
  role: "provider" | "client";
  owner: string;
  providerId: number;
  lastChallenge?: { index: number; start: number; status: "passed" | "failed" | "pending" };
}

export interface StateFile {
  chainId: number;
  providerId: number;
  lastBlock: number;
  files: Record<string, FileEntry>;
  deals: Record<string, DealState>;
}

export function emptyState(chainId: number, providerId: number): StateFile {
  return { chainId, providerId, lastBlock: 0, files: {}, deals: {} };
}

/** Missing file is not an error: the caller gets an empty state and `created: true`. */
export function readState(file: string): { state: StateFile; created: boolean } {
  if (!existsSync(file)) return { state: emptyState(0, 0), created: true };
  const text = readFileSync(file, "utf8");
  try {
    return { state: JSON.parse(text) as StateFile, created: false };
  } catch (err) {
    throw new Error(`state file is corrupt and was not replaced: ${file} (${(err as Error).message})`);
  }
}

/** Encodes first (so a bad value fails before anything is touched), then temp file + rename. */
export function writeState(file: string, state: StateFile): void {
  const encoded = JSON.stringify(state, null, 2) + "\n";
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, encoded);
  try {
    renameSync(temp, file);
  } catch (err) {
    if (existsSync(temp)) unlinkSync(temp);
    throw err;
  }
}

/** `<state dir>/files/<root>/<index>`; the state file lives at the root of the state directory. */
export function blockPathFor(file: string, root: string, index: number): string {
  return join(dirname(file), "files", root, String(index));
}

/**
 * Rebuilds what a restart can serve: a root is available only when every block of its stored tree
 * is on disk. Anything else is reported instead of guessed.
 */
export function derivePaths(state: StateFile, file: string): { available: string[]; unavailable: string[] } {
  const available: string[] = [];
  const unavailable: string[] = [];
  for (const [root, entry] of Object.entries(state.files)) {
    let complete = entry.leafCount > 0;
    for (let index = 0; index < entry.leafCount && complete; index++) {
      complete = existsSync(blockPathFor(file, root, index));
    }
    (complete ? available : unavailable).push(root);
  }
  return { available, unavailable };
}
