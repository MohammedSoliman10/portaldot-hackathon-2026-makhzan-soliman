/** Atomic JSON state store for the daemon and the CLI (`.state/state.json`). */
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

export function emptyState(_chainId: number, _providerId: number): StateFile {
  throw new Error("not implemented");
}

export function readState(_file: string): { state: StateFile; created: boolean } {
  throw new Error("not implemented");
}

export function writeState(_file: string, _state: StateFile): void {
  throw new Error("not implemented");
}

export function blockPathFor(_file: string, _root: string, _index: number): string {
  throw new Error("not implemented");
}

export function derivePaths(
  _state: StateFile,
  _file: string,
): { available: string[]; unavailable: string[] } {
  throw new Error("not implemented");
}
