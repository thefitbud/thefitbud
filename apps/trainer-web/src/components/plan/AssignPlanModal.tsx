import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssignPlanVersionResponse, PlanContent, DietAdjustmentScope } from "@fitbud/contracts";
import {
  clipInclusiveLocalRange,
  formatCivilDate,
  formatLocalDate,
  formatTimeDiff,
  localDateTimeToUtcIso,
  localDatesInRange,
  mealsOnDates,
  workoutSchedulesMatch,
  workoutSessionsOnDates,
} from "@fitbud/core";
import { ApiClientError } from "@fitbud/api-client";
import { stage1Api } from "../../lib/stage1-api";
import { createIdempotencyKey } from "../../lib/idempotency";
import {
  DateWindowPicker,
  windowError,
  windowRange,
  type DateWindowValue,
} from "../DateWindowPicker";
import { TimezoneBadge } from "../workspace/TimezoneBadge";
import type { PublishIssues } from "../builder/validation";
import { DietScopePicker, type TodayMealsPreview } from "./DietScopePicker";

export type AssignActivePlan = {
  title: string;
  versionNumber: number;
  content: PlanContent;
};

type Replacement = { workouts: number; meals: number };

type DryRun =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; dates: string[] };

function cityOf(timezone: string): string {
  return (timezone.split("/").pop() ?? timezone).replace(/_/g, " ");
}

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function AssignPlanModal({
  relationshipId,
  planId,
  versionId,
  content,
  traineeName,
  traineeTimezone,
  trainerTimezone,
  activePlan,
  nutritionOnly = false,
  issues,
  ended = false,
  online = true,
  onClose,
  onAssigned,
}: {
  relationshipId: string;
  planId: string;
  versionId: string;
  content: PlanContent;
  traineeName: string;
  traineeTimezone: string;
  trainerTimezone?: string | null;
  activePlan: AssignActivePlan | null;
  nutritionOnly?: boolean;
  issues: PublishIssues;
  ended?: boolean;
  online?: boolean;
  onClose: () => void;
  onAssigned: (result: AssignPlanVersionResponse) => void;
}) {
  const today = useMemo(() => formatLocalDate(new Date(), traineeTimezone), [traineeTimezone]);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [validity, setValidity] = useState<"ongoing" | "until">("ongoing");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [window, setWindow] = useState<DateWindowValue>({
    mode: "next_7_days",
    customFrom: "",
    customTo: "",
  });
  const [dietScope, setDietScope] = useState<DietAdjustmentScope>("today_onward");
  const [notifyClient, setNotifyClient] = useState(true);
  const [dryRun, setDryRun] = useState<DryRun>({ status: "loading" });
  const [replacement, setReplacement] = useState<Replacement | null>(null);
  const [todayMeals, setTodayMeals] = useState<TodayMealsPreview>({ status: "loading" });
  const [todayMealsEpoch, setTodayMealsEpoch] = useState(0);
  const [dryRunEpoch, setDryRunEpoch] = useState(0);
  const [acting, setActing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const first = firstName(traineeName);
  const effectiveFromError =
    !effectiveFrom
      ? "Choose a start date."
      : effectiveFrom < today
        ? "The plan can't start in the past."
        : null;
  const effectiveToError =
    validity === "until"
      ? !effectiveTo
        ? "Choose an end date."
        : effectiveTo < effectiveFrom
          ? "The end date must be on or after the start date."
          : null
      : null;
  const customError = windowError(window, today);
  const range = windowRange(window, today);
  const datesInWindow = useMemo(() => {
    if (!range) return [];
    const clipped = clipInclusiveLocalRange(range, {
      fromDate: effectiveFrom || null,
      toDate: validity === "until" && effectiveTo ? effectiveTo : null,
    });
    return clipped ? localDatesInRange(clipped).slice(0, 35) : [];
  }, [range, effectiveFrom, effectiveTo, validity]);

  const formError = effectiveFromError ?? effectiveToError ?? customError;
  const blocked = issues.blocking.length > 0 || Boolean(formError) || ended || !online;
  const effectiveDates = nutritionOnly && dietScope === "today_only" ? [today] : datesInWindow;

  const payload = useCallback(
    (dryRunFlag: boolean) => {
      const windowDates = range ? localDatesInRange(range) : [];
      return {
        window: Math.min(35, Math.max(1, windowDates.length)),
        effectiveFrom: localDateTimeToUtcIso(effectiveFrom || today, traineeTimezone, 0, 0, 0),
        effectiveTo:
          validity === "until" && effectiveTo
            ? localDateTimeToUtcIso(effectiveTo, traineeTimezone, 23, 59, 59)
            : undefined,
        windowFrom: range?.fromDate,
        windowTo: range?.toDate,
        dietChangeScope: nutritionOnly ? dietScope : undefined,
        notifyClient,
        dryRun: dryRunFlag,
      };
    },
    [range, effectiveFrom, effectiveTo, validity, today, traineeTimezone, nutritionOnly, dietScope, notifyClient],
  );

  const signature = JSON.stringify(payload(false));

  useEffect(() => {
    if (formError || ended || !online) {
      setDryRun({ status: "loading" });
      return;
    }
    let cancelled = false;
    setDryRun({ status: "loading" });
    const timer = globalThis.setTimeout(() => {
      stage1Api
        .assignPlanVersion(planId, versionId, payload(true), createIdempotencyKey())
        .then((result) => {
          if (!cancelled) setDryRun({ status: "ready", dates: result.dates });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setDryRun({
            status: "error",
            message:
              err instanceof ApiClientError ? err.message : "Couldn't check this schedule.",
          });
        });
    }, 350);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
    // payload is derived from `signature`; re-run only when the request changes.
  }, [signature, formError, ended, online, planId, versionId, dryRunEpoch]);

  const replaceFrom = useMemo(() => {
    const dates = effectiveDates;
    if (dates.length === 0) return null;
    return { from: dates[0]!, to: dates[dates.length - 1]! };
  }, [effectiveDates]);
  const replaceSignature = replaceFrom ? `${replaceFrom.from}:${replaceFrom.to}` : "";

  useEffect(() => {
    if (!activePlan || !replaceFrom) {
      setReplacement(null);
      return;
    }
    let cancelled = false;
    const workoutsChange = !workoutSchedulesMatch(
      activePlan.content.workoutDays,
      content.workoutDays,
    );
    void Promise.all([
      workoutsChange
        ? stage1Api.listWorkoutAssignments(relationshipId, {
            fromDate: replaceFrom.from,
            toDate: replaceFrom.to,
          })
        : Promise.resolve(null),
      stage1Api.listMealAssignments(relationshipId, {
        fromDate: replaceFrom.from,
        toDate: replaceFrom.to,
      }),
    ])
      .then(([workouts, meals]) => {
        if (cancelled) return;
        setReplacement({
          workouts: (workouts?.items ?? []).filter(
            (item) => item.execution == null && item.scheduleStatus === "scheduled",
          ).length,
          meals: meals.items.filter(
            (item) => item.compliance == null && item.scheduleStatus === "scheduled",
          ).length,
        });
      })
      .catch(() => {
        if (!cancelled) setReplacement(null);
      });
    return () => {
      cancelled = true;
    };
    // content identity changes only on edit; re-evaluate when range changes.
  }, [relationshipId, replaceSignature, activePlan, nutritionOnly]);

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
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !acting) onClose();
    }
    globalThis.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [acting, onClose]);

  async function publish() {
    if (blocked || acting) return;
    setActing(true);
    setFailure(null);
    if (!keyRef.current || keyRef.current.signature !== signature) {
      keyRef.current = { signature, key: createIdempotencyKey() };
    }
    try {
      const result = await stage1Api.assignPlanVersion(
        planId,
        versionId,
        payload(false),
        keyRef.current.key,
      );
      onAssigned(result);
    } catch {
      setFailure("Couldn't create this week's schedule");
    } finally {
      setActing(false);
    }
  }

  const grid = useMemo(() => {
    const dates = datesInWindow;
    const sessions = workoutSessionsOnDates(content.workoutDays, dates);
    const meals = mealsOnDates(content.mealPrescriptions, dates);
    return dates.map((date) => ({
      date,
      workout: sessions.find((entry) => entry.localDate === date)?.day.name ?? null,
      meals: meals.filter((entry) => entry.localDate === date).length,
    }));
  }, [datesInWindow, content]);

  const showWorkouts = !nutritionOnly;
  const replaceDate = effectiveFrom || today;
  const diff =
    trainerTimezone && trainerTimezone !== traineeTimezone
      ? formatTimeDiff(trainerTimezone, traineeTimezone)
      : null;

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
        <header className="assign-head">
          <h2 id="assign-title">When does this plan start?</h2>
          <p className="muted assign-tz">
            Dates use {first}&apos;s time · {cityOf(traineeTimezone)}
            {diff ? ` · ${diff}` : ""}
            {trainerTimezone ? (
              <>
                {" "}
                <TimezoneBadge
                  traineeName={traineeName}
                  traineeTimezone={traineeTimezone}
                  trainerTimezone={trainerTimezone}
                />
              </>
            ) : null}
          </p>
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
          <fieldset className="assign-validity" disabled={acting}>
            <label className="field">
              <span>Effective from</span>
              <input
                type="date"
                min={today}
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </label>
            {effectiveFromError ? (
              <p className="field-error" role="alert">
                {effectiveFromError}
              </p>
            ) : null}
            <div className="radio-cards" role="radiogroup" aria-label="Validity">
              <label className={validity === "ongoing" ? "radio-card is-selected" : "radio-card"}>
                <input
                  type="radio"
                  name="validity"
                  checked={validity === "ongoing"}
                  onChange={() => setValidity("ongoing")}
                />
                <span className="radio-card-copy">
                  <span className="radio-card-title">Ongoing</span>
                  <span className="radio-card-detail">Stays in place until you replace it.</span>
                </span>
              </label>
              <label className={validity === "until" ? "radio-card is-selected" : "radio-card"}>
                <input
                  type="radio"
                  name="validity"
                  checked={validity === "until"}
                  onChange={() => setValidity("until")}
                />
                <span className="radio-card-copy">
                  <span className="radio-card-title">End on a date</span>
                  <span className="radio-card-detail">
                    {effectiveTo ? formatCivilDate(effectiveTo) : "Choose the last day"}
                  </span>
                </span>
              </label>
            </div>
            {validity === "until" ? (
              <label className="field">
                <span>End date</span>
                <input
                  type="date"
                  min={effectiveFrom || today}
                  value={effectiveTo}
                  onChange={(event) => setEffectiveTo(event.target.value)}
                />
              </label>
            ) : null}
            {effectiveToError ? (
              <p className="field-error" role="alert">
                {effectiveToError}
              </p>
            ) : null}
            <p className="muted">Validity is separate from the first schedule window.</p>
          </fieldset>

          <DateWindowPicker today={today} value={window} onChange={setWindow} disabled={acting} />

          <section aria-label="Schedule preview" className="assign-preview-block">
            <h3>Preview</h3>
            {dryRun.status === "loading" && !formError ? (
              <p className="muted" aria-busy="true">
                Checking the schedule…
              </p>
            ) : null}
            {dryRun.status === "error" ? (
              <p className="field-error" role="alert">
                {dryRun.message}{" "}
                <button
                  type="button"
                  className="button-link"
                  onClick={() => setDryRunEpoch((value) => value + 1)}
                >
                  Retry
                </button>
              </p>
            ) : null}
            {grid.length === 0 ? (
              <p className="muted">No dates fall inside this window.</p>
            ) : (
              <div className="assign-grid" role="table" aria-label="Scheduled dates">
                {grid.map((row) => (
                  <div className="assign-grid-row" role="row" key={row.date}>
                    <span role="cell" className="assign-grid-date">
                      {formatCivilDate(row.date)}
                    </span>
                    <span role="cell" className={row.workout ? "assign-chip" : "assign-chip is-rest"}>
                      {showWorkouts ? (row.workout ?? "Rest") : "Workouts unchanged"}
                    </span>
                    <span role="cell" className="assign-chip is-meals">
                      {row.meals > 0 ? plural(row.meals, "meal") : "No meals"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {activePlan ? (
            <p className="assign-replace" role="status" data-testid="assign-replace">
              From {formatCivilDate(replaceDate)}, this replaces <em>{activePlan.title} v{activePlan.versionNumber}</em>.{" "}
              {replacement
                ? `${plural(replacement.workouts, "upcoming workout")} and ${plural(
                    replacement.meals,
                    "meal",
                  )} that haven't started will be replaced. `
                : ""}
              Anything already logged stays as it is.
            </p>
          ) : null}

          {nutritionOnly ? (
            <DietScopePicker value={dietScope} onChange={setDietScope} preview={todayMeals} />
          ) : null}

          <label className="switch-row assign-notify">
            <input
              type="checkbox"
              role="switch"
              checked={notifyClient}
              onChange={(event) => setNotifyClient(event.target.checked)}
            />
            <span>Notify {first}</span>
          </label>
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
            disabled={blocked || acting || dryRun.status === "loading"}
            onClick={() => void publish()}
          >
            {acting ? "Publishing…" : "Publish & schedule"}
          </button>
        </footer>
      </div>
    </div>
  );
}
