import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
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

  // A `#/receipt/2` link works on any static host without a rewrite, so honour it when it is there.
  const Router = window.location.hash.startsWith("#/") ? HashRouter : BrowserRouter;

  createRoot(root!).render(
    <StrictMode>
      <Router>
        <App mode={mode} evidence={evidence} />
      </Router>
    </StrictMode>,
  );
}

void bootstrap();
