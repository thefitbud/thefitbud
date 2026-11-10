import { useState, type FormEvent } from "react";
import { formatPointDate } from "./metricKeys";
import type { MetricRange } from "./useProgressMetrics";

const PRESETS = [
  ["4w", "4 w"],
  ["12w", "12 w"],
  ["all", "All"],
] as const;

type Props = {
  value: MetricRange;
  today: string;
  onChange: (next: MetricRange) => void;
};

/** 4 w / 12 w / All / Custom… (frame 160). Custom asks for two dates, from on or before to. */
export function RangeControl({ value, today, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.range === "custom" ? value.from : "");
  const [to, setTo] = useState(value.range === "custom" ? value.to : today);
  const [problem, setProblem] = useState<string | null>(null);

  const customLabel =
    value.range === "custom"
      ? `${formatPointDate(value.from)} to ${formatPointDate(value.to)}`
      : "Custom…";

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!from || !to) {
      setProblem("Pick both dates.");
      return;
    }
    if (from > to) {
      setProblem("The start date must be on or before the end date.");
      return;
    }
    setProblem(null);
    setOpen(false);
    onChange({ range: "custom", from, to });
  }

  return (
    <div className="pg-range">
      <div className="pg-segment" role="group" aria-label="Trend range">
        {PRESETS.map(([range, label]) => (
          <button
            key={range}
            type="button"
            className={
              value.range === range ? "pg-segment-btn is-on" : "pg-segment-btn"
            }
            aria-pressed={value.range === range}
            onClick={() => {
              setOpen(false);
              onChange({ range });
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={
            value.range === "custom" ? "pg-segment-btn is-on" : "pg-segment-btn"
          }
          aria-pressed={value.range === "custom"}
          aria-expanded={open}
          aria-controls="pg-custom-range"
          onClick={() => setOpen((current) => !current)}
        >
          {customLabel}
        </button>
      </div>
      {open ? (
        <form id="pg-custom-range" className="pg-custom" onSubmit={apply}>
          <label className="field">
            <span>From</span>
            <input
              type="date"
              value={from}
              max={today}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="field">
            <span>To</span>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <button type="submit" className="pg-apply">
            Show range
          </button>
          {problem ? (
            <p className="pg-custom-problem" role="alert">
              {problem}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
