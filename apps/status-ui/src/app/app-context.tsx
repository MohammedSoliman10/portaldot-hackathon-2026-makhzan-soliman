import { createContext, useContext, type ReactNode } from "react";
import type { ModeState } from "../config/modes";

const ModeContext = createContext<ModeState | null>(null);

export function ModeProvider({ mode, children }: { mode: ModeState; children: ReactNode }) {
  return <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeState {
  const mode = useContext(ModeContext);
  if (mode === null) throw new Error("useMode must be used inside ModeProvider");
  return mode;
}
