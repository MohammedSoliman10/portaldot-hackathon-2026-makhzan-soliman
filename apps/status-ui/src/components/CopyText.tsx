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
      className="min-h-[44px] rounded-full border border-slate-200 bg-white px-5 py-2 font-mono text-xs font-semibold text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition-colors"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed — select the link" : label}
    </button>
  );
}
