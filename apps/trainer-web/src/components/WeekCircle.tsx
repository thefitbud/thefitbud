import type { WeekDayState } from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import { Check, X } from "lucide-react";
import "./week-circle.css";

/**
 * Shape for one existing week-day state. The API already decides the state
 * (D-W6-10): `due` is unlogged today, `partial` is real progress including a
 * started past day, and a skip is already rolled into `done`.
 */
const PRESENTATION = {
  done: "check",
  partial: "half",
  due: "open",
  missed: "cross",
  rest: "dash",
  future: "dashed",
} as const satisfies Record<WeekDayState, string>;

export type WeekCircleMarker = (typeof PRESENTATION)[WeekDayState];

export function weekCirclePresentation(state: WeekDayState): {
  state: WeekDayState;
  label: string;
  marker: WeekCircleMarker;
} {
  return {
    state,
    label: labelFor("week_day_state", state),
    marker: PRESENTATION[state],
  };
}

export function WeekCircle({
  state,
  className,
}: {
  state: WeekDayState;
  className?: string;
}) {
  const { label, marker } = weekCirclePresentation(state);
  const classes = ["week-circle", `week-circle--${state}`];
  if (className) classes.push(className);
  return (
    <div
      className={classes.join(" ")}
      role="img"
      aria-label={label}
      title={label}
      data-state={state}
      data-marker={marker}
    >
      {marker === "check" ? (
        <Check size={16} strokeWidth={2.25} aria-hidden="true" />
      ) : null}
      {marker === "cross" ? (
        <X size={16} strokeWidth={2.25} aria-hidden="true" />
      ) : null}
      {marker === "half" ? (
        <span className="week-circle__half" aria-hidden="true" />
      ) : null}
      {marker === "dash" ? (
        <span className="week-circle__dash" aria-hidden="true" />
      ) : null}
    </div>
  );
}
