import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type {
  ResponsivenessCategoryCounts,
  ResponsivenessResponse,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatHhMmTime,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";
import { stage1Api } from "../../lib/stage1-api";
import { clientWhatsappHref } from "../../lib/whatsapp";
import { Button } from "../Button";
import { LoadingBlock } from "../StatePanels";

/** The API's responsiveness window, in days (`?days=` on the request). */
export const RESPONSIVENESS_WINDOW_DAYS = 14;

function labelTitle(
  label: ResponsivenessResponse["label"],
): string {
  return labelFor("responsiveness_label", label);
}

function summaryCounts(data: ResponsivenessResponse): string {
  const { sent, opened, loggedAfter, loggedBefore } = data.counts;
  switch (data.label) {
    case "logs_on_own":
      return `Logged ${loggedBefore} of ${Math.max(sent, loggedBefore + loggedAfter)} before a reminder`;
    case "responds":
      return `Logged ${loggedAfter} of ${sent} after a reminder · ${opened} opened`;
    case "often_misses":
      return `${sent} reminders sent · ${opened} opened · ${loggedAfter} logged after`;
    case "reminders_paused":
      return data.pausedUntil
        ? `Paused until ${formatCivilDate(data.pausedUntil.slice(0, 10))}`
        : "Paused for this client";
    case "notifications_off":
      return sent > 0 ? `${sent} sent · push off` : "Push notifications off";
    case "not_enough_data":
      return sent > 0 ? `${sent} sent · need more history` : "Fewer than 5 reminders in 14 days";
    default:
      return labelTitle(data.label);
  }
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

export function quietHoursText(
  data: Pick<ResponsivenessResponse, "quietHoursStart" | "quietHoursEnd">,
): string | null {
  if (!data.quietHoursStart || !data.quietHoursEnd) return null;
  return `${formatHhMmTime(data.quietHoursStart)} – ${formatHhMmTime(data.quietHoursEnd)}`;
}

export function compactHeadline(
  data: ResponsivenessResponse,
  // Kept so callers (ExceptionDrawer, out of scope for H2) still compile; drop it with that file.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pronoun: string,
): string {
  return `${labelTitle(data.label)} · ${summaryCounts(data)}`;
}

function formatOpened(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

/** "7:00 pm · set by Rohan" — the time and where it came from (frame 181). */
function preferredWorkoutText(
  data: ResponsivenessResponse,
  firstName: string,
): string | null {
  if (!data.preferredWorkoutTime) return null;
  const time = formatHhMmTime(data.preferredWorkoutTime);
  if (data.preferredWorkoutTimeSource === "set") return `${time} · set by ${firstName}`;
  if (data.preferredWorkoutTimeSource === "learned") {
    return `${time} · learned from ${firstName}'s logs`;
  }
  return time;
}

/* Frame 181 layout. No stylesheet is owned by this task, so the drawer's few
   rules live here next to the markup they style. */
const SUMMARY_BOX: CSSProperties = {
  border: "1px solid #dcd5ff",
  background: "#f7f5ff",
  borderRadius: 12,
  padding: "12px 16px",
};
const CAPTION: CSSProperties = {
  margin: 0,
  fontSize: "0.6875rem",
  lineHeight: "1rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--ink-500, #5b616b)",
};
const SUMMARY_TITLE: CSSProperties = {
  margin: "2px 0 0",
  fontSize: "0.9375rem",
  lineHeight: "1.375rem",
  fontWeight: 600,
  color: "var(--deep-navy, #1a1248)",
};
const SUMMARY_LINE: CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  lineHeight: "1.125rem",
  color: "var(--ink-500, #5b616b)",
};
const KV_LIST: CSSProperties = { margin: "4px 0 0", padding: 0 };
const KV_ROW: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 0.42fr) minmax(0, 0.58fr)",
  gap: 12,
  padding: "4px 0",
  fontSize: "0.8125rem",
  lineHeight: "1.25rem",
};
const KV_KEY: CSSProperties = { margin: 0, color: "var(--ink-700, #25262b)" };
const KV_VALUE: CSSProperties = {
  margin: 0,
  fontWeight: 600,
  color: "var(--deep-navy, #1a1248)",
  fontVariantNumeric: "tabular-nums",
};
const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
const FOOTER_TEXT: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  lineHeight: "1rem",
  color: "var(--ink-500, #5b616b)",
};

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={KV_ROW}>
      <dt style={KV_KEY}>
        {label}
        {/* Read as one line by assistive tech: "Sent · 6". */}
        <span style={SR_ONLY}> · </span>
      </dt>
      <dd style={KV_VALUE}>{value}</dd>
    </div>
  );
}

