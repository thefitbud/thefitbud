import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import {
  planVersionStatusSchema,
  type PlanContent,
  type PlanTemplateSummary,
  type PlanVersionStatus,
  type PlanWithVersions,
} from "@fitbud/contracts";
import {
  consistencyFingerprint,
  formatCivilDate,
  formatHhMmTime,
  formatLocalDate,
  formatRelative,
  labelFor,
  planConsistencyWarnings,
} from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { WEEK_ORDER, weekdayShort } from "../components/builder/weekdays";
import { publishIssues } from "../components/builder/validation";
import { OverflowMenu } from "../components/OverflowMenu";
import { PlanConsistencyNotice } from "../components/PlanConsistencyNotice";
import { AssignPlanModal } from "../components/plan/AssignPlanModal";
import { createBlankPlanContent, sortedByOrder } from "../components/plan-composition";
import { EmptyState, ErrorState, LoadingBlock } from "../components/StatePanels";
import { apiClient } from "../lib/api";
import { civilDateEnd, civilDateStart } from "../lib/dateFilters";
import { createIdempotencyKey } from "../lib/idempotency";
import { resolveTraineeTimezone } from "../lib/trainee-timezone";
import type { WorkspaceOutletContext } from "./workspaceContext";
import "../styles/plan.css";

type DraftRef = { planId: string; versionId: string; versionNumber: number; updatedAt: string; title: string };

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

