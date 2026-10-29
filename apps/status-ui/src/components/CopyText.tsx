import { useState } from "react";
import { copyText } from "../data/clipboard";

type CopyState = "idle" | "copied" | "failed";

/** A button that copies a string and says what happened, without pretending it worked. */
export function CopyText({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [state, setState] = useState<CopyState>("idle");

  async function onCopy(): Promise<void> {
    setState((await copyText(text)) ? "copied" : "failed");
  }

  return (
    <button
      type="button"
      aria-label={state === "copied" ? "Copied" : label}
      onClick={() => void onCopy()}
      className="border border-rule-strong px-3 py-1 font-mono text-xs hover:border-ochre hover:text-ochre"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed — select the link" : label}
    </button>
  );
}
