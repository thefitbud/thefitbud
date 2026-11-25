import { useState, type FormEvent } from "react";
import { Seg } from "../../components/ui";
import { formatPointDate } from "./metricKeys";
import type { MetricRange } from "./useProgressMetrics";

type Preset = "4w" | "12w" | "6m" | "all";
type Selected = Preset | "custom";

const PRESETS: Array<{ value: Selected; label: string }> = [
  { value: "4w", label: "4 wk" },
  { value: "12w", label: "12 wk" },
  { value: "6m", label: "6 mo" },
  { value: "all", label: "All" },
];

type Props = {
  value: MetricRange;
  today: string;
  onChange: (next: MetricRange) => void;
};

/** The civil date six calendar months before `localDate` (YYYY-MM-DD), clamped to the month's end. */
export function sixMonthsBefore(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 - 6, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * 4 wk / 12 wk / 6 mo / All (frame W-160) and a Custom range. The metrics and strength
 * endpoints have no six-month preset, so "6 mo" asks for the custom window that ends today.
 */
export function RangeControl({ value, today, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.range === "custom" ? value.from : "");
  const [to, setTo] = useState(value.range === "custom" ? value.to : today);
  const [problem, setProblem] = useState<string | null>(null);

  const sixMonths = sixMonthsBefore(today);
  const isSixMonths =
    value.range === "custom" && value.to === today && value.from === sixMonths;
  const selected: Selected = isSixMonths
    ? "6m"
    : value.range === "custom"
      ? "custom"
      : value.range;

  const customLabel =
    selected === "custom" && value.range === "custom"
      ? `${formatPointDate(value.from)} to ${formatPointDate(value.to)}`
      : "Custom range";

  function choose(next: Selected) {
    setOpen(false);
    if (next === "6m") onChange({ range: "custom", from: sixMonths, to: today });
    else if (next === "4w" || next === "12w" || next === "all") {
      onChange({ range: next });
    }
  }

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
      <Seg<Selected>
        aria-label="Trend range"
        options={PRESETS}
        value={selected}
        onChange={choose}
      />
      <button
        type="button"
        className={
          selected === "custom" ? "pg-custom-btn is-on" : "pg-custom-btn"
        }
        aria-pressed={selected === "custom"}
        aria-expanded={open}
        aria-controls="pg-custom-range"
        onClick={() => setOpen((current) => !current)}
      >
        {customLabel}
      </button>
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
