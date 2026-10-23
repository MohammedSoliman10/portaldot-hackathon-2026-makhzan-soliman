export interface ScannedFile {
  path: string;
  text: string;
}

export interface Finding {
  path: string;
  pattern: string;
}

export const FORBIDDEN: readonly string[] = [];

export const VIEW_FUNCTIONS_FOUND: readonly string[] = [];

export function scanText(_files: ScannedFile[]): Finding[] {
  throw new Error("not implemented");
}

export function scanTree(_appRoot: string): Finding[] {
  throw new Error("not implemented");
}
