import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { Check, ChevronRight, ClipboardCheck, Info, Plus } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import type {
  Checkin,
  CheckinCadence,
  CheckinFormTemplateSummary,
} from "@fitbud/contracts";
import {
  GLOBAL_CHECKIN_FORM_FIELDS,
  GLOBAL_CHECKIN_FORM_TEMPLATE_ID,
  GLOBAL_CHECKIN_FORM_V1_VERSION_ID,
  GLOBAL_CHECKIN_FORM_V2_FIELDS,
  GLOBAL_CHECKIN_FORM_V2_VERSION_ID,
  checkinAnswerEntries,
  formatCivilDate,
  formatClockTime,
  formatTimeDiff,
  labelFor,
  possessivePronoun,
} from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { whatsappHref } from "../lib/whatsapp";
import { Button } from "../components/Button";
import { WhatsAppGlyph } from "../components/WhatsAppGlyph";
import { TimezoneBadge } from "../components/workspace/TimezoneBadge";
import { ErrorState, LoadingBlock } from "../components/StatePanels";
import type { WorkspaceOutletContext } from "./workspaceContext";
import "./client-checkins.css";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 30;
/** Safety cap on paging (1,500 check-ins). */
const MAX_PAGES = 50;

/** Row state shown on the Check-ins tab (frames 162, 162c). */
export type CheckinRowState =
  | "upcoming"
  | "due"
  | "to_review"
  | "reviewed"
  | "overdue"
  | "missed";

export type CheckinFilter = "all" | "to_review" | "overdue" | "reviewed" | "missed";

const FILTERS: Array<{ id: CheckinFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "to_review", label: "To review" },
  { id: "overdue", label: "Overdue" },
  { id: "reviewed", label: "Reviewed" },
  { id: "missed", label: "Missed" },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Tab state from the server-derived status. The API has no missed status, so
 * an active client's overdue check-in always reads Overdue. Once coaching has
 * ended (persisted on the relationship) an unsubmitted check-in can no longer
 * come in, so it reads Missed (frame 162c).
 */
export function checkinRowState(
  item: Pick<Checkin, "status">,
  input: { ended: boolean },
): CheckinRowState {
  switch (item.status) {
    case "scheduled":
      return "upcoming";
    case "due":
      return "due";
    case "submitted":
      return "to_review";
    case "reviewed":
      return "reviewed";
    case "overdue":
      return input.ended ? "missed" : "overdue";
    default:
      return "due";
  }
}

function localDateIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "Sun 18 Oct, 9:12 pm" in the given zone. */
function formatDayTime(iso: string, timeZone: string, now: Date): string {
  return `${formatCivilDate(localDateIn(iso, timeZone), { now })}, ${formatClockTime(iso, timeZone)}`;
}

function wholeDays(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / DAY_MS);
}

function monthKey(localDate: string): string {
  return localDate.slice(0, 7);
}

function monthHeading(localDate: string, now: Date): string {
  const year = Number(localDate.slice(0, 4));
  const month = MONTHS[Number(localDate.slice(5, 7)) - 1] ?? "";
  return year === now.getFullYear() ? month : `${month} ${year}`;
}

