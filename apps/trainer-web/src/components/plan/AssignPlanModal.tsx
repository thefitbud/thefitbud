import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { AssignPlanVersionResponse, PlanContent, DietAdjustmentScope } from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatCivilDate,
  formatLocalDate,
  localDateTimeToUtcIso,
  nextCalendarWeekRange,
} from "@fitbud/core";
import { ApiClientError } from "@fitbud/api-client";
import { stage1Api } from "../../lib/stage1-api";
import { createIdempotencyKey } from "../../lib/idempotency";
import type { PublishIssues } from "../builder/validation";
import { CivilDateField } from "./CivilDateField";
import { DietScopePicker, type TodayMealsPreview } from "./DietScopePicker";
import "./plan-modals.css";

export type AssignActivePlan = {
  title: string;
  versionNumber: number;
  content: PlanContent;
};

export type AssignPartialInfo = {
  planTitle: string;
  startLocalDate: string;
  traineeName: string;
};

type StartMode = "monday" | "today" | "pick";

const DEFAULT_WEEKS = 8;
const PICK_MAX_DAYS = 28;

function planKindLabel(content: PlanContent): string {
  const workouts = content.workoutDays.length > 0;
  const meals = content.mealPrescriptions.length > 0;
  if (workouts && !meals) return "Workout plan";
  if (meals && !workouts) return "Nutrition plan";
  return "Plan";
}

/** Inclusive last day after `weeks` full Mon–Sun blocks starting on `start`. */
function endAfterWeeks(start: string, weeks: number): string {
  return addDaysToLocalDate(start, weeks * 7 - 1);
}

function startForMode(mode: StartMode, today: string, picked: string): string | null {
  if (mode === "today") return today;
  if (mode === "monday") return nextCalendarWeekRange(today).fromDate;
  return picked || null;
}

