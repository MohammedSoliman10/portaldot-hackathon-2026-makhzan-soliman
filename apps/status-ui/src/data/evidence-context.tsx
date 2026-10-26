import { createContext, useContext, type ReactNode } from "react";
import type { EvidenceState } from "./schema";

const EMPTY: EvidenceState = { bundle: null, verified: false, error: null, loading: false };

const EvidenceContext = createContext<EvidenceState>(EMPTY);

export function EvidenceProvider({
  evidence,
  children,
}: {
  evidence: EvidenceState;
  children: ReactNode;
}) {
  return <EvidenceContext.Provider value={evidence}>{children}</EvidenceContext.Provider>;
}

export function useEvidence(): EvidenceState {
  return useContext(EvidenceContext);
}
