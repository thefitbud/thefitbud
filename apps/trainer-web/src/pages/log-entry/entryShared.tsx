import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import { formatCivilDate } from "@fitbud/core";
import { windowDates } from "../log-workout/logWorkoutModel";
import "../log-workout/log-workout.css";
import "./log-entry.css";

/** One banner per failed save; "network" is the only cause we actually checked. */
export type SaveFailure =
  | { kind: "network" }
  | { kind: "api"; message: string; code: string }
  | { kind: "unknown" };

/**
 * API codes for which sending the same save again can never succeed: the entry
 * changed under the trainer, or already exists. The only way forward is to
 * reload what is saved.
 */
export const RELOAD_CODES = new Set([
  "VERSION_CONFLICT",
  "COMPLIANCE_ALREADY_RECORDED",
  "LOG_WRITE_CONFLICT",
]);

export function classifyFailure(err: unknown, screen: string): SaveFailure {
  if (err instanceof ApiClientError) {
    return { kind: "api", message: err.message, code: err.code };
  }
  // A rejected fetch is a TypeError; anything else (a ZodError, say) is a
  // client/server disagreement and must not read as a connection problem.
  if (err instanceof TypeError) return { kind: "network" };
  if (import.meta.env.DEV) {
    console.warn(`[${screen}]`, err instanceof Error ? err.name : typeof err);
  }
  return { kind: "unknown" };
}

export function isReloadFailure(failure: SaveFailure | null): boolean {
  return failure?.kind === "api" && RELOAD_CODES.has(failure.code);
}

/**
 * One logical save: the idempotency key and the exact request body travel
 * together, so a retry resends the identical body. Both are renewed only when
 * the form changes (a new fingerprint) or after `reset()` (Reload).
 */
export function useFrozenRequest<B>() {
  const ref = useRef<{ fingerprint: string; key: string; body: B } | null>(null);
  return {
    take(fingerprint: string, build: () => B): { key: string; body: B } {
      if (ref.current?.fingerprint !== fingerprint) {
        ref.current = { fingerprint, key: crypto.randomUUID(), body: build() };
      }
      return { key: ref.current.key, body: ref.current.body };
    },
    reset() {
      ref.current = null;
    },
  };
}

export function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconAlert() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "your client";
}

function pronoun(gender: string | null | undefined): string {
  const value = (gender ?? "").toLowerCase();
  if (value === "male") return "his";
  if (value === "female") return "her";
  return "their";
}

export function EntryHead({
  title,
  clientName,
  backTo,
}: {
  title: string;
  clientName: string;
  backTo: string;
}) {
  return (
    <header className="lw-head">
      <Link className="lw-back" to={backTo} aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <div>
        <h1>{title}</h1>
        <p className="lw-sub">{clientName}</p>
      </div>
    </header>
  );
}

export function EndedState({
  testId,
  head,
  first,
  gender,
  relationshipId,
  what,
}: {
  testId: string;
  head: ReactNode;
  first: string;
  gender: string | null | undefined;
  relationshipId: string;
  /** "meals" or "measurements". */
  what: string;
}) {
  return (
    <div className="lw-page" data-testid={testId}>
      {head}
      <div className="lw-ended">
        <span className="lw-ended-icon">
          <IconLock />
        </span>
        <h2>Coaching with {first} has ended</h2>
        <p>
          Ended clients are read-only, so you can’t log or edit {what} for them.
          Reactivate coaching from {pronoun(gender)} client page to log again.
        </p>
        <Link className="button-secondary" to={`/clients/${relationshipId}/overview`}>
          Open {first}’s page
        </Link>
      </div>
    </div>
  );
}

export function FailureBanner({
  failure,
  testId,
  screen,
}: {
  failure: SaveFailure;
  testId: string;
  screen: string;
}) {
  return (
    <div className="lw-banner is-error" role="alert" data-testid={testId}>
      <IconAlert />
      <p>
        {failure.kind === "network"
          ? "Not saved. We couldn’t reach FitBud, so nothing was saved. Your entries are still here. Check your connection and try again."
          : failure.kind === "api"
            ? RELOAD_CODES.has(failure.code)
              ? `Not saved. ${failure.message} Reload to see what is saved.`
              : `Not saved. ${failure.message} Your entries are still here.`
            : `Not saved. Something went wrong on our side (${screen}). Your entries are still here. Try again.`}
      </p>
    </div>
  );
}

function dayChipLabel(localDate: string): { weekday: string; day: string } {
  const [weekday = "", day = ""] = formatCivilDate(localDate).split(" ");
  return { weekday, day };
}

/** Today and the 7 days before it: the trainer log window (R2). */
export function DayChips({
  today,
  selected,
  disabled,
  onPick,
}: {
  today: string;
  selected: string;
  disabled: boolean;
  onPick: (date: string) => void;
}) {
  return (
    <div className="lw-days" role="group" aria-label="Date">
      {windowDates(today).map((date) => {
        const chip = dayChipLabel(date);
        const on = date === selected;
        return (
          <button
            key={date}
            type="button"
            className={on ? "lw-day is-on" : "lw-day"}
            aria-pressed={on}
            aria-label={formatCivilDate(date)}
            disabled={disabled}
            onClick={() => onPick(date)}
          >
            <span>{chip.weekday}</span>
            <strong>{chip.day}</strong>
          </button>
        );
      })}
    </div>
  );
}