function WeekStrip({ content }: { content: PlanContent }) {
  return (
    <ol className="week-strip" aria-label="Plan week" data-testid="week-strip">
      {WEEK_ORDER.map((weekday) => {
        const session = content.workoutDays.find((day) => day.weekday === weekday);
        const meals = content.mealPrescriptions.filter((meal) =>
          (meal.applicableWeekdays ?? []).includes(weekday),
        ).length;
        return (
          <li key={weekday} className="week-strip-day">
            <span className="week-strip-name">{weekdayShort(weekday)}</span>
            <span className={session ? "week-strip-session" : "week-strip-session is-rest"}>
              {session ? session.name : "Rest"}
            </span>
            <span className="plan-chip">
              {meals} {meals === 1 ? "meal" : "meals"}
            </span>
          </li>
        );
      })}
    </ol>
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
  const meals = sortedByOrder(content.mealPrescriptions);
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
          effectiveFrom: civilDateStart(from),
          effectiveTo: civilDateEnd(to),
        });
        setRows((current) => (next ? [...current, ...result.items] : result.items));
        setCursor(result.nextCursor);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Couldn't load plan versions.");
      } finally {
        setLoading(false);
      }
    },
    [relationshipId, status, from, to],
  );

  useEffect(() => {
    if (open) void load();
  }, [open, load, refreshEpoch]);

  const day = (iso: string | null) =>
    iso ? formatCivilDate(formatLocalDate(new Date(iso), timezone)) : null;
  const filtersActive = Boolean(status || from || to);

  return (
    <section className="plan-card plan-versions" aria-labelledby="plan-versions-heading">
      <button
        type="button"
        className="plan-versions-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <h2 id="plan-versions-heading">Versions</h2>
        <span aria-hidden="true">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <>
          <form
            className="workspace-filters"
            aria-label="Plan version filters"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="field">
              <span>Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as "" | PlanVersionStatus)}
              >
                <option value="">Any status</option>
                {planVersionStatusSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {labelFor("plan_version_status", option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Effective from</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="field">
              <span>Effective to</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            {filtersActive ? (
              <button
                type="button"
                className="button-ghost"
                onClick={() => {
                  setStatus("");
                  setFrom("");
                  setTo("");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </form>
          {error ? <ErrorState message={error} onRetry={() => void load()} screenId="TW-12" /> : null}
          {loading && rows.length === 0 ? <LoadingBlock label="Loading versions…" /> : null}
          {!loading && !error && rows.length === 0 ? (
            <p className="muted" role="status">
              No plan versions for these filters.
            </p>
          ) : null}
          {rows.length > 0 ? (
            <div className="table-scroll">
              <table className="versions-table">
                <thead>
                  <tr>
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
                  {rows.flatMap((row) =>
                    row.versions.map((version) => (
                      <tr key={version.id}>
                        <td>
                          {row.plan.title} · v{version.versionNumber}
                        </td>
                        <td>
                          <span className={`status-pill status-${version.status}`}>
                            {labelFor("plan_version_status", version.status)}
                          </span>
                        </td>
                        <td>
                          {day(version.effectiveFrom) ?? "—"}
                          {version.effectiveTo ? ` → ${day(version.effectiveTo)}` : version.effectiveFrom ? " → ongoing" : ""}
                        </td>
                        <td>{version.publishedAt ? `You · ${day(version.publishedAt)}` : "—"}</td>
                        <td>
                          <Link
                            className="button-secondary"
                            to={`/clients/${relationshipId}/plan/${row.plan.id}/versions/${version.id}/edit`}
                          >
                            {version.status === "draft" ? "Edit draft" : "View"}
                          </Link>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          {cursor ? (
            <button
              type="button"
              className="button-secondary"
              disabled={loading}
              onClick={() => void load(cursor)}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
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
  const [picker, setPicker] = useState<null | "replace" | "start">(null);
  const [assign, setAssign] = useState<AssignTarget | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const effective = workspace?.plan ?? null;
  const effectiveVersion = effective?.version ?? null;
  const effectivePlan = effective?.plan ?? null;
  const configuration = workspace?.configuration.configuration ?? null;
  const header = workspace?.header ?? null;
  const timezone = header ? resolveTraineeTimezone(header).timezone : "UTC";
  const traineeName = header?.traineeDisplayName ?? "";
  const firstName = traineeName.split(" ")[0] ?? traineeName;
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
        if (!cancelled) setAcknowledged(result.acknowledged ? result.fingerprint : null);
      })
      .catch(() => {
        if (!cancelled) setAcknowledged(null);
      });
    return () => {
      cancelled = true;
    };
  }, [effectivePlan, effectiveVersion]);

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

  const effectiveFromLabel = effectiveVersion?.effectiveFrom
    ? formatCivilDate(formatLocalDate(new Date(effectiveVersion.effectiveFrom), timezone))
    : null;
  const effectiveToLabel = effectiveVersion?.effectiveTo
    ? formatCivilDate(formatLocalDate(new Date(effectiveVersion.effectiveTo), timezone))
    : null;

  let body;
  if (workspaceLoading && !workspace) {
    body = <LoadingBlock label="Loading plan…" />;
  } else if (workspaceError && !workspace) {
    body = <ErrorState message={workspaceError} onRetry={reloadWorkspace} screenId="TW-12" />;
  } else if (!effectivePlan || !effectiveVersion) {
    body = (
      <EmptyState
        title="No plan yet"
        action={
          !ended ? (
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
                Start blank
              </button>
            </div>
          ) : undefined
        }
      >
        <p>
          {ended
            ? "Coaching has ended, and there was no plan."
            : `Build ${firstName ? `${firstName}'s` : "a"} plan from a template or from scratch.`}
        </p>
      </EmptyState>
    );
  } else {
    body = (
      <>
        <section className="plan-card current-plan" aria-labelledby="current-plan-heading">
          <div className="current-plan-head">
            <div>
              <p className="plan-kicker">Current plan</p>
              <h2 id="current-plan-heading">{effectivePlan.title}</h2>
              <p className="muted" data-testid="plan-effective-line">
                Effective since {effectiveFromLabel ?? "—"} · v{effectiveVersion.versionNumber} ·{" "}
                {effectiveToLabel ? `ends ${effectiveToLabel}` : "ongoing"}
              </p>
            </div>
            {!ended ? (
              <div className="current-plan-actions">
                <button
                  type="button"
                  className="button-primary"
                  disabled={!canEdit}
                  onClick={() => void adjustPlan()}
                >
                  Adjust plan
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={!canEdit}
                  onClick={() => setPicker("replace")}
                >
                  Replace from template
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
              <p className="muted">Coaching has ended. This plan is read-only.</p>
            )}
          </div>
          <WeekStrip content={effectiveVersion.content} />
        </section>
        <MealTimesPanel
          content={effectiveVersion.content}
          overrides={header?.mealTimeOverrides ?? []}
          traineeFirstName={firstName}
          timezone={timezone}
        />
      </>
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
              onClick={() => void discardDraft()}
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
        <VersionsTable relationshipId={relationshipId} refreshEpoch={refreshEpoch} timezone={timezone} />
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
