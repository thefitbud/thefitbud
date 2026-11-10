import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  Check,
  ClipboardList,
  ClipboardPlus,
  Dumbbell,
  Pencil,
  Target,
  Utensils,
} from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  planVersionStatusSchema,
  type DietAdjustmentScope,
  type PlanContent,
  type PlanTemplateSummary,
  type PlanVersionStatus,
  type PlanVersionSummary,
  type PlanWithVersions,
} from "@fitbud/contracts";
import {
  consistencyFingerprint,
  dayMacrosFromScaledItems,
  formatCivilDate,
  formatHhMmTime,
  formatKcal,
  formatLocalDate,
  formatNumber,
  formatRelative,
  labelFor,
  planConsistencyWarnings,
  possessivePronoun,
} from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { WEEK_ORDER, weekdayShort } from "../components/builder/weekdays";
import { publishIssues } from "../components/builder/validation";
import { OverflowMenu } from "../components/OverflowMenu";
import { PlanConsistencyNotice } from "../components/PlanConsistencyNotice";
import { AssignPlanModal } from "../components/plan/AssignPlanModal";
import { createBlankPlanContent, sortedMealsByTime } from "../components/plan-composition";
import { ErrorState, LoadingBlock } from "../components/StatePanels";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { resolveTraineeTimezone } from "../lib/trainee-timezone";
import type { WorkspaceOutletContext } from "./workspaceContext";
import "../styles/plan.css";

type DraftRef = { planId: string; versionId: string; versionNumber: number; updatedAt: string; title: string };

type NextVersion = {
  planTitle: string;
  versionNumber: number;
  effectiveFrom: string;
  samePlan: boolean;
};

type AssignTarget = {
  planId: string;
  versionId: string;
  content: PlanContent;
};

function mealSlotKey(meal: { mealType?: string | null; name: string }): string {
  return meal.mealType ?? meal.name.toLowerCase().replace(/\s+/g, "_");
}

function overrideAppliesToPattern(pattern: string): string {
  if (pattern === "weekdays") return " (weekdays)";
  if (pattern === "weekends") return " (weekends)";
  return "";
}

const DAY_MS = 86_400_000;

