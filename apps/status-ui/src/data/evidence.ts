import type { EvidenceState } from "./schema";

export interface LoadEvidenceOptions {
  fetchImpl?: typeof fetch;
  manifestUrl?: string;
}

export async function loadEvidence(_options: LoadEvidenceOptions = {}): Promise<EvidenceState> {
  throw new Error("not implemented");
}