export function AssignPlanModal({
  relationshipId,
  planId,
  versionId,
  content,
  planTitle = "Plan",
  traineeName,
  traineeTimezone,
  activePlan,
  nutritionOnly = false,
  issues,
  ended = false,
  online = true,
  /** When true, a successful publish surfaces the reminders partial-failure state (frame 157). */
  forcePartialReminders = false,
  onClose,
  onAssigned,
  onPartialReminders,
}: {
  relationshipId: string;
  planId: string;
  versionId: string;
  content: PlanContent;
  planTitle?: string;
  traineeName: string;
  traineeTimezone: string;
  trainerTimezone?: string | null;
  activePlan: AssignActivePlan | null;
  nutritionOnly?: boolean;
  issues: PublishIssues;
  ended?: boolean;
  online?: boolean;
  forcePartialReminders?: boolean;
  onClose: () => void;
  onAssigned: (result: AssignPlanVersionResponse) => void;
  onPartialReminders?: (info: AssignPartialInfo) => void;
}) {
  const today = useMemo(() => formatLocalDate(new Date(), traineeTimezone), [traineeTimezone]);
  const monday = useMemo(() => nextCalendarWeekRange(today).fromDate, [today]);
  const pickMax = useMemo(() => addDaysToLocalDate(today, PICK_MAX_DAYS), [today]);

  const [startMode, setStartMode] = useState<StartMode>("monday");
  const [pickedDate, setPickedDate] = useState("");
  const [dietScope, setDietScope] = useState<DietAdjustmentScope>("today_onward");
  const [todayMeals, setTodayMeals] = useState<TodayMealsPreview>({ status: "loading" });
  const [todayMealsEpoch, setTodayMealsEpoch] = useState(0);
  const [acting, setActing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const effectiveFrom = startForMode(startMode, today, pickedDate);
  const effectiveTo = effectiveFrom ? endAfterWeeks(effectiveFrom, DEFAULT_WEEKS) : "";
  const endsLabel = effectiveFrom
    ? `After ${DEFAULT_WEEKS} weeks · ${formatCivilDate(effectiveTo)}`
    : "Choose a start date first";

  const effectiveFromError =
    startMode === "pick" && !pickedDate
      ? "Choose a start date."
      : effectiveFrom && effectiveFrom < today
        ? "The plan can't start in the past."
        : startMode === "pick" && pickedDate && pickedDate > pickMax
          ? "Pick a date within the next 4 weeks."
          : null;

  const formError = effectiveFromError;
  const blocked = issues.blocking.length > 0 || Boolean(formError) || ended || !online || !effectiveFrom;

  useEffect(() => {
    if (!nutritionOnly) return;
    let cancelled = false;
    setTodayMeals({ status: "loading" });
    stage1Api
      .listMealAssignments(relationshipId, { fromDate: today, toDate: today })
      .then((result) => {
        if (cancelled) return;
        const live = result.items.filter((item) => item.scheduleStatus === "scheduled");
        setTodayMeals({
          status: "ready",
          total: live.length,
          changing: live.filter((item) => item.compliance == null).map((item) => item.mealName),
          protectedMeals: live.filter((item) => item.compliance != null).map((item) => item.mealName),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTodayMeals({
          status: "error",
          message: err instanceof Error ? err.message : "Couldn't load today's meals.",
          onRetry: () => setTodayMealsEpoch((value) => value + 1),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [nutritionOnly, relationshipId, today, todayMealsEpoch]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !acting) onClose();
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [acting, onClose]);

  async function publish(overrideFrom?: string) {
    const from = overrideFrom ?? effectiveFrom;
    if ((!overrideFrom && blocked) || acting || !from) return;
    if (ended || !online || issues.blocking.length > 0) return;
    setActing(true);
    setFailure(null);
    const to = endAfterWeeks(from, DEFAULT_WEEKS);
    const range = { fromDate: from, toDate: addDaysToLocalDate(from, 6) };
    const body = {
      window: 7,
      effectiveFrom: localDateTimeToUtcIso(from, traineeTimezone, 0, 0, 0),
      effectiveTo: localDateTimeToUtcIso(to, traineeTimezone, 23, 59, 59),
      windowFrom: range.fromDate,
      windowTo: range.toDate,
      dietChangeScope: nutritionOnly ? dietScope : undefined,
      notifyClient: true,
      dryRun: false as const,
    };
    const sig = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.signature !== sig) {
      keyRef.current = { signature: sig, key: createIdempotencyKey() };
    }
    try {
      const result = await stage1Api.assignPlanVersion(
        planId,
        versionId,
        body,
        keyRef.current.key,
      );
      if (forcePartialReminders && onPartialReminders) {
        onPartialReminders({
          planTitle,
          startLocalDate: from,
          traineeName,
        });
        return;
      }
      onAssigned(result);
    } catch (err) {
      setFailure(
        err instanceof ApiClientError ? err.message : "Couldn't create this week's schedule",
      );
    } finally {
      setActing(false);
    }
  }

  const mondayLabel = formatCivilDate(monday);
  const startOptions: Array<{ mode: StartMode; title: string; body: string }> = [
    {
      mode: "monday",
      title: `Start ${mondayLabel}`,
      body: "Next Monday. Reminders start the night before.",
    },
    {
      mode: "today",
      title: "Start today",
      body: "Today's sessions show right away.",
    },
    {
      mode: "pick",
      title: "Pick a date",
      body: "Up to 4 weeks ahead.",
    },
  ];

  // Nutrition-only adjustment: frame 156 diet-scope modal is the primary surface.
  if (nutritionOnly) {
    return (
      <DietScopePicker
        value={dietScope}
        onChange={setDietScope}
        preview={todayMeals}
        today={today}
        changeSummary={`${planTitle} · Nutrition adjustment for ${traineeName}`}
        asModal
        acting={acting}
        onCancel={onClose}
        onApply={() => void publish(today)}
      />
    );
  }

  return (
    <div className="modal-scrim" role="presentation">
      <div
        className="modal-card assign-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        data-testid="screen-TW-16"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="assign-head assign-head-row">
          <div>
            <h2 id="assign-title">Publish &amp; schedule</h2>
            <p className="muted assign-sub">
              {planTitle} · {planKindLabel(content)} for {traineeName}
            </p>
          </div>
          <button
            type="button"
            className="assign-close"
            aria-label="Close"
            disabled={acting}
            onClick={onClose}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </header>

        {ended ? (
          <p className="builder-banner is-attention" role="alert">
            Coaching has ended. This plan can&apos;t be published.
          </p>
        ) : null}
        {!online ? (
          <p className="builder-banner is-offline" role="status">
            You&apos;re offline. Reconnect to publish.
          </p>
        ) : null}

        {issues.blocking.length > 0 || issues.notes.length > 0 ? (
          <section className="publish-issues" aria-label="Before you publish" data-testid="publish-issues">
            {issues.blocking.length > 0 ? (
              <ul className="publish-blocking">
                {issues.blocking.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
            {issues.notes.length > 0 ? (
              <ul className="publish-notes">
                {issues.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <div className="assign-body">
          <div className="radio-cards" role="radiogroup" aria-label="Start date">
            {startOptions.map((option) => (
              <label
                key={option.mode}
                className={startMode === option.mode ? "radio-card is-selected" : "radio-card"}
              >
                <input
                  type="radio"
                  name="start-mode"
                  checked={startMode === option.mode}
                  disabled={acting}
                  onChange={() => setStartMode(option.mode)}
                />
                <span className="radio-card-copy">
                  <span className="radio-card-title">{option.title}</span>
                  <span className="radio-card-detail">{option.body}</span>
                </span>
              </label>
            ))}
          </div>

          {startMode === "pick" ? (
            <CivilDateField
              id="assign-pick-date"
              label="Start date"
              value={pickedDate}
              min={today}
              max={pickMax}
              invalid={Boolean(effectiveFromError)}
              describedBy={effectiveFromError ? "assign-start-error" : undefined}
              disabled={acting}
              onChange={setPickedDate}
            />
          ) : null}

          {effectiveFromError ? (
            <p className="field-error" role="alert" id="assign-start-error">
              {effectiveFromError}
            </p>
          ) : null}

          <div className="assign-ends">
            <span className="assign-ends-label">Ends</span>
            <p className="assign-ends-value" data-testid="assign-ends">
              {endsLabel}
            </p>
          </div>

          {activePlan ? (
            <p className="assign-replace" role="status" data-testid="assign-replace">
              From {effectiveFrom ? formatCivilDate(effectiveFrom) : "the start date"}, this
              replaces{" "}
              <em>
                {activePlan.title} v{activePlan.versionNumber}
              </em>
              . Anything already logged stays as it is.
            </p>
          ) : null}
        </div>

        {failure ? (
          <p className="field-error assign-failure" role="alert">
            {failure} ·{" "}
            <button type="button" className="button-link" onClick={() => void publish()}>
              Retry
            </button>
          </p>
        ) : null}

        <footer className="assign-actions">
          <button type="button" className="button-secondary" disabled={acting} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={blocked || acting}
            onClick={() => void publish()}
          >
            {acting ? "Publishing…" : "Publish"}
          </button>
        </footer>
      </div>
    </div>
  );
}
