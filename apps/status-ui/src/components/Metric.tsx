import type { Metric as MetricData } from "../data/labels";

export interface MetricProps {
  metric: MetricData<string | number>;
  className?: string;
}

/**
 * The only component that renders a number. Value, unit, label, source and staleness travel
 * together, so a number cannot be lifted out of its provenance.
 */
export function Metric({ metric, className }: MetricProps) {
  return (
    <div
      className={className ? `metric ${className}` : "metric"}
      data-label={metric.label}
      data-stale={metric.stale}
    >
      <span className="label-chip" data-label={metric.label}>
        {metric.label}
      </span>
      <span className="metric-value numeral">
        {metric.value === null ? metric.unavailableReason : String(metric.value)}
      </span>
      {metric.unit ? <span className="metric-unit">{metric.unit}</span> : null}
      {metric.stale ? (
        <span className="metric-stale">STALE — last good {metric.at ?? "unknown"}</span>
      ) : null}
      <span className="metric-source mono">{metric.source}</span>
    </div>
  );
}
