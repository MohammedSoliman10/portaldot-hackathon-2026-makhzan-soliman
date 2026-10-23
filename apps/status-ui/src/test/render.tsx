import { render, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { EvidenceProvider } from "../data/evidence-context";
import type { EvidenceState } from "../data/schema";

export interface RenderOptions {
  route?: string;
  evidence?: EvidenceState;
}

export interface RenderAppResult extends RenderResult {
  user: ReturnType<typeof userEvent.setup>;
}

const NO_EVIDENCE: EvidenceState = { bundle: null, verified: false, error: null, loading: false };

/** Renders a route tree with the evidence layer injected, so no test needs a network. */
export function renderApp(ui: ReactElement, options: RenderOptions = {}): RenderAppResult {
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[options.route ?? "/"]}>
      <EvidenceProvider evidence={options.evidence ?? NO_EVIDENCE}>{ui}</EvidenceProvider>
    </MemoryRouter>,
  );
  return { ...result, user };
}
