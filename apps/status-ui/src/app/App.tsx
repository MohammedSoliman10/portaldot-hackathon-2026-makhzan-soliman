import type { ModeState } from "../config/modes";
import { EvidenceProvider } from "../data/evidence-context";
import type { EvidenceState } from "../data/schema";
import { Shell } from "../components/layout/Shell";
import { AppRoutes } from "./routes";

export function App({ mode, evidence }: { mode: ModeState; evidence: EvidenceState }) {
  return (
    <EvidenceProvider evidence={evidence}>
      <Shell mode={mode} evidence={evidence}>
        <AppRoutes />
      </Shell>
    </EvidenceProvider>
  );
}
