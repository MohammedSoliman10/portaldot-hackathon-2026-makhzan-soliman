import { render, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { ModeProvider } from "../app/app-context";
import { parseConfig } from "../config/env";
import type { ModeState } from "../config/modes";
import { resolveMode } from "../config/modes";
import { EvidenceProvider } from "../data/evidence-context";
import type { EvidenceState } from "../data/schema";

export interface RenderOptions {
  route?: string;
  evidence?: EvidenceState;
  mode?: ModeState;
}

export interface RenderAppResult extends RenderResult {
  user: ReturnType<typeof userEvent.setup>;
}

const NO_EVIDENCE: EvidenceState = { bundle: null, verified: false, error: null, loading: false };
const RECORDED_MODE: ModeState = resolveMode(parseConfig({}));

/** Renders a route tree with the evidence layer and mode injected, so no test needs a network. */
export function renderApp(ui: ReactElement, options: RenderOptions = {}): RenderAppResult {
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[options.route ?? "/"]}>
      <ModeProvider mode={options.mode ?? RECORDED_MODE}>
        <EvidenceProvider evidence={options.evidence ?? NO_EVIDENCE}>{ui}</EvidenceProvider>
      </ModeProvider>
    </MemoryRouter>,
  );
  return { ...result, user };
}
