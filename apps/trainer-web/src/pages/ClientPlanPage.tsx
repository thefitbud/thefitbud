import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import {
  planVersionStatusSchema,
  type AssignmentWindowMode,
  type DietAdjustmentScope,
  type PlanContent,
  type PlanTemplateSummary,
  type PlanVersion,
  type PlanVersionStatus,
  type PlanWithVersions,
} from "@fitbud/contracts";
import { consistencyFingerprint, planConsistencyWarnings } from "@fitbud/core";
import { PlanConsistencyNotice } from "../components/PlanConsistencyNotice";
import {
  PlanCompositionEditor,
  clonePlanContent,
  createBlankPlanContent,
  isEditablePlanStatus,
  planContentError,
} from "../components/plan-composition";
import { apiClient } from "../lib/api";
import { civilDateEnd, civilDateStart } from "../lib/dateFilters";
import { createIdempotencyKey } from "../lib/idempotency";
import type { WorkspaceOutletContext } from "./workspaceContext";
import "../styles/plan.css";

type DraftSession = {
  planId: string | null;
  versionId: string | null;
  recordVersion: number | null;
  title: string;
  content: PlanContent;
  savedTitle: string;
  savedContentJson: string;
  asAdjustment: boolean;
};

type PlanFocus =
  | { kind: "effective" }
  | { kind: "version"; planTitle: string; version: PlanVersion }
  | { kind: "editor"; draft: DraftSession };

function formatWhen(value: string | null | undefined): string {
  if (!value) return "now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function versionStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function warningsFor(
  content: PlanContent,
  sessionsPerWeek: number,
  mealsPerDay: number,
) {
  return planConsistencyWarnings({
    sessionsPerWeek,
    mealsPerDay,
    workoutDays: content.workoutDays,
    mealPrescriptions: content.mealPrescriptions,
  });
}

function sessionFromVersion(
  version: PlanVersion,
  title: string,
  asAdjustment: boolean,
): DraftSession {
  const content = clonePlanContent(version.content);
  return {
    planId: version.planId,
    versionId: version.id,
    recordVersion: version.recordVersion,
    title,
    content,
    savedTitle: title,
    savedContentJson: JSON.stringify(content),
    asAdjustment,
  };
}

function isDirty(draft: DraftSession): boolean {
  return (
    draft.title !== draft.savedTitle ||
    JSON.stringify(draft.content) !== draft.savedContentJson
  );
}

