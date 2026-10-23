import { EVIDENCE_STAGES, ROUND_STATUSES, STAGE_LABELS } from "../data/status";

const LABEL_NOTES: { label: string; note: string }[] = [
  { label: "MEASURED", note: "this browser read it from the chain, with a block and a UTC time" },
  { label: "REPORTED", note: "recorded in the evidence file, with the file and its UTC" },
  { label: "SIMULATED", note: "extrapolated between reads; the basis is named" },
  { label: "PENDING LIVE RUN", note: "no value exists yet — text, never a zero" },
];

/**
 * Two vocabularies, explained once: rounds (what a challenge did) and transactions (how far a
 * receipt got). They are deliberately not merged.
 */
export function LabelLegend() {
  return (
    <section data-testid="label-legend" aria-label="Labels and vocabularies" className="text-xs">
      <h2 className="eyebrow mb-2">Labels</h2>
      <ul className="mb-4 space-y-1">
        {LABEL_NOTES.map((item) => (
          <li key={item.label}>
            <span className="label-chip mr-2" data-label={item.label}>
              {item.label}
            </span>
            <span className="text-ash">{item.note}</span>
          </li>
        ))}
      </ul>

      <h2 className="eyebrow mb-2">Round states</h2>
      <p className="mb-4 font-mono text-ash">{ROUND_STATUSES.join(" · ")}</p>

      <h2 className="eyebrow mb-2">Transaction stages</h2>
      <p className="font-mono text-ash">
        {EVIDENCE_STAGES.map((stage) => STAGE_LABELS[stage]).join(" · ")}
      </p>
    </section>
  );
}
