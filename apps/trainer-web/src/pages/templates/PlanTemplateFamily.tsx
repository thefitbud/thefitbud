import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { PlanTemplate, PlanTemplateSummary, PlanTemplateType } from "@fitbud/contracts";
import { planContentMatchesTemplateType } from "@fitbud/core";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import {
  PlanCompositionEditor,
  addExerciseFromLibrary,
  addFoodItemFromLibrary,
  blankContentForTemplateType,
  clonePlanContent,
  planContentError,
  type PlanCompositionSections,
} from "../../components/plan-composition";
import { ExerciseSearchPane, FoodSearchPane } from "./LibrarySearch";
import {
  errorText,
  formatUpdated,
  matchesName,
  templateTypeLabel,
  type ApplyClient,
} from "./shared";

type Draft = {
  id: string | null;
  title: string;
  recordVersion: number | null;
  ownership: "global" | "trainer" | null;
  content: PlanTemplate["content"];
};

export function summaryOf(template: PlanTemplate): PlanTemplateSummary {
  return {
    id: template.id,
    ownership: template.ownership,
    trainerUserId: template.trainerUserId,
    title: template.title,
    templateType: template.templateType,
    recordVersion: template.recordVersion,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function mismatchMessage(templateType: PlanTemplateType): string {
  switch (templateType) {
    case "workout":
      return "A workout template needs at least one day and no meals.";
    case "nutrition":
      return "A nutrition template needs at least one meal and no workout days.";
    case "combined":
      return "A combined template needs at least one workout day and one meal.";
    default: {
      const _exhaustive: never = templateType;
      return _exhaustive;
    }
  }
}

export function PlanTemplateFamily({
  templateType,
  templates,
  nextCursor,
  loading,
  loadingMore,
  onLoadMore,
  onSaved,
  clients,
  clientError,
}: {
  templateType: PlanTemplateType;
  templates: PlanTemplateSummary[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSaved: (template: PlanTemplate) => void;
  clients: ApplyClient[];
  clientError: string | null;
}) {
  const label = templateTypeLabel(templateType);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [opening, setOpening] = useState(false);
  const [acting, setActing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [applyRelationshipId, setApplyRelationshipId] = useState(
    clients[0]?.relationshipId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const visible = templates.filter(
    (item) =>
      item.templateType === templateType && matchesName(item.title, query),
  );
  const contentIssue = draft ? planContentError(draft.content) : null;
  const typeMatches = draft
    ? planContentMatchesTemplateType(draft.content, templateType)
    : true;
  const sections: PlanCompositionSections =
    templateType === "combined" || !typeMatches ? "both" : templateType;
  const relationshipId = clients.some(
    (item) => item.relationshipId === applyRelationshipId,
  )
    ? applyRelationshipId
    : (clients[0]?.relationshipId ?? "");
  const readOnly = draft?.ownership === "global";

  function startCreate() {
    setDraft({
      id: null,
      title: "",
      recordVersion: null,
      ownership: null,
      content: blankContentForTemplateType(templateType),
    });
    setConflict(false);
    setError(null);
    setMessage(null);
  }

  async function openTemplate(templateId: string) {
    setOpening(true);
    setError(null);
    setMessage(null);
    setConflict(false);
    try {
      const template = await apiClient.getPlanTemplate(templateId);
      setDraft({
        id: template.id,
        title: template.title,
        recordVersion: template.recordVersion,
        ownership: template.ownership,
        content: clonePlanContent(template.content),
      });
    } catch (err) {
      setError(errorText(err, "Could not load this template."));
    } finally {
      setOpening(false);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!draft || draft.ownership === "global") return;
    const issue = planContentError(draft.content);
    if (issue) {
      setError(issue);
      return;
    }
    if (!planContentMatchesTemplateType(draft.content, templateType)) {
      setError(mismatchMessage(templateType));
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    setConflict(false);
    try {
      const saved =
        draft.id == null || draft.recordVersion == null
          ? await apiClient.createPlanTemplate(
              {
                title: draft.title.trim(),
                templateType,
                content: draft.content,
              },
              createIdempotencyKey(),
            )
          : await apiClient.updatePlanTemplate(draft.id, {
              expectedRecordVersion: draft.recordVersion,
              title: draft.title.trim(),
              templateType,
              content: draft.content,
            });
      setDraft({
        id: saved.id,
        title: saved.title,
        recordVersion: saved.recordVersion,
        ownership: saved.ownership,
        content: clonePlanContent(saved.content),
      });
      onSaved(saved);
      setMessage("Template saved. Applying it copies this snapshot into a client draft.");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "TEMPLATE_VERSION_CONFLICT") {
        setConflict(true);
      }
      setError(errorText(err, "Could not save this template."));
    } finally {
      setActing(false);
    }
  }

  async function reloadLatest() {
    if (!draft?.id) return;
    setActing(true);
    setError(null);
    try {
      const template = await apiClient.getPlanTemplate(draft.id);
      setDraft({
        id: template.id,
        title: template.title,
        recordVersion: template.recordVersion,
        ownership: template.ownership,
        content: clonePlanContent(template.content),
      });
      onSaved(template);
      setConflict(false);
      setMessage("Reloaded the latest saved template.");
    } catch (err) {
      setError(errorText(err, "Could not reload this template."));
    } finally {
      setActing(false);
    }
  }

  async function onFork() {
    if (!draft?.id || draft.ownership !== "global") return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const forked = await apiClient.forkPlanTemplate(
        draft.id,
        { title: draft.title.trim() || undefined },
        createIdempotencyKey(),
      );
      setDraft({
        id: forked.id,
        title: forked.title,
        recordVersion: forked.recordVersion,
        ownership: forked.ownership,
        content: clonePlanContent(forked.content),
      });
      onSaved(forked);
      setMessage(
        "Forked into your template. The global base is unchanged, and applying either copy does not link them.",
      );
    } catch (err) {
      setError(errorText(err, "Could not fork this template."));
    } finally {
      setActing(false);
    }
  }

  async function onApply(event: FormEvent) {
    event.preventDefault();
    if (!draft?.id || !relationshipId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.applyPlanTemplate(
        relationshipId,
        { templateId: draft.id },
        createIdempotencyKey(),
      );
      setMessage(
        result.updatedExistingDraft
          ? `Updated draft v${result.version.versionNumber} from this template. The copy is not linked.`
          : `Created draft v${result.version.versionNumber} from this template. The copy is not linked.`,
      );
    } catch (err) {
      setError(errorText(err, "Could not apply this template."));
    } finally {
      setActing(false);
    }
  }

  if (draft) {
    return (
      <div className="templates-stack">
        <button
          type="button"
          className="button-ghost"
          onClick={() => {
            setDraft(null);
            setConflict(false);
            setError(null);
          }}
        >
          Back to {label.toLowerCase()} templates
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? <p className="form-success">{message}</p> : null}
        <form className="templates-panel" onSubmit={(event) => void onSave(event)}>
          <div className="templates-panel-header">
            <h2>
              {readOnly
                ? `Global ${label.toLowerCase()} base`
                : draft.id
                  ? `Edit ${label.toLowerCase()} template`
                  : `New ${label.toLowerCase()} template`}
            </h2>
            <p className="muted">
              {readOnly
                ? "This base is read-only. Apply it as-is, or fork it into a template you can edit."
                : "Saving sends the record version loaded with this template so a newer edit is not overwritten."}
            </p>
          </div>
          <label className="field">
            <span>Title</span>
            <input
              value={draft.title}
              maxLength={160}
              disabled={readOnly}
              onChange={(event) => {
                const title = event.target.value;
                setDraft((current) => (current ? { ...current, title } : current));
              }}
              required
            />
          </label>
          {readOnly ? (
            <button
              type="button"
              className="button-primary"
              disabled={acting}
              onClick={() => {
                void onFork();
              }}
            >
              {acting ? "Forking…" : "Fork into my template"}
            </button>
          ) : (
            <button
              type="submit"
              className="button-primary"
              disabled={acting || Boolean(contentIssue) || !typeMatches || !draft.title.trim()}
            >
              {acting ? "Saving…" : "Save template"}
            </button>
          )}
          {contentIssue ? <p className="form-error">{contentIssue}</p> : null}
          {!typeMatches ? <p className="form-error">{mismatchMessage(templateType)}</p> : null}
          {conflict ? (
            <button
              type="button"
              className="button-secondary"
              disabled={acting}
              onClick={() => {
                void reloadLatest();
              }}
            >
              Reload latest
            </button>
          ) : null}
        </form>
        <PlanCompositionEditor
          key={draft.id ?? `new-${templateType}`}
          content={draft.content}
          sections={sections}
          allowDuplicate={!readOnly}
          onChange={
            readOnly
              ? undefined
              : (content) =>
                  setDraft((current) => (current ? { ...current, content } : current))
          }
          renderWorkoutLibrary={
            sections !== "nutrition"
              ? (day) => (
                  <ExerciseSearchPane
                    day={day}
                    onAdd={(item) => {
                      if (!day) return;
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              content: addExerciseFromLibrary(
                                current.content,
                                day.id,
                                item,
                              ),
                            }
                          : current,
                      );
                    }}
                  />
                )
              : undefined
          }
          renderMealLibrary={
            sections !== "workout"
              ? (meal) => (
                  <FoodSearchPane
                    meal={meal}
                    onAdd={(item, servingId) => {
                      if (!meal) return;
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              content: addFoodItemFromLibrary(
                                current.content,
                                meal.id,
                                item,
                                servingId,
                              ),
                            }
                          : current,
                      );
                    }}
                  />
                )
              : undefined
          }
        />
        <section className="templates-panel" aria-labelledby="apply-template-heading">
          <div className="templates-panel-header">
            <h2 id="apply-template-heading">Apply to a client draft</h2>
            <p className="muted">
              Copies this template into a draft. Publish stays on the client Plan tab.
            </p>
          </div>
          {clientError ? (
            <p className="form-error" role="alert">
              {clientError}
            </p>
          ) : null}
          {!draft.id ? (
            <p className="muted">Save the template before applying it.</p>
          ) : clients.length === 0 ? (
            <p className="muted">No clients with a coaching relationship yet.</p>
          ) : (
            <form className="templates-form" onSubmit={(event) => void onApply(event)}>
              <label className="field">
                <span>Client</span>
                <select
                  value={relationshipId}
                  onChange={(event) => setApplyRelationshipId(event.target.value)}
                  required
                >
                  {clients.map((item) => (
                    <option key={item.relationshipId} value={item.relationshipId}>
                      {item.traineeDisplayName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-row">
                <button type="submit" className="button-primary" disabled={acting}>
                  {acting ? "Applying…" : "Apply to draft"}
                </button>
                <Link className="button-secondary" to={`/clients/${relationshipId}/plan`}>
                  Open Plan
                </Link>
              </div>
            </form>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="templates-stack">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}
      <div className="templates-toolbar">
        <button type="button" className="button-primary" onClick={startCreate}>
          New {label.toLowerCase()} template
        </button>
        <label className="templates-filter-search">
          <span className="sr-only">Filter {label} templates by title</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter loaded templates"
            autoComplete="off"
          />
        </label>
      </div>
      {loading || opening ? (
        <p className="muted" aria-busy="true">
          {opening ? "Loading template…" : "Loading templates…"}
        </p>
      ) : visible.length === 0 ? (
        <div className="empty-state" role="status">
          <h2>No {label.toLowerCase()} templates in the loaded pages</h2>
          <p>
            {nextCursor
              ? "Template type is not a server filter. Load more pages to look further."
              : templates.length === 0
                ? `Create a ${label.toLowerCase()} template to reuse it across clients.`
                : "Nothing already loaded matches this family."}
          </p>
        </div>
      ) : (
        <ul className="templates-grid">
          {visible.map((item) => (
            <li key={item.id}>
              <article className="templates-item">
                <header className="templates-item-top">
                  <span className={`templates-type templates-type-${item.templateType}`}>
                    {templateTypeLabel(item.templateType)}
                  </span>
                  <time dateTime={item.updatedAt}>
                    Updated {formatUpdated(item.updatedAt)}
                  </time>
                </header>
                <h3>{item.title}</h3>
                <p className="muted">
                  {item.ownership === "global"
                    ? "Global base. Apply it as-is, or fork it before editing."
                    : "Your template. Copied into a client draft when applied. Not linked live."}
                </p>
                <div className="templates-item-actions">
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => {
                      void openTemplate(item.id);
                    }}
                  >
                    {item.ownership === "global" ? "View" : "Edit"}
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {nextCursor ? (
        <button
          type="button"
          className="button-secondary"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? "Loading…" : "Load more templates"}
        </button>
      ) : null}
    </div>
  );
}