export function ClientPlanPage() {
  const { relationshipId = "" } = useParams();
  const {
    workspace,
    workspaceLoading,
    workspaceError,
    refreshEpoch = 0,
    reloadWorkspace,
  } = useOutletContext<WorkspaceOutletContext>();
  const effective = workspace?.plan ?? null;
  const configuration = workspace?.configuration.configuration ?? null;
  const [templates, setTemplates] = useState<PlanTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [focus, setFocus] = useState<PlanFocus>({ kind: "effective" });
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [assignmentWindow, setAssignmentWindow] =
    useState<AssignmentWindowMode>("next_7_days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [dietScope, setDietScope] = useState<DietAdjustmentScope>("today_onward");
  const [acknowledgedFingerprint, setAcknowledgedFingerprint] = useState<string | null>(
    null,
  );

  const loadTemplates = useCallback(async () => {
    setError(null);
    try {
      const templatePage = await apiClient.listPlanTemplates();
      setTemplates(templatePage.items);
      setSelectedTemplateId((current) => current || templatePage.items[0]?.id || "");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load plan templates.",
      );
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates, refreshEpoch]);

  useEffect(() => {
    setFocus({ kind: "effective" });
    setMessage(null);
    setError(null);
  }, [relationshipId]);

  async function openVersion(planId: string, versionId: string, planTitle: string) {
    setActing(true);
    setError(null);
    try {
      const version = await apiClient.getPlanVersion(planId, versionId);
      if (isEditablePlanStatus(version.status)) {
        setFocus({
          kind: "editor",
          draft: sessionFromVersion(
            version,
            planTitle,
            version.creationSource === "adjustment",
          ),
        });
      } else {
        setFocus({ kind: "version", planTitle, version });
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not load that version.",
      );
    } finally {
      setActing(false);
    }
  }

  async function startAdjustment(planId: string, sourceVersionId: string, title: string) {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const draft = await apiClient.createPlanDraftFromVersion(
        planId,
        { sourceVersionId, asAdjustment: true },
        createIdempotencyKey(),
      );
      setFocus({
        kind: "editor",
        draft: sessionFromVersion(draft, title, true),
      });
      setMessage(`Adjustment draft v${draft.versionNumber} created. Publish it as a new version.`);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not create an adjustment draft.",
      );
    } finally {
      setActing(false);
    }
  }

  function startBlank() {
    const content = createBlankPlanContent();
    const title = effective?.plan?.title ?? "Training block";
    setFocus({
      kind: "editor",
      draft: {
        planId: null,
        versionId: null,
        recordVersion: null,
        title,
        content,
        savedTitle: title,
        savedContentJson: JSON.stringify(content),
        asAdjustment: false,
      },
    });
    setError(null);
    setMessage(null);
  }

  async function onApplyTemplate(event: FormEvent) {
    event.preventDefault();
    if (!relationshipId || !selectedTemplateId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.applyPlanTemplate(
        relationshipId,
        { templateId: selectedTemplateId },
        createIdempotencyKey(),
      );
      setFocus({
        kind: "editor",
        draft: sessionFromVersion(result.version, result.plan.title, false),
      });
      setMessage(
        result.updatedExistingDraft
          ? `Draft v${result.version.versionNumber} updated from the template copy.`
          : `Draft v${result.version.versionNumber} created from the template copy.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not apply template.",
      );
    } finally {
      setActing(false);
    }
  }

  async function persistDraft(draft: DraftSession): Promise<DraftSession> {
    const contentError = planContentError(draft.content);
    if (contentError) {
      throw new Error(contentError);
    }
    const title = draft.title.trim();
    if (!title) {
      throw new Error("Title is required.");
    }
    if (!draft.planId || !draft.versionId || draft.recordVersion == null) {
      const created = await apiClient.createPlan(
        relationshipId,
        { title, content: draft.content },
        createIdempotencyKey(),
      );
      return sessionFromVersion(created.version, created.plan.title, draft.asAdjustment);
    }
    if (!isDirty(draft)) return draft;
    const updated = await apiClient.updatePlanDraft(draft.planId, draft.versionId, {
      expectedRecordVersion: draft.recordVersion,
      title,
      content: draft.content,
    });
    return sessionFromVersion(updated, title, draft.asAdjustment);
  }

  async function onSaveDraft() {
    if (focus.kind !== "editor") return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await persistDraft(focus.draft);
      setFocus({ kind: "editor", draft: saved });
      setMessage(
        saved.versionId
          ? "Draft saved with days, exercises, sets, and meals."
          : "Draft saved.",
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : "Could not save draft.");
    } finally {
      setActing(false);
    }
  }

  async function onPublish() {
    if (focus.kind !== "editor") return;
    if (assignmentWindow === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setError("Choose a custom range with a start date on or before the end date.");
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const saved =
        isDirty(focus.draft) || focus.draft.versionId == null
          ? await persistDraft(focus.draft)
          : focus.draft;
      if (!saved.planId || !saved.versionId || saved.recordVersion == null) {
        throw new Error("Draft was not saved.");
      }
      const published = await apiClient.publishPlanVersion(
        saved.planId,
        saved.versionId,
        {
          expectedRecordVersion: saved.recordVersion,
          mode: "immediate",
          dietScope,
        },
        createIdempotencyKey(),
      );
      let assignmentNote = "";
      if (saved.asAdjustment) {
        try {
          await apiClient.createIntervention(
            relationshipId,
            {
              kind: "plan_adjustment",
              summary: `Published plan adjustment v${published.versionNumber}`,
              resultingPlanVersionId: published.id,
            },
            createIdempotencyKey(),
          );
        } catch (err) {
          assignmentNote =
            err instanceof ApiClientError
              ? err.message
              : "The adjustment was published, and the intervention was not recorded.";
        }
      }
      const generateBody =
        assignmentWindow === "custom"
          ? { window: "custom" as const, fromDate: customFrom, toDate: customTo }
          : { window: assignmentWindow };
      try {
        await apiClient.generateWorkoutAssignments(
          relationshipId,
          generateBody,
          createIdempotencyKey(),
        );
      } catch (err) {
        if (!(err instanceof ApiClientError && err.code === "NO_WORKOUT_DAYS")) {
          const generateNote =
            err instanceof ApiClientError
              ? err.message
              : "Workout assignments were not generated.";
          assignmentNote = [assignmentNote, generateNote].filter(Boolean).join(" ");
        }
      }
      try {
        await apiClient.generateMealAssignments(
          relationshipId,
          { ...generateBody, dietScope },
          createIdempotencyKey(),
        );
      } catch (err) {
        if (!(err instanceof ApiClientError && err.code === "NO_MEAL_PRESCRIPTIONS")) {
          const generateNote =
            err instanceof ApiClientError
              ? err.message
              : "Meal assignments were not generated.";
          assignmentNote = [assignmentNote, generateNote].filter(Boolean).join(" ");
        }
      }
      setFocus({ kind: "effective" });
      setMessage(
        assignmentNote
          ? `Published version ${published.versionNumber}. ${assignmentNote}`
          : `Published version ${published.versionNumber}.`,
      );
      reloadWorkspace();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not publish plan.",
      );
    } finally {
      setActing(false);
    }
  }

  async function onAcknowledgeDifference() {
    if (focus.kind !== "editor" || !configuration) return;
    setActing(true);
    setError(null);
    try {
      const saved =
        isDirty(focus.draft) || focus.draft.versionId == null
          ? await persistDraft(focus.draft)
          : focus.draft;
      if (!saved.planId || !saved.versionId) {
        throw new Error("Save the draft before acknowledging the difference.");
      }
      setFocus({ kind: "editor", draft: saved });
      const warnings = warningsFor(
        saved.content,
        configuration.workout.sessionsPerWeek,
        configuration.nutrition.mealsPerDay,
      );
      const fingerprint = consistencyFingerprint(warnings);
      const result = await apiClient.acknowledgePlanConsistency(
        saved.planId,
        saved.versionId,
        { fingerprint },
      );
      setAcknowledgedFingerprint(result.fingerprint);
      setMessage("The difference is acknowledged. Assignments and exceptions are unchanged.");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not acknowledge the difference.",
      );
    } finally {
      setActing(false);
    }
  }

  const viewed =
    focus.kind === "version"
      ? focus
      : focus.kind === "effective" && effective?.plan && effective.version
        ? {
            kind: "version" as const,
            planTitle: effective.plan.title,
            version: effective.version,
          }
        : null;
  const editor = focus.kind === "editor" ? focus.draft : null;
  const contentIssue = editor ? planContentError(editor.content) : null;
  const comparedContent = editor?.content ?? viewed?.version.content ?? null;
  const consistencyWarnings = useMemo(() => {
    if (!comparedContent || !configuration) return [];
    return warningsFor(
      comparedContent,
      configuration.workout.sessionsPerWeek,
      configuration.nutrition.mealsPerDay,
    );
  }, [comparedContent, configuration]);
  const consistencyFingerprintValue = consistencyFingerprint(consistencyWarnings);
  const planPath = `/clients/${relationshipId}/plan`;
  const configurePath = `/clients/${relationshipId}/configure`;
  const consistencyPlanId = editor?.planId ?? viewed?.version.planId ?? null;
  const consistencyVersionId = editor?.versionId ?? viewed?.version.id ?? null;

  useEffect(() => {
    if (!consistencyPlanId || !consistencyVersionId) return;
    let cancelled = false;
    void apiClient
      .getPlanConsistency(consistencyPlanId, consistencyVersionId)
      .then((result) => {
        if (cancelled) return;
        setAcknowledgedFingerprint(result.acknowledged ? result.fingerprint : null);
      })
      .catch(() => {
        if (!cancelled) setAcknowledgedFingerprint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [consistencyPlanId, consistencyVersionId]);

  return (
    <div className="plan-page">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}

      <PlanVersionList
        relationshipId={relationshipId}
        refreshEpoch={refreshEpoch}
        acting={acting}
        onOpen={(planId, versionId, planTitle) => {
          void openVersion(planId, versionId, planTitle);
        }}
      />

      {workspaceLoading && !workspace ? (
        <p className="muted">Loading plan…</p>
      ) : workspaceError && !workspace ? null : editor ? (
        <section className="plan-card plan-composer" aria-labelledby="draft-change-heading">
          <header className="plan-composer-head">
            <div className="plan-composer-tags">
              <span className="plan-chip">
                {editor.asAdjustment ? "Adjustment draft" : editor.versionId ? "Draft" : "New plan"}
              </span>
            </div>
            <label className="field plan-title-field">
              <span className="sr-only">Title</span>
              <input
                id="draft-change-heading"
                className="plan-title-input"
                value={editor.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setFocus((current) =>
                    current.kind === "editor"
                      ? { kind: "editor", draft: { ...current.draft, title } }
                      : current,
                  );
                }}
                required
              />
            </label>
            <p className="muted">
              {editor.asAdjustment
                ? "This adjustment is a new version. Older published versions stay unchanged."
                : "Saving writes this draft. Publishing creates an immutable version."}
            </p>
          </header>
          <form className="plan-form plan-split-apply" onSubmit={(event) => void onApplyTemplate(event)}>
            <h3 className="plan-section-title">Apply a template</h3>
            <p className="muted">
              Copies the template into this draft, including meals and food snapshots.{" "}
              <Link to="/templates">Manage templates</Link>
            </p>
            {templates.length === 0 ? (
              <p className="muted">No templates yet.</p>
            ) : (
              <>
                <label className="field">
                  <span>Template</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    required
                  >
                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} ({item.templateType}
                        {item.ownership === "global" ? ", global" : ""})
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="button-secondary" disabled={acting}>
                  {acting ? "Applying…" : "Apply to draft"}
                </button>
              </>
            )}
          </form>
          <PlanCompositionEditor
            key={editor.versionId ?? "new-plan"}
            content={editor.content}
            onChange={(content) =>
              setFocus((current) =>
                current.kind === "editor"
                  ? { kind: "editor", draft: { ...current.draft, content } }
                  : current,
              )
            }
          />
          {contentIssue ? (
            <p className="form-error" role="alert">
              {contentIssue}
            </p>
          ) : null}
          <PlanConsistencyNotice
            warnings={consistencyWarnings}
            acknowledged={acknowledgedFingerprint === consistencyFingerprintValue}
            acting={acting}
            onAcknowledge={() => {
              void onAcknowledgeDifference();
            }}
            planTo={planPath}
            configureTo={configurePath}
            showPlanLink={false}
            showConfigureLink
          />
          <fieldset className="plan-assignment-window">
            <legend>Assignment window</legend>
            <label className="field">
              <span>When to place sessions</span>
              <select
                value={assignmentWindow}
                onChange={(event) =>
                  setAssignmentWindow(event.target.value as AssignmentWindowMode)
                }
              >
                <option value="next_7_days">Next 7 days</option>
                <option value="next_calendar_week">Next calendar week</option>
                <option value="custom">Custom dates</option>
              </select>
            </label>
            {assignmentWindow === "custom" ? (
              <div className="plan-assignment-window">
                <label className="field">
                  <span>From</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>To</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                    required
                  />
                </label>
              </div>
            ) : null}
            <label className="field">
              <span>Diet adjustment</span>
              <select
                value={dietScope}
                onChange={(event) =>
                  setDietScope(event.target.value as DietAdjustmentScope)
                }
              >
                <option value="today_onward">Today onward</option>
                <option value="today_only">Today only</option>
              </select>
            </label>
          </fieldset>
          <div className="plan-composer-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={acting || Boolean(contentIssue) || !editor.title.trim()}
              onClick={() => {
                void onSaveDraft();
              }}
            >
              {acting ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={acting || Boolean(contentIssue) || !editor.title.trim()}
              onClick={() => {
                void onPublish();
              }}
            >
              {acting ? "Publishing…" : editor.asAdjustment ? "Publish adjustment" : "Publish"}
            </button>
            <button
              type="button"
              className="button-ghost"
              onClick={() => setFocus({ kind: "effective" })}
            >
              Back to plan
            </button>
          </div>
        </section>
      ) : viewed ? (
        <div className="plan-tab">
          <section className="plan-card plan-effective" aria-labelledby="effective-plan-heading">
            <div className="plan-card-head">
              <div>
                <p className="plan-kicker">
                  {focus.kind === "effective" ? "Current effective plan" : "Plan version"}
                </p>
                <h2 id="effective-plan-heading">{viewed.planTitle}</h2>
                <p className="plan-meta">
                  <span className="plan-chip plan-chip-success">
                    {versionStatusLabel(viewed.version.status)}{" "}
                    {formatWhen(viewed.version.effectiveFrom)} (Version{" "}
                    {viewed.version.versionNumber})
                  </span>
                  {viewed.version.effectiveTo ? (
                    <span>Until {formatWhen(viewed.version.effectiveTo)}</span>
                  ) : null}
                </p>
              </div>
              <div className="plan-head-actions">
                <button
                  type="button"
                  className="button-primary"
                  disabled={acting}
                  onClick={() => {
                    void startAdjustment(
                      viewed.version.planId,
                      viewed.version.id,
                      viewed.planTitle,
                    );
                  }}
                >
                  Adjust plan
                </button>
                <Link
                  className="button-ghost"
                  to={`/clients/${relationshipId}/history?kind=plan_version`}
                >
                  View plan history
                </Link>
              </div>
            </div>
            <p className="muted plan-readonly-note">
              Published, scheduled, effective, and superseded versions stay read-only.
              Adjust creates a new version.
            </p>
          </section>
          <section className="plan-card">
            <PlanConsistencyNotice
              warnings={consistencyWarnings}
              acknowledged={acknowledgedFingerprint === consistencyFingerprintValue}
              planTo={planPath}
              configureTo={configurePath}
              showPlanLink={false}
              showConfigureLink
            />
            <PlanCompositionEditor content={viewed.version.content} />
          </section>
          {focus.kind === "effective" ? (
            <section className="plan-card" aria-labelledby="tracking-heading">
              <h3 id="tracking-heading" className="plan-section-title">
                Tracking expectations
              </h3>
              {configuration ? (
                <dl className="workspace-facts">
                  <div>
                    <dt className="section-kicker">Workout</dt>
                    <dd>
                      {configuration.workout.sessionsPerWeek} sessions / week ·{" "}
                      {configuration.workout.completionWindowHours}h window
                    </dd>
                  </div>
                  <div>
                    <dt className="section-kicker">Nutrition</dt>
                    <dd>
                      {configuration.nutrition.mealsPerDay} meals / day · photos{" "}
                      {configuration.nutrition.photoRequirement.replace(/_/g, " ")}
                    </dd>
                  </div>
                  <div>
                    <dt className="section-kicker">Check-ins</dt>
                    <dd>
                      {configuration.checkin.cadence} · {configuration.checkin.dueWindowHours}h
                      due window
                    </dd>
                  </div>
                  <div>
                    <dt className="section-kicker">Evidence</dt>
                    <dd>
                      {[
                        configuration.tracking.requireBodyWeight ? "body weight" : null,
                        configuration.tracking.requireProgressPhotos
                          ? "progress photos"
                          : null,
                        configuration.tracking.requireSessionRpe ? "session RPE" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "None required"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="muted">
                  Set tracking expectations in{" "}
                  <Link to={`/clients/${relationshipId}/configure`}>client settings</Link>.
                </p>
              )}
            </section>
          ) : (
            <button
              type="button"
              className="button-ghost"
              onClick={() => setFocus({ kind: "effective" })}
            >
              Back to effective plan
            </button>
          )}
          <form className="plan-card plan-form" onSubmit={(event) => void onApplyTemplate(event)}>
            <h3 className="plan-section-title">Apply a template</h3>
            <p className="muted">
              Copies a template into a new or existing draft. It does not edit this
              version. <Link to="/templates">Manage templates</Link>
            </p>
            {templates.length === 0 ? (
              <p className="muted">No templates yet.</p>
            ) : (
              <>
                <label className="field">
                  <span>Template</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    required
                  >
                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} ({item.templateType}
                        {item.ownership === "global" ? ", global" : ""})
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="button-secondary" disabled={acting}>
                  {acting ? "Applying…" : "Apply to draft"}
                </button>
              </>
            )}
          </form>
        </div>
      ) : (
        <section className="plan-card">
          <h2>No effective plan</h2>
          <p className="muted">Create a draft with workout days and meals, then publish it.</p>
          <div className="plan-composer-actions">
            <button type="button" className="button-primary" onClick={startBlank}>
              Create plan
            </button>
          </div>
          <form className="plan-form" onSubmit={(event) => void onApplyTemplate(event)}>
            {templates.length === 0 ? (
              <p className="muted">No templates yet.</p>
            ) : (
              <>
                <label className="field">
                  <span>Template</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    required
                  >
                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} ({item.templateType}
                        {item.ownership === "global" ? ", global" : ""})
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="button-secondary" disabled={acting}>
                  {acting ? "Applying…" : "Apply template"}
                </button>
              </>
            )}
          </form>
        </section>
      )}
    </div>
  );
}

function PlanVersionList({
  relationshipId,
  refreshEpoch,
  acting,
  onOpen,
}: {
  relationshipId: string;
  refreshEpoch: number;
  acting: boolean;
  onOpen: (planId: string, versionId: string, planTitle: string) => void;
}) {
  const [versionStatus, setVersionStatus] = useState<"" | PlanVersionStatus>("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [items, setItems] = useState<PlanWithVersions[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string | null) => {
      if (!relationshipId) return;
      const appending = Boolean(cursor);
      if (appending) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await apiClient.listPlans(relationshipId, {
          cursor: cursor ?? undefined,
          limit: 20,
          versionStatus: versionStatus || undefined,
          effectiveFrom: civilDateStart(effectiveFrom),
          effectiveTo: civilDateEnd(effectiveTo),
        });
        setItems((current) =>
          appending ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load plan versions.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [effectiveFrom, effectiveTo, relationshipId, versionStatus],
  );

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  const filtersActive = Boolean(versionStatus || effectiveFrom || effectiveTo);

  return (
    <section className="plan-card plan-versions" aria-labelledby="plan-versions-heading">
      <div className="plan-card-head">
        <div>
          <p className="plan-kicker">Versions</p>
          <h2 id="plan-versions-heading">Plan versions</h2>
          <p className="muted">
            Filter by status and effective dates. Clearing the filters returns the
            full list.
          </p>
        </div>
      </div>
      <form
        className="workspace-filters"
        aria-label="Plan version filters"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="field">
          <span>Status</span>
          <select
            value={versionStatus}
            onChange={(event) =>
              setVersionStatus(event.target.value as "" | PlanVersionStatus)
            }
          >
            <option value="">Any status</option>
            {planVersionStatusSchema.options.map((option) => (
              <option key={option} value={option}>
                {versionStatusLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Effective from</span>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Effective to</span>
          <input
            type="date"
            value={effectiveTo}
            onChange={(event) => setEffectiveTo(event.target.value)}
          />
        </label>
        {filtersActive ? (
          <button
            type="button"
            className="button-ghost"
            onClick={() => {
              setVersionStatus("");
              setEffectiveFrom("");
              setEffectiveTo("");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="muted">Loading versions…</p> : null}
      {!loading && items.length === 0 && !error ? (
        <p className="workspace-empty" role="status">
          No plan versions for these filters.
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="workspace-list">
          {items.flatMap((row) =>
            row.versions.map((item) => (
              <li key={item.id} className="workspace-row">
                <div className="workspace-row-copy">
                  <p className="workspace-row-title">
                    {row.plan.title} · v{item.versionNumber}
                  </p>
                  <p className="workspace-row-meta">
                    <span className={`status-pill status-${item.status}`}>
                      {versionStatusLabel(item.status)}
                    </span>
                    <span>
                      Effective {formatWhen(item.effectiveFrom)}
                      {item.effectiveTo ? ` – ${formatWhen(item.effectiveTo)}` : ""}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={acting}
                  onClick={() => onOpen(row.plan.id, item.id, row.plan.title)}
                >
                  {isEditablePlanStatus(item.status) ? "Edit draft" : "View"}
                </button>
              </li>
            )),
          )}
        </ul>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          className="button-secondary"
          disabled={loadingMore}
          onClick={() => {
            void load(nextCursor);
          }}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