function formatKg(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} kg`;
}

function isGlobalPin(versionId: string): boolean {
  return (
    versionId === GLOBAL_CHECKIN_FORM_V1_VERSION_ID ||
    versionId === GLOBAL_CHECKIN_FORM_V2_VERSION_ID
  );
}

/** Weight and waist from the answers, read through the pinned global form. */
function keyMeasurements(item: Checkin): { weightKg: number | null; waistCm: number | null } {
  const answers = item.answers;
  if (!answers) return { weightKg: null, waistCm: null };
  let weightKg = typeof answers.bodyWeightKg === "number" ? answers.bodyWeightKg : null;
  let waistCm: number | null = null;
  if (isGlobalPin(item.checkinFormVersionId)) {
    const fields =
      item.checkinFormVersionId === GLOBAL_CHECKIN_FORM_V2_VERSION_ID
        ? GLOBAL_CHECKIN_FORM_V2_FIELDS
        : GLOBAL_CHECKIN_FORM_FIELDS;
    for (const entry of checkinAnswerEntries(fields, answers)) {
      if (typeof entry.value !== "number") continue;
      const id = entry.key ?? entry.fieldId;
      if ((id === "weight" || id === "body_weight") && weightKg === null) {
        weightKg = entry.value;
      }
      if (id === "waist") waistCm = entry.value;
    }
  }
  return { weightKg, waistCm };
}

function clientNote(item: Checkin): string | null {
  const answers = item.answers;
  if (!answers) return null;
  const fromField = answers.fieldAnswers?.notes;
  const note =
    answers.notes?.trim() ||
    (typeof fromField === "string" ? fromField.trim() : "") ||
    "";
  return note || null;
}

type Row = {
  item: Checkin;
  state: CheckinRowState;
  formName: string;
  detail: string;
  measurements: string | null;
  note: string | null;
  chip: string;
  aside: string | null;
  overdueDays: number;
};

function chipTone(state: CheckinRowState): string {
  switch (state) {
    case "upcoming":
      return "brand-selected";
    case "due":
      return "info";
    case "to_review":
      return "attention";
    case "reviewed":
      return "positive";
    case "overdue":
      return "critical";
    default:
      return "neutral";
  }
}

export function ClientCheckinsPage() {
  const { me } = useAuth();
  const trainerTz =
    me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const { relationshipId = "" } = useParams();
  const {
    workspace,
    online,
    ended,
    refreshEpoch = 0,
  } = useOutletContext<WorkspaceOutletContext>();

  const clientTz = workspace?.header.traineeTimezone ?? trainerTz;
  const clientName = workspace?.header.traineeDisplayName ?? "Client";
  const firstName = clientName.trim().split(/\s+/)[0] || clientName;
  const pronoun = possessivePronoun(workspace?.header.traineeProfile.gender);
  const configuration = workspace?.configuration?.configuration ?? null;
  // Scheduling needs an active configuration (API: NO_ACTIVE_CONFIGURATION).
  const configurationActive = configuration?.status === "active";
  const cadence: CheckinCadence | null = configuration?.checkin.cadence ?? null;
  const preferredVersionId = configuration?.checkin.formVersionId ?? null;
  const clientPhone = workspace?.header.clientWhatsappE164 ?? null;
  const endedAt = workspace?.header.endedAt ?? null;

  const [items, setItems] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  /** True only if the page cap was hit with more pages left: counts are then hidden. */
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [forms, setForms] = useState<CheckinFormTemplateSummary[]>([]);
  /** "" sends no form: the API pins the client's preferred form, else the global default. */
  const [formVersionId, setFormVersionId] = useState<string>("");
  const [filter, setFilter] = useState<CheckinFilter>("all");
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Counts and "This month" need the whole history, so every page is loaded
  // before the list shows.
  const load = useCallback(
    async () => {
      if (!relationshipId) return;
      setLoading(true);
      setError(null);
      try {
        const all: Checkin[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
          const result = await apiClient.listCheckins(relationshipId, {
            cursor: cursor ?? undefined,
            limit: PAGE_SIZE,
          });
          all.push(...result.items);
          cursor = result.nextCursor;
          pages += 1;
        } while (cursor && pages < MAX_PAGES);
        setItems(all);
        setPartial(Boolean(cursor));
        setNowMs(Date.now());
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load check-ins.",
        );
      } finally {
        setLoading(false);
      }
    },
    [relationshipId],
  );

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  useEffect(() => {
    void apiClient.listCheckinFormTemplates({ limit: 50, scope: "all" }).then(
      (result) => setForms(result.items),
      () => setForms([]),
    );
  }, []);

  const formNameFor = useCallback(
    (versionId: string | null): string | null => {
      if (!versionId) return null;
      const templateId = isGlobalPin(versionId)
        ? GLOBAL_CHECKIN_FORM_TEMPLATE_ID
        : null;
      const match = forms.find(
        (form) =>
          form.latestVersionId === versionId ||
          (templateId !== null && form.id === templateId),
      );
      return match?.name ?? null;
    },
    [forms],
  );

  const defaultFormName = useMemo(() => {
    if (preferredVersionId) return formNameFor(preferredVersionId);
    return formNameFor(GLOBAL_CHECKIN_FORM_V2_VERSION_ID);
  }, [formNameFor, preferredVersionId]);

  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const rows: Row[] = useMemo(() => {
    const sorted = [...items].sort((a, b) =>
      a.localDate === b.localDate
        ? b.createdAt.localeCompare(a.createdAt)
        : b.localDate.localeCompare(a.localDate),
    );
    const built: Row[] = [];
    sorted.forEach((item, index) => {
      const state = checkinRowState(item, { ended });
      // Ended: no upcoming or open rows (frame 162c).
      if (ended && (state === "upcoming" || state === "due")) return;
      const overdueDays = Math.max(0, wholeDays(Date.parse(item.windowEndsAt), nowMs));
      const { weightKg, waistCm } = keyMeasurements(item);
      let measurements: string | null = null;
      if (weightKg !== null) {
        const parts = [`Weight ${formatKg(weightKg)}`];
        const previous = sorted
          .slice(index + 1)
          .map((older) => keyMeasurements(older).weightKg)
          .find((value) => value !== null);
        if (previous !== undefined && previous !== null) {
          const delta = Math.round((weightKg - previous) * 10) / 10;
          parts.push(
            delta === 0
              ? "no change"
              : `${delta < 0 ? "down" : "up"} ${formatKg(Math.abs(delta))}`,
          );
        }
        if (waistCm !== null) parts.push(`waist ${waistCm} cm`);
        measurements = parts.join(" · ");
      } else if (waistCm !== null) {
        measurements = `Waist ${waistCm} cm`;
      }

      let detail = "";
      let chip = "";
      let aside: string | null = null;
      let note: string | null = null;
      const dueDate = formatCivilDate(item.localDate, { now });
      switch (state) {
        case "upcoming":
          detail = `Opens ${formatDayTime(item.windowStartsAt, clientTz, now)}`;
          chip = "Upcoming";
          break;
        case "due":
          detail = `Due ${formatDayTime(item.windowEndsAt, clientTz, now)} · not submitted yet`;
          chip = labelFor("checkin_status", "due");
          break;
        case "overdue":
          detail = `Due ${dueDate} · not submitted yet`;
          chip = overdueDays >= 1 ? `Overdue · ${overdueDays} d` : "Overdue";
          break;
        case "missed":
          detail = "Not submitted";
          chip = "Missed";
          break;
        case "to_review":
          chip = "To review";
          note = clientNote(item);
          note = note ? `"${note}"` : null;
          break;
        case "reviewed": {
          chip = item.review
            ? `Reviewed · ${labelFor("checkin_review_outcome", item.review.outcome)}`
            : labelFor("checkin_status", "reviewed");
          const trainerNote = item.review?.notes?.trim();
          const fromClient = clientNote(item);
          note = trainerNote
            ? `You: "${trainerNote}"`
            : fromClient
              ? `"${fromClient}"`
              : null;
          break;
        }
      }
      if (item.submittedAt) {
        const lateDays = wholeDays(
          Date.parse(item.windowEndsAt),
          Date.parse(item.submittedAt),
        );
        aside = `Submitted ${formatDayTime(item.submittedAt, clientTz, now)}${
          lateDays >= 1 ? ` · ${lateDays} d late` : ""
        }`;
      }

      built.push({
        item,
        state,
        formName: formNameFor(item.checkinFormVersionId) ?? "Check-in",
        detail,
        measurements,
        note,
        chip,
        aside,
        overdueDays,
      });
    });
    return built;
  }, [items, nowMs, ended, clientTz, now, formNameFor]);

  const counts = useMemo(() => {
    const result: Record<CheckinFilter, number> = {
      all: rows.length,
      to_review: 0,
      overdue: 0,
      reviewed: 0,
      missed: 0,
    };
    for (const row of rows) {
      if (row.state === "to_review") result.to_review += 1;
      else if (row.state === "overdue") result.overdue += 1;
      else if (row.state === "reviewed") result.reviewed += 1;
      else if (row.state === "missed") result.missed += 1;
    }
    return result;
  }, [rows]);

  const visibleFilters = ended
    ? FILTERS.filter((entry) => entry.id !== "overdue")
    : FILTERS;
  const activeFilter: CheckinFilter =
    ended && filter === "overdue" ? "all" : filter;
  const filtered =
    activeFilter === "all"
      ? rows
      : rows.filter((row) => row.state === activeFilter);

  const groups = useMemo(() => {
    const result: Array<{ key: string; heading: string; rows: Row[] }> = [];
    for (const row of filtered) {
      const key = monthKey(row.item.localDate);
      const last = result[result.length - 1];
      if (last && last.key === key) last.rows.push(row);
      else
        result.push({
          key,
          heading: monthHeading(row.item.localDate, now),
          rows: [row],
        });
    }
    return result;
  }, [filtered, now]);

  // Summary (frame 162). Every value comes from the configuration or the list.
  const nextCheckin = useMemo(() => {
    const today = localDateIn(new Date(nowMs).toISOString(), clientTz);
    const upcoming = items
      .filter((item) => item.status === "scheduled" || item.status === "due")
      .filter((item) => item.localDate >= today)
      .sort((a, b) => a.localDate.localeCompare(b.localDate));
    return upcoming[0] ?? (ended ? null : workspace?.overview?.nextCheckin) ?? null;
  }, [items, nowMs, clientTz, workspace, ended]);

  const thisMonth = useMemo(() => {
    const month = monthKey(localDateIn(new Date(nowMs).toISOString(), clientTz));
    let expected = 0;
    let submitted = 0;
    for (const item of items) {
      if (monthKey(item.localDate) !== month) continue;
      if (item.status === "scheduled" || item.status === "due") continue;
      expected += 1;
      if (item.status === "submitted" || item.status === "reviewed") submitted += 1;
    }
    return { expected, submitted };
  }, [items, nowMs, clientTz]);

  const cadenceValue = configurationActive && cadence
    ? [labelFor("checkin_cadence", cadence), defaultFormName]
        .filter(Boolean)
        .join(" · ")
    : null;

  // "weekly" / "monthly" from the configuration's cadence label (frame 162b).
  const cadenceWord =
    cadence && cadence !== "biweekly"
      ? `${labelFor("checkin_cadence", cadence).toLowerCase()} `
      : "";

  const preview = useMemo(() => {
    if (!scheduleDate) return null;
    // Approximate: show civil due in client TZ label + trainer clock for same instant mid-day.
    const mid = new Date(`${scheduleDate}T18:29:00.000Z`);
    const clientLabel = formatCivilDate(scheduleDate);
    const trainerClock = formatClockTime(mid, trainerTz);
    const diff = formatTimeDiff(trainerTz, clientTz, mid);
    return `Due ${clientLabel}, 11:59 pm ${firstName}'s time (${trainerClock} your time${diff ? ` · ${diff}` : ""})`;
  }, [scheduleDate, firstName, clientTz, trainerTz]);

  function openSchedule() {
    setShowSchedule(true);
    setMessage(null);
    if (!scheduleDate) {
      setScheduleDate(localDateIn(new Date().toISOString(), clientTz));
    }
  }

  async function scheduleCheckin() {
    if (!relationshipId || !scheduleDate || !online || ended) return;
    setScheduling(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.scheduleCheckin(
        relationshipId,
        {
          localDate: scheduleDate,
          ...(formVersionId ? { checkinFormVersionId: formVersionId } : {}),
        },
        createIdempotencyKey(),
      );
      setMessage(
        result.created
          ? `Scheduled check-in for ${formatCivilDate(result.checkin.localDate)}.`
          : `Check-in for ${formatCivilDate(result.checkin.localDate)} already exists.`,
      );
      setShowSchedule(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not schedule check-in.",
      );
    } finally {
      setScheduling(false);
    }
  }

  function reminderHref(row: Row): string | null {
    if (!clientPhone) return null;
    return whatsappHref({
      phoneE164: clientPhone,
      draftText: `Hi ${firstName}, a quick reminder: your check-in for ${formatCivilDate(row.item.localDate, { now })} is still open. Send it when you can.`,
    });
  }

  const scheduleButton =
    !ended && configurationActive ? (
      <Button
        variant="primary"
        disabled={!online}
        onClick={() => openSchedule()}
      >
        <Plus size={16} aria-hidden="true" />
        Schedule check-in
      </Button>
    ) : null;

  const endedLabel = endedAt
    ? formatCivilDate(localDateIn(endedAt, clientTz), { now })
    : null;
  const possessive = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);

  return (
    <div className="workspace-page client-checkins" data-testid="screen-TW-19">
      <h1 className="sr-only">Check-ins</h1>

      {!online ? (
        <p className="offline-banner" role="status">
          You&apos;re offline. Scheduling is unavailable.
        </p>
      ) : null}

      {ended ? (
        <p className="client-checkins-ended" role="note">
          <Info size={16} aria-hidden="true" />
          <span>
            {endedLabel
              ? `Coaching with ${firstName} ended ${endedLabel}. `
              : `Coaching with ${firstName} has ended. `}
            {possessive} check-ins are read-only.
          </span>
        </p>
      ) : (
        <dl className="client-checkins-summary">
          {cadenceValue ? (
            <div>
              <dt>Cadence</dt>
              <dd>{cadenceValue}</dd>
            </div>
          ) : null}
          <div>
            <dt>Next check-in</dt>
            <dd>
              {nextCheckin
                ? formatCivilDate(nextCheckin.localDate, { now })
                : "None scheduled"}
            </dd>
          </div>
          {!partial ? (
            <div>
              <dt>This month</dt>
              <dd>
                {thisMonth.expected > 0
                  ? `${thisMonth.submitted} of ${thisMonth.expected} submitted`
                  : `${thisMonth.submitted} of ${thisMonth.expected}`}
              </dd>
            </div>
          ) : null}
        </dl>
      )}

      {error ? (
        <ErrorState message={error} screenId="TW-19" onRetry={() => void load()} />
      ) : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}

      <div className="client-checkins-toolbar">
        <div
          className="client-checkins-chips"
          role="group"
          aria-label="Filter check-ins"
        >
          {visibleFilters.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="client-checkins-chip"
              aria-pressed={activeFilter === entry.id}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
              {!partial ? (
                <>
                  {" "}
                  <span className="client-checkins-count">{counts[entry.id]}</span>
                </>
              ) : null}
            </button>
          ))}
        </div>
        {!ended && configurationActive ? (
          <div className="client-checkins-actions">
            <Link
              className="button-secondary"
              to={`/clients/${relationshipId}/configure`}
            >
              Change schedule
            </Link>
            {rows.length > 0 ? scheduleButton : null}
          </div>
        ) : null}
      </div>

      {showSchedule ? (
        <section
          className="workspace-card schedule-checkin-panel"
          aria-labelledby="schedule-heading"
        >
          <h2 id="schedule-heading" className="workspace-card-title">
            Schedule check-in
          </h2>
          <TimezoneBadge
            traineeName={clientName}
            traineeTimezone={clientTz}
            trainerTimezone={trainerTz}
          />
          <label className="field">
            <span>Date ({firstName}&apos;s time)</span>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Form</span>
            <select
              value={formVersionId}
              onChange={(e) => setFormVersionId(e.target.value)}
            >
              <option value="">
                {defaultFormName
                  ? `${firstName}'s default form (${defaultFormName})`
                  : `${firstName}'s default form`}
              </option>
              {forms.map((form) => (
                <option key={form.id} value={form.latestVersionId}>
                  {form.name}
                </option>
              ))}
            </select>
          </label>
          {preview ? <p className="lede">{preview}</p> : null}
          <div className="button-row">
            <Button
              variant="primary"
              disabled={scheduling || !scheduleDate || !online}
              onClick={() => void scheduleCheckin()}
            >
              {scheduling ? "Scheduling…" : "Schedule"}
            </Button>
            <Button variant="tertiary" onClick={() => setShowSchedule(false)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {loading ? <LoadingBlock label="Loading check-ins…" /> : null}

      {!loading && !error && rows.length === 0 ? (
        <section className="client-checkins-empty" data-testid="empty-state">
          <span className="client-checkins-empty-icon" aria-hidden="true">
            <ClipboardCheck size={22} />
          </span>
          <h2>No check-ins yet</h2>
          <p>
            {ended
              ? `${firstName} has no check-ins from ${pronoun} coaching.`
              : `${
                  nextCheckin
                    ? `${firstName}'s first ${cadenceWord}check-in opens ${formatCivilDate(nextCheckin.localDate, { now })}.`
                    : configurationActive
                      ? `${firstName}'s first ${cadenceWord}check-in shows here once it's scheduled.`
                      : `Check-ins start once ${pronoun} coaching setup is active.`
                } Submitted check-ins show up here, newest first.`}
          </p>
          {scheduleButton}
        </section>
      ) : null}

      {!loading && rows.length > 0 && filtered.length === 0 ? (
        <p className="muted client-checkins-none" role="status">
          No check-ins match this filter.
        </p>
      ) : null}

      {!loading
        ? groups.map((group) => (
            <section
              key={group.key}
              className="client-checkins-group"
              aria-label={group.heading}
            >
              <h2 className="client-checkins-month">{group.heading}</h2>
              <table className="client-checkins-list">
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Check-in</th>
                    <th scope="col">Details</th>
                    <th scope="col">Status</th>
                    <th scope="col">Submitted or action</th>
                    <th scope="col">Open</th>
                  </tr>
                </thead>
                <tbody>
                {group.rows.map((row) => {
                  const href = row.state === "overdue" ? reminderHref(row) : null;
                  const date = formatCivilDate(row.item.localDate, { now });
                  return (
                    <tr
                      key={row.item.id}
                      className={`client-checkins-row is-${row.state}`}
                      data-state={row.state}
                    >
                      <td className="client-checkins-date">
                        <Link
                          className="client-checkins-open"
                          to={`/clients/${relationshipId}/check-ins/${row.item.id}`}
                          aria-label={`Open ${date} check-in`}
                        >
                          {date}
                        </Link>
                        <span>{row.formName}</span>
                      </td>
                      <td className="client-checkins-detail">
                        {row.measurements ? (
                          <div className="client-checkins-measure">{row.measurements}</div>
                        ) : null}
                        {row.note ? (
                          <div className="client-checkins-note">{row.note}</div>
                        ) : null}
                        {!row.measurements && !row.note && row.detail ? (
                          <div className="muted">{row.detail}</div>
                        ) : null}
                      </td>
                      <td className="client-checkins-status">
                        <span
                          className={`status-chip status-chip-${chipTone(row.state)}`}
                          data-value={row.state}
                        >
                          {row.state === "reviewed" ? (
                            <Check size={14} strokeWidth={2} aria-hidden="true" />
                          ) : null}
                          <span>{row.chip}</span>
                        </span>
                      </td>
                      <td className="client-checkins-aside">
                        {href ? (
                          <a
                            className="button-tinted client-checkins-remind"
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            title="Opens WhatsApp with a draft. You press Send."
                            aria-label="Remind on WhatsApp"
                          >
                            <WhatsAppGlyph />
                            <span>
                              Remind
                              <span className="client-checkins-remind-long"> on WhatsApp</span>
                            </span>
                          </a>
                        ) : row.aside ? (
                          <span>{row.aside}</span>
                        ) : null}
                      </td>
                      <td className="client-checkins-chevron" aria-hidden="true">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </section>
          ))
        : null}

    </div>
  );
}