function CategorySection({
  title,
  row,
}: {
  title: string;
  row: ResponsivenessCategoryCounts;
}) {
  return (
    <section className="responsiveness-category" aria-label={title}>
      <h3 style={CAPTION}>{title}</h3>
      <dl style={KV_LIST}>
        <KvRow label="Sent" value={String(row.sent)} />
        <KvRow label="Opened" value={formatOpened(row.opened)} />
        <KvRow label="Logged after reminder" value={String(row.loggedAfter)} />
        <KvRow label="Logged on own" value={String(row.loggedOnOwn)} />
        {/* Frame 181 lists these two only when there is something to count. */}
        {row.notLogged > 0 ? (
          <KvRow label="Not logged" value={String(row.notLogged)} />
        ) : null}
        {row.suppressed > 0 ? (
          <KvRow
            label="Suppressed"
            value={`${row.suppressed} · quiet hours or already logged`}
          />
        ) : null}
      </dl>
    </section>
  );
}

export function ResponsivenessPanel({
  relationshipId,
  compact = false,
  // `gender` stays in the props for callers; the panel no longer words anything by it.
  traineeFirstName = "Client",
  clientWhatsappE164,
  refreshEpoch = 0,
  ended = false,
}: {
  relationshipId: string;
  compact?: boolean;
  gender?: string | null;
  traineeFirstName?: string;
  clientWhatsappE164?: string | null;
  /** Workspace refresh counter: the panel refetches on a refresh, keeping its data on screen. */
  refreshEpoch?: number;
  /** Ended coaching: reminders stay off (D-W7-7). Active clients keep the Configure footer. */
  ended?: boolean;
}) {
  const [data, setData] = useState<ResponsivenessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void stage1Api
      .getResponsiveness(relationshipId, RESPONSIVENESS_WINDOW_DAYS)
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load reminders data.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [relationshipId, refreshEpoch]);

  // A failed background refresh keeps the data already on screen.
  if (error && !data) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }
  if (!data) return <LoadingBlock label="Loading reminder responsiveness…" />;

  const quiet = quietHoursText(data);
  const preferred = preferredWorkoutText(data, traineeFirstName);

  const waSuggestHref =
    data.label === "notifications_off"
      ? clientWhatsappHref({
          phoneE164: clientWhatsappE164,
          name: traineeFirstName,
          onboardingStatus: "active",
        })
      : null;

  if (compact) {
    // Frame 03c: the label, then the 14-day counts and quiet hours on one line.
    return (
      <div className="responsiveness-line">
        <div className="ov-big">{labelTitle(data.label)}</div>
        <div className="ov-sub">
          Last {RESPONSIVENESS_WINDOW_DAYS} days · {lowerFirst(summaryCounts(data))}
          {quiet ? ` · quiet hours ${quiet}` : ""}
        </div>
        {ended ? (
          <p className="ov-sub muted">Reminders are off while coaching is ended.</p>
        ) : data.label === "notifications_off" ? (
          <p className="ov-sub muted">
            Ask {traineeFirstName} to turn on notifications · WhatsApp
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="responsiveness-panel">
      <div style={SUMMARY_BOX}>
        <p style={CAPTION}>Summary</p>
        <p className="responsiveness-summary" style={SUMMARY_TITLE}>
          {labelTitle(data.label)}
        </p>
        <p style={SUMMARY_LINE}>{summaryCounts(data)}</p>
      </div>
      {data.label === "notifications_off" && !ended ? (
        <p className="muted" style={SUMMARY_LINE}>
          {waSuggestHref ? (
            <a href={waSuggestHref} target="_blank" rel="noreferrer">
              Ask {traineeFirstName} to turn on notifications · WhatsApp
            </a>
          ) : (
            <>Ask {traineeFirstName} to turn on notifications · WhatsApp</>
          )}
        </p>
      ) : null}

      {data.categories ? (
        <div className="responsiveness-categories" style={{ gap: 4 }}>
          <CategorySection title="Workouts" row={data.categories.workouts} />
          <CategorySection title="Meals" row={data.categories.meals} />
          <CategorySection title="Check-ins" row={data.categories.checkins} />
        </div>
      ) : null}

      <section aria-label={`${traineeFirstName}'s settings`}>
        <h3 style={CAPTION}>{traineeFirstName}&apos;s settings</h3>
        <dl style={KV_LIST}>
          {preferred ? <KvRow label="Workout time" value={preferred} /> : null}
          {quiet ? <KvRow label="Quiet hours" value={quiet} /> : null}
          <KvRow label="WhatsApp reminders" value="Coming soon" />
        </dl>
      </section>

      <p className="responsiveness-footer muted" style={FOOTER_TEXT}>
        {ended
          ? "Reminders are off while coaching is ended."
          : `Reminders are timed by FitBud and respect ${traineeFirstName}'s settings and meal times. You can switch categories on or off in Configure.`}
      </p>
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Frame 181: the Reminders drawer drawn over the client Overview, opened from
 * the Reminders card's Details. The opener restores focus after `onClose`.
 */
export function RemindersDrawer({
  relationshipId,
  traineeName,
  gender,
  clientWhatsappE164,
  timeZone,
  refreshEpoch = 0,
  ended = false,
  onClose,
}: {
  relationshipId: string;
  traineeName: string;
  gender?: string | null;
  clientWhatsappE164?: string | null;
  /** Trainee timezone, for the civil dates of the 14-day window. */
  timeZone: string;
  refreshEpoch?: number;
  ended?: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const firstName = traineeName.trim().split(/\s+/)[0] ?? traineeName;
  const initials = traineeName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  // The API window is the last 14 × 24 h, so it starts on the civil day 14 days back.
  const [range] = useState(() => {
    const now = Date.now();
    const from = formatLocalDate(
      new Date(now - RESPONSIVENESS_WINDOW_DAYS * 86_400_000),
      timeZone,
    );
    const to = formatLocalDate(new Date(now), timeZone);
    return `${formatCivilDate(from)} — ${formatCivilDate(to)}`;
  });

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
        return;
      }
      if (ev.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        ref={panelRef}
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminders-drawer-title"
        data-testid="screen-TW-31"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <span
            className="avatar"
            aria-hidden="true"
            style={{ width: 40, height: 40, flexShrink: 0 }}
          >
            {initials}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="reminders-drawer-title" style={{ fontSize: 16 }}>
              Reminders · {traineeName}
            </h2>
            <p style={{ ...FOOTER_TEXT, marginTop: 2 }}>
              Last {RESPONSIVENESS_WINDOW_DAYS} days · {range}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn reminders-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="drawer-body">
          <ResponsivenessPanel
            relationshipId={relationshipId}
            gender={gender}
            traineeFirstName={firstName}
            clientWhatsappE164={clientWhatsappE164}
            refreshEpoch={refreshEpoch}
            ended={ended}
          />
        </div>
        <footer
          className="drawer-foot"
          style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}
        >
          <p style={{ ...FOOTER_TEXT, flex: "1 1 160px" }}>
            Opened from Overview › Reminders › Details
          </p>
          <Link
            className="button-secondary"
            to={`/clients/${relationshipId}/configure`}
          >
            {ended ? "View coaching setup" : "Open coaching setup"}
          </Link>
          <Button type="button" variant="primary" onClick={onClose}>
            Close
          </Button>
        </footer>
      </aside>
    </div>
  );
}