/** Civil "YYYY-MM-DD" → whole days since epoch, for week arithmetic. */
function civilDayNumber(localDate: string): number | null {
  const parsed = Date.parse(`${localDate}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / DAY_MS);
}

function localDay(iso: string | null | undefined, timezone: string): string | null {
  return iso ? formatLocalDate(new Date(iso), timezone) : null;
}

function dayLabel(iso: string | null | undefined, timezone: string): string | null {
  const local = localDay(iso, timezone);
  return local ? formatCivilDate(local) : null;
}

/** "Week 6 of 8" from the version's own effective dates, in the client's time. */
function programWeekLabel(
  effectiveFrom: string | null,
  effectiveTo: string | null,
  timezone: string,
  now: Date,
): string | null {
  const from = civilDayNumber(localDay(effectiveFrom, timezone) ?? "");
  const today = civilDayNumber(formatLocalDate(now, timezone));
  if (from == null || today == null || today < from) return null;
  const week = Math.floor((today - from) / 7) + 1;
  const to = civilDayNumber(localDay(effectiveTo, timezone) ?? "");
  if (to == null || to <= from) return `Week ${week}`;
  const total = Math.max(1, Math.ceil((to - from) / 7));
  return week > total ? null : `Week ${week} of ${total}`;
}

type DayNutrition = { meals: number; kcal: number; unknown: boolean };

function nutritionForDay(content: PlanContent, weekday: number): DayNutrition {
  const meals = content.mealPrescriptions.filter((meal) =>
    (meal.applicableWeekdays ?? []).includes(weekday),
  );
  const totals = dayMacrosFromScaledItems(
    meals.flatMap((meal) => (meal.items ?? []).map((item) => item.calculated)),
  );
  return { meals: meals.length, kcal: totals.kcal, unknown: totals.unknown };
}

function rangeText(values: number[], format: (n: number) => string): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? format(max) : `${formatNumber(min)}–${format(max)}`;
}

function nutritionHeadline(days: DayNutrition[]): string {
  const withMeals = days.filter((day) => day.meals > 0);
  if (withMeals.length === 0) return "No meals in this plan";
  const meals = rangeText(
    withMeals.map((day) => day.meals),
    (n) => `${formatNumber(n)} ${n === 1 ? "meal" : "meals"} a day`,
  );
  const withKcal = withMeals.filter((day) => day.kcal > 0 || day.unknown);
  if (withKcal.length === 0) return meals;
  const unknown = withKcal.some((day) => day.unknown);
  const kcal = rangeText(
    withKcal.map((day) => day.kcal),
    (n) => formatKcal(n),
  );
  return `${unknown ? "≥ " : ""}${kcal} · ${meals}`;
}

function sessionsHeadline(content: PlanContent): string {
  const count = content.workoutDays.length;
  if (count === 0) return "No workouts in this plan";
  return `${count} ${count === 1 ? "session" : "sessions"} a week`;
}

/**
 * Frame 150: workout row and nutrition row share one 7-day grid. Each day is
 * one list item holding its workout cell and its nutrition cell, so the list
 * reads Mon…Sun in order for assistive tech while CSS places the cells in rows.
 */
function ProgramParts({
  content,
  provenance,
  todayWeekday,
  builderPath,
}: {
  content: PlanContent;
  provenance: string;
  todayWeekday: number | null;
  builderPath: string;
}) {
  const days = WEEK_ORDER.map((weekday) => ({
    weekday,
    session: content.workoutDays.find((day) => day.weekday === weekday) ?? null,
    nutrition: nutritionForDay(content, weekday),
  }));
  return (
    <div className="pp-parts">
      <div className="pp-part-label pp-part-workout">
        <span className="pp-part-icon" aria-hidden="true">
          <Dumbbell size={18} strokeWidth={2} />
        </span>
        <div className="pp-part-copy">
          <p className="pp-part-kicker">Workout</p>
          <h3 className="pp-part-title">{sessionsHeadline(content)}</h3>
          <p className="pp-part-meta">{provenance}</p>
        </div>
      </div>
      <Link className="button-secondary pp-open pp-open-workout" to={`${builderPath}?tab=workout`}>
        Open builder
        <span className="sr-only"> for workouts</span>
      </Link>
      <div className="pp-divider" aria-hidden="true" />
      <div className="pp-part-label pp-part-nutrition">
        <span className="pp-part-icon" aria-hidden="true">
          <Utensils size={18} strokeWidth={2} />
        </span>
        <div className="pp-part-copy">
          <p className="pp-part-kicker">Nutrition</p>
          <h3 className="pp-part-title">{nutritionHeadline(days.map((day) => day.nutrition))}</h3>
          <p className="pp-part-meta">{provenance}</p>
        </div>
      </div>
      <Link className="button-secondary pp-open pp-open-nutrition" to={`${builderPath}?tab=nutrition`}>
        Open builder
        <span className="sr-only"> for nutrition</span>
      </Link>
      <ol className="week-strip pp-days" aria-label="Plan week" data-testid="week-strip">
        {days.map(({ weekday, session, nutrition }, index) => {
          const today = weekday === todayWeekday;
          const dayClass = (base: string, rest: boolean) =>
            [base, rest ? "is-rest" : "", today ? "is-today" : ""].filter(Boolean).join(" ");
          return (
            <li
              key={weekday}
              className="week-strip-day pp-day"
              style={{ "--pp-col": index + 1 } as CSSProperties}
              aria-current={today ? "date" : undefined}
            >
              <span className={dayClass("pp-cell pp-cell-workout", !session)}>
                <span className="week-strip-name">
                  {weekdayShort(weekday)}
                  {today ? <span className="sr-only"> (today)</span> : null}
                </span>
                <span className={session ? "week-strip-session" : "week-strip-session is-rest"}>
                  {session ? session.name : "Rest"}
                </span>
              </span>
              <span className={dayClass("pp-cell pp-cell-nutrition", nutrition.meals === 0)}>
                <span className="week-strip-name" aria-hidden="true">
                  {weekdayShort(weekday)}
                </span>
                <span className="pp-cell-value">
                  {nutrition.meals === 0
                    ? "No meals"
                    : `${nutrition.meals} ${nutrition.meals === 1 ? "meal" : "meals"}`}
                </span>
                {nutrition.meals > 0 && (nutrition.kcal > 0 || nutrition.unknown) ? (
                  <span className="pp-cell-kcal">{formatKcal(nutrition.kcal, nutrition.unknown)}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MealTimesPanel({
  content,
  overrides,
  traineeFirstName,
  timezone,
}: {
  content: PlanContent;
  overrides: Array<{ slotKey: string; dayPattern: string; time: string; updatedAt?: string }>;
  traineeFirstName: string;
  timezone: string;
}) {
  const meals = sortedMealsByTime(content.mealPrescriptions);
  if (meals.length === 0) return null;
  return (
    <section className="plan-card meal-times" aria-labelledby="meal-times-heading">
      <h2 id="meal-times-heading">Meal times</h2>
      <ul className="meal-times-list">
        {meals.map((meal) => {
          const planTime = meal.localTime ? formatHhMmTime(meal.localTime) : "no time set";
          const slot = mealSlotKey(meal);
          const changed = overrides.filter((row) => row.slotKey === slot && row.time !== meal.localTime);
          return (
            <li key={meal.id}>
              <strong>{meal.name}</strong> · plan {planTime}
              {changed.map((row) => (
                <span key={`${row.slotKey}-${row.dayPattern}`} className="meal-time-override">
                  {" "}
                  · {traineeFirstName}: {formatHhMmTime(row.time)}
                  {overrideAppliesToPattern(row.dayPattern)}
                  {row.updatedAt
                    ? ` (changed ${new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: timezone }).format(
                        new Date(row.updatedAt),
                      )})`
                    : ""}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TemplatePicker({
  title,
  confirmLabel,
  busy,
  onPick,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  busy: boolean;
  onPick: (templateId: string) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<PlanTemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");

  const load = useCallback(() => {
    setError(null);
    setTemplates(null);
    apiClient
      .listPlanTemplates({ limit: 50 })
      .then((page) => {
        setTemplates(page.items);
        setSelected((current) => current || page.items[0]?.id || "");
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiClientError ? err.message : "Couldn't load templates."),
      );
  }, []);

  useEffect(() => load(), [load]);

  return (
    <div className="modal-scrim" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={title} data-testid="template-picker">
        <h2>{title}</h2>
        {error ? (
          <ErrorState message={error} onRetry={load} screenId="TW-12" />
        ) : !templates ? (
          <LoadingBlock label="Loading templates…" />
        ) : templates.length === 0 ? (
          <p className="muted">
            No templates yet. <Link to="/templates">Create one in Templates</Link>.
          </p>
        ) : (
          <div className="radio-cards" role="radiogroup" aria-label="Template">
            {templates.map((template) => (
              <label
                key={template.id}
                className={selected === template.id ? "radio-card is-selected" : "radio-card"}
              >
                <input
                  type="radio"
                  name="template"
                  checked={selected === template.id}
                  onChange={() => setSelected(template.id)}
                />
                <span className="radio-card-copy">
                  <span className="radio-card-title">{template.title}</span>
                  <span className="radio-card-detail">
                    {labelFor("plan_template_type", template.templateType)}
                    {template.ownership === "global" ? " · FitBud template" : " · Yours"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="assign-actions">
          <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={busy || !selected}
            onClick={() => onPick(selected)}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function versionEffectiveText(
  version: PlanVersionSummary,
  timezone: string,
): string {
  const from = dayLabel(version.effectiveFrom, timezone);
  const to = dayLabel(version.effectiveTo, timezone);
  if (!from) return "—";
  if (version.status === "scheduled") return to ? `From ${from} — ${to}` : `From ${from}`;
  if (to) return `${from} — ${to}`;
  return version.status === "superseded" ? `From ${from}` : `${from} — ongoing`;
}

function VersionsTable({
  relationshipId,
  refreshEpoch,
  timezone,
}: {
  relationshipId: string;
  refreshEpoch: number;
  timezone: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"" | PlanVersionStatus>("");
  const [rows, setRows] = useState<PlanWithVersions[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (next?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.listPlans(relationshipId, {
          cursor: next ?? undefined,
          limit: 20,
          versionStatus: status || undefined,
        });
        setRows((current) => (next ? [...current, ...result.items] : result.items));
        setCursor(result.nextCursor);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Couldn't load plan versions.");
      } finally {
        setLoading(false);
      }
    },
    [relationshipId, status],
  );

  useEffect(() => {
    if (open) void load();
  }, [open, load, refreshEpoch]);

  const versions = rows.flatMap((row) =>
    row.versions
      .filter((version) => !status || version.status === status)
      .map((version) => ({ plan: row.plan, version })),
  );

  return (
    <section className="plan-card plan-versions pp-versions" aria-labelledby="plan-versions-heading">
      <div className="pp-versions-head">
        <button
          type="button"
          className="plan-versions-toggle"
          aria-expanded={open}
          aria-controls="plan-versions-body"
          onClick={() => setOpen((value) => !value)}
        >
          <h2 id="plan-versions-heading">Versions</h2>
          <span>{open ? "Hide" : "Show"}</span>
        </button>
        {open ? (
          <div className="pp-versions-tools">
            <label className="pp-status-filter">
              <span className="sr-only">Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as "" | PlanVersionStatus)}
              >
                <option value="">Status: any</option>
                {planVersionStatusSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {labelFor("plan_version_status", option)}
                  </option>
                ))}
              </select>
            </label>
            {versions.length > 0 ? (
              <span className="pp-versions-count" data-testid="versions-count">
                {cursor
                  ? `${formatNumber(versions.length)} shown`
                  : `${formatNumber(versions.length)} of ${formatNumber(versions.length)}`}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {open ? (
        <div id="plan-versions-body" className="pp-versions-body">
          {error ? <ErrorState message={error} onRetry={() => void load()} screenId="TW-12" /> : null}
          {loading && rows.length === 0 ? <LoadingBlock label="Loading versions…" /> : null}
          {!loading && !error && versions.length === 0 ? (
            <p className="muted pp-versions-empty" role="status">
              {status ? "No plan versions with this status." : "No plan versions yet."}
            </p>
          ) : null}
          {versions.length > 0 ? (
            <div className="table-scroll">
              <table className="versions-table">
                <thead>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col">Version</th>
                    <th scope="col">Status</th>
                    <th scope="col">Effective</th>
                    <th scope="col">Published</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map(({ plan, version }) => (
                    <tr key={version.id}>
                      <th scope="row" className="pp-version-plan">
                        {plan.title}
                      </th>
                      <td className="tabular">v{version.versionNumber}</td>
                      <td>
                        <span className={`status-pill status-${version.status}`}>
                          {labelFor("plan_version_status", version.status)}
                        </span>
                      </td>
                      <td>{versionEffectiveText(version, timezone)}</td>
                      <td>
                        {version.publishedAt ? `You · ${dayLabel(version.publishedAt, timezone)}` : "—"}
                      </td>
                      <td className="pp-version-action">
                        <Link
                          className="pp-view-link"
                          to={`/clients/${relationshipId}/plan/${plan.id}/versions/${version.id}/edit`}
                        >
                          {version.status === "draft" ? "Edit draft" : "View"}
                          <span className="sr-only">
                            {" "}
                            {plan.title} v{version.versionNumber}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {cursor ? (
            <button
              type="button"
              className="button-secondary pp-load-more"
              disabled={loading}
              onClick={() => void load(cursor)}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ClientPlanPage() {
  const { relationshipId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const {
    workspace,
    workspaceLoading,
    workspaceError,
    refreshEpoch = 0,
    reloadWorkspace,
    online = true,
    ended = false,
  } = useOutletContext<WorkspaceOutletContext>();

  const [draft, setDraft] = useState<DraftRef | null>(null);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const [dietScope, setDietScope] = useState<DietAdjustmentScope | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [picker, setPicker] = useState<null | "replace" | "start">(null);
  const [assign, setAssign] = useState<AssignTarget | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [nextVersion, setNextVersion] = useState<NextVersion | null>(null);

  const effective = workspace?.plan ?? null;
  const effectiveVersion = effective?.version ?? null;
  const effectivePlan = effective?.plan ?? null;
  const configuration = workspace?.configuration.configuration ?? null;
  const header = workspace?.header ?? null;
  const timezone = header ? resolveTraineeTimezone(header).timezone : "UTC";
  const traineeName = header?.traineeDisplayName ?? "";
  const firstName = traineeName.split(" ")[0] ?? traineeName;
  const pronoun = possessivePronoun(header?.traineeProfile?.gender);
  const canEdit = online && !ended && !acting;
  const planPath = `/clients/${relationshipId}/plan`;

  useEffect(() => {
    if (!relationshipId) return;
    let cancelled = false;
    apiClient
      .listPlans(relationshipId, { limit: 20, versionStatus: "draft" })
      .then((result) => {
        if (cancelled) return;
        const found = result.items
          .flatMap((row) =>
            row.versions
              .filter((version) => version.status === "draft")
              .map((version) => ({
                planId: row.plan.id,
                versionId: version.id,
                versionNumber: version.versionNumber,
                updatedAt: version.updatedAt,
                title: row.plan.title,
              })),
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        setDraft(found ?? null);
      })
      .catch(() => {
        if (!cancelled) setDraft(null);
      });
    return () => {
      cancelled = true;
    };
  }, [relationshipId, refreshEpoch, draftEpoch]);

  // "Next: … from …" chip: the earliest scheduled version for this client.
  const effectivePlanId = workspace?.plan?.plan?.id ?? null;
  useEffect(() => {
    if (!relationshipId || !effectivePlanId) {
      setNextVersion(null);
      return;
    }
    let cancelled = false;
    apiClient
      .listPlans(relationshipId, { limit: 20, versionStatus: "scheduled" })
      .then((result) => {
        if (cancelled) return;
        const found = result.items
          .flatMap((row) =>
            row.versions
              .filter((version) => version.status === "scheduled" && version.effectiveFrom)
              .map((version) => ({
                planTitle: row.plan.title,
                versionNumber: version.versionNumber,
                effectiveFrom: version.effectiveFrom as string,
                samePlan: row.plan.id === effectivePlanId,
              })),
          )
          .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
        setNextVersion(found ?? null);
      })
      .catch(() => {
        // The chip is optional context; without it the card still reads correctly.
        if (!cancelled) setNextVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, [relationshipId, effectivePlanId, refreshEpoch, draftEpoch]);

  useEffect(() => {
    if (searchParams.get("assign") !== "1" || assign || !draft) return;
    let cancelled = false;
    apiClient
      .getPlanVersion(draft.planId, draft.versionId)
      .then((version) => {
        if (!cancelled) {
          setAssign({ planId: draft.planId, versionId: draft.versionId, content: version.content });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [searchParams, draft, assign]);

  const warnings = useMemo(() => {
    if (!effectiveVersion || !configuration) return [];
    return planConsistencyWarnings({
      sessionsPerWeek: configuration.workout.sessionsPerWeek,
      mealsPerDay: configuration.nutrition.mealsPerDay,
      workoutDays: effectiveVersion.content.workoutDays,
      mealPrescriptions: effectiveVersion.content.mealPrescriptions,
    });
  }, [effectiveVersion, configuration]);
  const fingerprint = consistencyFingerprint(warnings);

  useEffect(() => {
    if (!effectivePlan || !effectiveVersion) return;
    let cancelled = false;
    apiClient
      .getPlanConsistency(effectivePlan.id, effectiveVersion.id)
      .then((result) => {
        if (cancelled) return;
        setAcknowledged(result.acknowledged ? result.fingerprint : null);
        setDietScope(result.dietAdjustmentScope ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setAcknowledged(null);
        setDietScope(null);
      });
    return () => {
      cancelled = true;
    };
  }, [effectivePlan, effectiveVersion, refreshEpoch, draftEpoch]);

  function fail(err: unknown, fallback: string) {
    setError(err instanceof ApiClientError ? err.message : fallback);
  }

  async function adjustPlan() {
    if (draft) {
      navigate(`${planPath}/${draft.planId}/versions/${draft.versionId}/edit`);
      return;
    }
    if (!effectivePlan || !effectiveVersion) return;
    setActing(true);
    setError(null);
    try {
      const created = await apiClient.createPlanDraftFromVersion(
        effectivePlan.id,
        { sourceVersionId: effectiveVersion.id, asAdjustment: true },
        createIdempotencyKey(),
      );
      navigate(`${planPath}/${effectivePlan.id}/versions/${created.id}/edit`);
    } catch (err) {
      fail(err, "Couldn't start an adjustment.");
    } finally {
      setActing(false);
    }
  }

  async function startBlank() {
    setActing(true);
    setError(null);
    try {
      const created = await apiClient.createPlan(
        relationshipId,
        { title: "Training block", content: createBlankPlanContent() },
        createIdempotencyKey(),
      );
      navigate(`${planPath}/${created.plan.id}/versions/${created.version.id}/edit`);
    } catch (err) {
      fail(err, "Couldn't create a blank plan.");
    } finally {
      setActing(false);
    }
  }

  async function pickTemplate(templateId: string) {
    const mode = picker;
    setActing(true);
    setError(null);
    try {
      const result = await apiClient.applyPlanTemplate(
        relationshipId,
        { templateId },
        createIdempotencyKey(),
      );
      setPicker(null);
      setDraftEpoch((value) => value + 1);
      if (mode === "replace") {
        setAssign({
          planId: result.plan.id,
          versionId: result.version.id,
          content: result.version.content,
        });
      } else {
        navigate(`${planPath}/${result.plan.id}/versions/${result.version.id}/edit`);
      }
    } catch (err) {
      fail(err, "Couldn't use that template.");
    } finally {
      setActing(false);
    }
  }

  async function discardDraft() {
    if (!draft) return;
    setActing(true);
    setError(null);
    setDiscardConfirm(false);
    try {
      await apiClient.discardPlanDraft(draft.planId, draft.versionId);
      setDraft(null);
      setDraftEpoch((value) => value + 1);
      setMessage(`Draft v${draft.versionNumber} discarded.`);
    } catch (err) {
      fail(err, "Couldn't discard the draft.");
    } finally {
      setActing(false);
    }
  }

  async function duplicateAsTemplate() {
    if (!effectivePlan || !effectiveVersion) return;
    setActing(true);
    setError(null);
    try {
      const hasWorkouts = effectiveVersion.content.workoutDays.length > 0;
      const hasMeals = effectiveVersion.content.mealPrescriptions.length > 0;
      const created = await apiClient.createPlanTemplateFromVersion(
        {
          planId: effectivePlan.id,
          versionId: effectiveVersion.id,
          title: `${effectivePlan.title} (copy)`,
          templateType: hasWorkouts && hasMeals ? "combined" : hasMeals ? "nutrition" : "workout",
        },
        createIdempotencyKey(),
      );
      setMessage(`Saved “${created.title}” as a template.`);
    } catch (err) {
      fail(err, "Couldn't save this plan as a template.");
    } finally {
      setActing(false);
    }
  }

  async function acknowledge() {
    if (!effectivePlan || !effectiveVersion) return;
    setActing(true);
    setError(null);
    try {
      const result = await apiClient.acknowledgePlanConsistency(
        effectivePlan.id,
        effectiveVersion.id,
        { fingerprint },
      );
      setAcknowledged(result.fingerprint);
      setMessage("The difference is acknowledged. Assignments are unchanged.");
    } catch (err) {
      fail(err, "Couldn't acknowledge the difference.");
    } finally {
      setActing(false);
    }
  }

  function closeAssign() {
    setAssign(null);
    if (searchParams.get("assign")) {
      const next = new URLSearchParams(searchParams);
      next.delete("assign");
      setSearchParams(next, { replace: true });
    }
  }

  const effectiveFromLabel = dayLabel(effectiveVersion?.effectiveFrom, timezone);
  const effectiveToLabel = dayLabel(effectiveVersion?.effectiveTo, timezone);
  const now = new Date();
  const weekLabel = effectiveVersion
    ? programWeekLabel(effectiveVersion.effectiveFrom, effectiveVersion.effectiveTo, timezone, now)
    : null;
  const todayNumber = civilDayNumber(formatLocalDate(now, timezone));
  // 1970-01-01 was a Thursday (weekday 4; 0 = Sunday).
  const todayWeekday = todayNumber == null ? null : (((todayNumber + 4) % 7) + 7) % 7;
  const builderPath =
    draft && !ended
      ? `${planPath}/${draft.planId}/versions/${draft.versionId}/edit`
      : effectivePlan && effectiveVersion
        ? `${planPath}/${effectivePlan.id}/versions/${effectiveVersion.id}/edit`
        : planPath;
  const provenance = effectiveVersion
    ? [
        effectivePlan?.title,
        `v${effectiveVersion.versionNumber}`,
        effectiveFromLabel ? `since ${effectiveFromLabel}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const nextFrom = nextVersion ? dayLabel(nextVersion.effectiveFrom, timezone) : null;
  const nextLabel =
    nextVersion && nextFrom
      ? `Next: ${nextVersion.samePlan ? `v${nextVersion.versionNumber}` : nextVersion.planTitle} from ${nextFrom}`
      : null;

  let body;
  if (workspaceLoading && !workspace) {
    body = <LoadingBlock label="Loading plan…" />;
  } else if (workspaceError && !workspace) {
    body = <ErrorState message={workspaceError} onRetry={reloadWorkspace} screenId="TW-12" />;
  } else if (!effectivePlan || !effectiveVersion) {
    body = (
      <section
        className="plan-card pp-empty"
        aria-labelledby="plan-empty-heading"
        data-testid="empty-state"
      >
        <span className="pp-empty-icon" aria-hidden="true">
          <ClipboardPlus size={26} strokeWidth={1.75} />
        </span>
        <h2 id="plan-empty-heading">No plan yet</h2>
        {ended ? (
          <p className="pp-empty-copy">Coaching has ended, and there was no plan.</p>
        ) : (
          <>
            <p className="pp-empty-copy">
              Start from a template or build from scratch. {firstName || "Your client"} sees nothing
              in the app until you publish. Finish Coaching setup first so {pronoun} expectations are
              set.
            </p>
            <div className="plan-empty-actions">
              <button
                type="button"
                className="button-primary"
                disabled={!canEdit}
                onClick={() => setPicker("start")}
              >
                Start from a template
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={!canEdit}
                onClick={() => void startBlank()}
              >
                Build from scratch
              </button>
            </div>
          </>
        )}
      </section>
    );
  } else {
    body = (
      <section className="plan-card pp-card current-plan" aria-labelledby="current-plan-heading">
        <header className="pp-head">
          <div className="pp-head-copy">
            <p className="plan-kicker">
              {firstName ? `${firstName}'s current program` : "Current program"}
            </p>
            <div className="pp-title-row">
              <h2 id="current-plan-heading">{effectivePlan.title}</h2>
              <span className={`pp-status pp-status-${effectiveVersion.status}`}>
                <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                {labelFor("plan_version_status", effectiveVersion.status)}
              </span>
            </div>
            <p className="pp-sub">
              {weekLabel ? `${weekLabel} · ` : null}
              <span data-testid="plan-effective-line">
                Effective since {effectiveFromLabel ?? "—"} · v{effectiveVersion.versionNumber} ·{" "}
                {effectiveToLabel ? `ends ${effectiveToLabel}` : "ongoing"}
              </span>
              {firstName && !ended ? ` · what ${firstName} sees in ${pronoun} app today` : null}
            </p>
            {dietScope === "today_only" ? (
              <p className="pp-sub" data-testid="today-only-note">
                Tomorrow&apos;s meals follow the previous version.
              </p>
            ) : null}
          </div>
          {nextLabel ? (
            <span className="pp-next" data-testid="plan-next-version">
              <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
              {nextLabel}
            </span>
          ) : null}
        </header>
        <ProgramParts
          content={effectiveVersion.content}
          provenance={provenance}
          todayWeekday={todayWeekday}
          builderPath={builderPath}
        />
      </section>
    );
  }

  return (
    <div className="plan-page" data-testid="screen-TW-12">
      {!online ? (
        <p className="builder-banner is-offline" role="status">
          You&apos;re offline. You can read the plan, but changes are paused.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      <div className="pp-toolbar">
        <nav className="pp-segment" aria-label="Plan sections">
          <Link className="pp-segment-item is-on" to={planPath} aria-current="page">
            <ClipboardList size={16} strokeWidth={2} aria-hidden="true" />
            Plans
          </Link>
          <Link className="pp-segment-item" to={`/clients/${relationshipId}/configure`}>
            <Target size={16} strokeWidth={2} aria-hidden="true" />
            Coaching setup
          </Link>
        </nav>
        {effectivePlan && effectiveVersion ? (
          !ended ? (
            <div className="current-plan-actions">
              <button
                type="button"
                className="button-secondary"
                disabled={!canEdit}
                onClick={() => setPicker("replace")}
              >
                Replace from template
              </button>
              <button
                type="button"
                className="button-primary pp-adjust"
                disabled={!canEdit}
                onClick={() => void adjustPlan()}
              >
                <Pencil size={16} strokeWidth={2} aria-hidden="true" />
                Adjust plan
              </button>
              <OverflowMenu
                label="More plan actions"
                items={[
                  {
                    id: "duplicate",
                    label: "Duplicate as template",
                    disabled: !canEdit,
                    onSelect: () => void duplicateAsTemplate(),
                  },
                ]}
              />
            </div>
          ) : (
            <p className="muted pp-readonly">Coaching has ended. This plan is read-only.</p>
          )
        ) : null}
      </div>

      {draft && !ended ? (
        <section className="draft-banner" aria-label="Draft in progress" data-testid="draft-banner">
          <p>
            <strong>Draft v{draft.versionNumber}</strong> · edited {formatRelative(draft.updatedAt)}
          </p>
          <div className="draft-banner-actions">
            <Link
              className="button-secondary"
              to={`${planPath}/${draft.planId}/versions/${draft.versionId}/edit`}
            >
              Continue editing
            </Link>
            <button
              type="button"
              className="button-ghost"
              disabled={!canEdit}
              onClick={() => setDiscardConfirm(true)}
            >
              Discard
            </button>
          </div>
        </section>
      ) : null}

      {effectiveVersion && configuration ? (
        <PlanConsistencyNotice
          warnings={warnings}
          acknowledged={acknowledged === fingerprint}
          acting={!canEdit}
          onAcknowledge={ended ? undefined : () => void acknowledge()}
          onAdjustPlan={() => void adjustPlan()}
          planTo={planPath}
          configureTo={`/clients/${relationshipId}/configure`}
          showPlanLink={!ended}
          showConfigureLink={!ended}
        />
      ) : null}

      {body}

      {effectivePlan ? (
        <VersionsTable
          relationshipId={relationshipId}
          refreshEpoch={refreshEpoch}
          timezone={timezone}
        />
      ) : null}

      {effectiveVersion ? (
        <MealTimesPanel
          content={effectiveVersion.content}
          overrides={header?.mealTimeOverrides ?? []}
          traineeFirstName={firstName}
          timezone={timezone}
        />
      ) : null}

      {discardConfirm && draft ? (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={() => setDiscardConfirm(false)}
        >
          <dialog
            className="modal-card"
            open
            aria-labelledby="discard-draft-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="discard-draft-title">Discard draft v{draft.versionNumber}?</h2>
            <p className="muted">This cannot be undone.</p>
            <div className="button-row">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setDiscardConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={acting}
                onClick={() => void discardDraft()}
              >
                Discard draft
              </button>
            </div>
          </dialog>
        </div>
      ) : null}

      {picker ? (
        <TemplatePicker
          title={picker === "replace" ? "Replace from template" : "Start from a template"}
          confirmLabel={picker === "replace" ? "Continue" : "Use this template"}
          busy={acting}
          onPick={(id) => void pickTemplate(id)}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {assign && header ? (
        <AssignPlanModal
          relationshipId={relationshipId}
          planId={assign.planId}
          versionId={assign.versionId}
          content={assign.content}
          traineeName={header.traineeDisplayName}
          traineeTimezone={timezone}
          trainerTimezone={me?.timezone ?? null}
          activePlan={
            effectivePlan && effectiveVersion && effectiveVersion.id !== assign.versionId
              ? {
                  title: effectivePlan.title,
                  versionNumber: effectiveVersion.versionNumber,
                  content: effectiveVersion.content,
                }
              : null
          }
          issues={publishIssues(
            assign.content,
            configuration
              ? {
                  sessionsPerWeek: configuration.workout.sessionsPerWeek,
                  mealsPerDay: configuration.nutrition.mealsPerDay,
                }
              : null,
          )}
          ended={ended}
          online={online}
          onClose={closeAssign}
          onAssigned={() => {
            closeAssign();
            setDraftEpoch((value) => value + 1);
            setMessage("Plan published and scheduled.");
            reloadWorkspace();
          }}
        />
      ) : null}
    </div>
  );
}
