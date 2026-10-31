import type { ModeState } from "../config/modes";
import type { ReadClient } from "../data/client";
import { EvidenceProvider } from "../data/evidence-context";
import type { EvidenceState } from "../data/schema";
import { Shell } from "../components/layout/Shell";
import { ModeProvider } from "./app-context";
import { AppRoutes } from "./routes";

export function App({
  mode,
  evidence,
  client,
}: {
  mode: ModeState;
  evidence: EvidenceState;
  client?: ReadClient;
}) {
  return (
    <ModeProvider mode={mode}>
      <EvidenceProvider evidence={evidence}>
        <Shell mode={mode} evidence={evidence}>
          <AppRoutes client={client} />
        </Shell>
      </EvidenceProvider>
    </ModeProvider>
  );
}
