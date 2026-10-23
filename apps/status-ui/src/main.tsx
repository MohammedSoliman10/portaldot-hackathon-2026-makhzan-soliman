import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/space-grotesk";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/app.css";
import { App } from "./app/App";
import { parseConfig } from "./config/env";
import { resolveMode } from "./config/modes";
import { loadEvidence } from "./data/evidence";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

async function bootstrap(): Promise<void> {
  const mode = resolveMode(parseConfig(import.meta.env as unknown as Record<string, string | undefined>));
  const evidence = await loadEvidence();

  createRoot(root!).render(
    <StrictMode>
      <BrowserRouter>
        <App mode={mode} evidence={evidence} />
      </BrowserRouter>
    </StrictMode>,
  );
}

void bootstrap();
