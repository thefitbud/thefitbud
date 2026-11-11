import { useEffect, useRef, useState } from "react";
import type { ProgressMetricKey } from "@fitbud/contracts";
import { metricLabel } from "./metricKeys";

type Props = {
  /** Metrics with entries that can go on the right-hand scale. */
  options: ProgressMetricKey[];
  value: ProgressMetricKey | null;
  onChange: (key: ProgressMetricKey) => void;
};

function ChartIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        d="M2.5 2.5v11h11M5 10.5l2.5-3 2 2 3.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "Compare with…" / "Compare: Sleep quality" in the toolbar (frames 160d, 160e). */
export function CompareControl({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Nothing to compare yet (frames 160i, 161, 160g): the control stays in place, disabled.
  const unavailable = !options.length && !value;

  return (
    <div
      className="pg-compare"
      ref={wrap}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          wrap.current?.querySelector<HTMLButtonElement>(".pg-compare-btn")?.focus();
        }
      }}
    >
      <button
        type="button"
        className={value ? "pg-compare-btn is-on" : "pg-compare-btn"}
        aria-expanded={unavailable ? undefined : open}
        aria-controls={unavailable ? undefined : "pg-compare-list"}
        disabled={unavailable}
        onClick={() => setOpen((current) => !current)}
      >
        <ChartIcon />
        {value ? `Compare: ${metricLabel(value)}` : "Compare with…"}
        <span aria-hidden="true" className={open ? "pg-chevron is-up" : "pg-chevron"} />
      </button>
      {open && !unavailable ? (
        <ul id="pg-compare-list" className="pg-compare-list" aria-label="Compare with">
          {options.map((key) => (
            <li key={key}>
              <button
                type="button"
                aria-pressed={key === value}
                onClick={() => {
                  setOpen(false);
                  onChange(key);
                }}
              >
                {metricLabel(key)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
