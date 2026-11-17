import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { OnboardingFormTemplateDetail } from "@fitbud/contracts";
import { Button } from "../../components/Button";
import { OverflowMenu } from "../../components/OverflowMenu";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../../components/StatePanels";
import { useOnline } from "../../hooks/useOnline";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { FormPhonePreview } from "./FormPhonePreview";
import { ForkTemplateModal } from "./ForkTemplateModal";
import {
  BUILDER_FIELD_TYPES,
  blankField,
  buildFields,
  draftsFromFields,
  duplicateFieldDraft,
  fieldTypeLabel,
  fieldsMatchLatest,
  isChoiceType,
  isTextType,
  withFieldType,
  type FieldDraft,
} from "./onboardingBuilder";
import { errorText } from "./shared";
import "./OnboardingTemplateBuilderPage.css";

function sortedVersions(detail: OnboardingFormTemplateDetail) {
  return [...detail.versions].sort((a, b) => a.version - b.version);
}

function duplicateLabels(drafts: FieldDraft[]): string[] {
  const seen = new Map<string, number>();
  for (const draft of drafts) {
    const key = draft.label.trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([label]) => label);
}

function questionSubtitle(draft: FieldDraft): string {
  const parts = [fieldTypeLabel(draft.type)];
  if (draft.required) parts.push("required");
  if (draft.highlight) parts.push("flagged for review");
  return parts.join(" · ");
}

export function OnboardingTemplateBuilderPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const [detail, setDetail] = useState<OnboardingFormTemplateDetail | null>(
    null,
  );
  const [drafts, setDrafts] = useState<FieldDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [showFork, setShowFork] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(() => {
    if (!templateId) return;
    setLoadError(null);
    setDetail(null);
    void apiClient
      .getOnboardingFormTemplate(templateId)
      .then((loaded) => {
        setDetail(loaded);
        const latest =
          sortedVersions(loaded).find((v) => v.id === loaded.latestVersionId) ??
          sortedVersions(loaded).at(-1);
        const nextDrafts = draftsFromFields(latest?.fields ?? []);
        setDrafts(nextDrafts);
        setSelectedId(nextDrafts[0]?.id ?? null);
      })
      .catch((err: unknown) =>
        setLoadError(errorText(err, "Could not load this onboarding form.")),
      );
  }, [templateId]);

  useEffect(() => load(), [load]);

  const nextVersion = (detail?.latestVersionNumber ?? 0) + 1;
  const readOnly = detail?.ownership === "global";
  const dupLabels = useMemo(() => duplicateLabels(drafts), [drafts]);
  const selected = useMemo(
    () => drafts.find((draft) => draft.id === selectedId) ?? null,
    [drafts, selectedId],
  );
  const builtPreview = useMemo(() => {
    const built = buildFields(
      drafts.map((d) =>
        d.label.trim() ? d : { ...d, label: d.label || "Untitled" },
      ),
    );
    return built.ok ? built.fields : [];
  }, [drafts]);

  function updateDraft(id: string, patch: Partial<FieldDraft>) {
    setDrafts((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function move(index: number, delta: number) {
    setDrafts((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  }

  function addQuestion() {
    const field = blankField();
    setDrafts((current) => [...current, field]);
    setSelectedId(field.id);
  }

  async function saveVersion() {
    if (!detail || readOnly) return;
    const built = buildFields(drafts);
    if (!built.ok) {
      setSaveError(built.error);
      return;
    }
    const latest =
      sortedVersions(detail).find((v) => v.id === detail.latestVersionId) ??
      sortedVersions(detail).at(-1);
    if (fieldsMatchLatest(drafts, latest?.fields ?? null)) {
      setSaveError("No changes to save.");
      return;
    }
    setActing(true);
    setSaveError(null);
    setMessage(null);
    try {
      const saved = await apiClient.createOnboardingFormTemplateVersion(
        detail.id,
        { fields: built.fields },
        createIdempotencyKey(),
      );
      setDetail(saved);
      const next =
        sortedVersions(saved).find((v) => v.id === saved.latestVersionId) ??
        sortedVersions(saved).at(-1);
      const nextDrafts = draftsFromFields(next?.fields ?? []);
      setDrafts(nextDrafts);
      setSelectedId((current) =>
        nextDrafts.some((d) => d.id === current)
          ? current
          : (nextDrafts[0]?.id ?? null),
      );
      setMessage(
        `Published as v${saved.latestVersionNumber}. Clients who already answered keep their version.`,
      );
    } catch (err) {
      setSaveError(errorText(err, "Could not save this version."));
    } finally {
      setActing(false);
    }
  }

  if (loadError) {
    return (
      <section className="page intake-builder" data-testid="screen-TW-24">
        <ErrorState message={loadError} onRetry={load} screenId="TW-24" />
        <Link to="/templates/onboarding">Back to onboarding</Link>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="page intake-builder" data-testid="screen-TW-24">
        <LoadingBlock label="Loading form…" />
      </section>
    );
  }

  if (!online) {
    return (
      <section className="page intake-builder" data-testid="screen-TW-24">
        <ErrorState
          kind="network"
          screenId="TW-24"
          title="You're offline"
          message="Reconnect to edit this form."
        />
      </section>
    );
  }

  const questionCount = drafts.length;
  const statusBadge = readOnly
    ? `v${detail.latestVersionNumber}`
    : `Draft · v${nextVersion}`;

  return (
    <section className="page intake-builder" data-testid="screen-TW-24">
      <header className="intake-builder-header">
        <div>
          <Link className="intake-builder-crumb" to="/templates/onboarding">
            Templates › Onboarding forms
          </Link>
          <div className="intake-builder-title-row">
            <h1>{detail.name}</h1>
            <span className="intake-builder-badge">{statusBadge}</span>
          </div>
          <p className="intake-builder-meta">
            Onboarding form · {questionCount}{" "}
            {questionCount === 1 ? "question" : "questions"}
            {readOnly ? " · FitBud base · read-only" : " · Mine"}
          </p>
        </div>
        <div className="intake-builder-actions">
          <Button variant="secondary" onClick={() => setShowPreview(true)}>
            Preview
          </Button>
          {readOnly ? (
            <Button variant="primary" onClick={() => setShowFork(true)}>
              Fork to edit
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={acting}
              onClick={() => void saveVersion()}
            >
              {acting ? "Publishing…" : `Publish v${nextVersion}`}
            </Button>
          )}
        </div>
      </header>

      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
      {saveError ? (
        <p className="form-error" role="alert">
          {saveError}
        </p>
      ) : null}
      {dupLabels.length > 0 ? (
        <p className="form-warning" role="status">
          Duplicate labels: {dupLabels.join(", ")}
        </p>
      ) : null}

      <div className="intake-builder-layout">
        <div className="intake-builder-editor" tabIndex={0}>
          {drafts.length === 0 ? (
            <EmptyState title="No questions yet.">
              <Button
                variant="secondary"
                disabled={readOnly}
                onClick={addQuestion}
              >
                Add question
              </Button>
            </EmptyState>
          ) : (
            <ul className="intake-builder-list" aria-label="Questions">
              {drafts.map((draft, index) => {
                const selectedRow = draft.id === selectedId;
                return (
                  <li
                    key={draft.id}
                    className={
                      selectedRow ? "intake-q-row is-selected" : "intake-q-row"
                    }
                  >
                    <span className="intake-q-handle" aria-hidden>
                      ⋮⋮
                    </span>
                    <button
                      type="button"
                      className="intake-q-select"
                      aria-pressed={selectedRow}
                      onClick={() => setSelectedId(draft.id)}
                    >
                      <span className="intake-q-label">
                        {draft.label.trim() || "Untitled question"}
                      </span>
                      <span className="intake-q-sub">
                        {questionSubtitle(draft)}
                      </span>
                    </button>
                    {!readOnly ? (
                      <div className="intake-q-menu">
                        <OverflowMenu
                          label={`Actions for ${draft.label.trim() || "question"}`}
                          items={[
                            {
                              id: "up",
                              label: "Move up",
                              disabled: index === 0,
                              onSelect: () => move(index, -1),
                            },
                            {
                              id: "down",
                              label: "Move down",
                              disabled: index === drafts.length - 1,
                              onSelect: () => move(index, 1),
                            },
                            {
                              id: "dup",
                              label: "Duplicate",
                              onSelect: () => {
                                const copy = duplicateFieldDraft(draft);
                                setDrafts((current) => {
                                  const next = [...current];
                                  next.splice(index + 1, 0, copy);
                                  return next;
                                });
                                setSelectedId(copy.id);
                              },
                            },
                            {
                              id: "delete",
                              label: "Delete",
                              destructive: true,
                              dividerBefore: true,
                              onSelect: () => {
                                setDrafts((current) => {
                                  const next = current.filter(
                                    (row) => row.id !== draft.id,
                                  );
                                  setSelectedId((currentId) =>
                                    currentId === draft.id
                                      ? (next[Math.max(0, index - 1)]?.id ??
                                        null)
                                      : currentId,
                                  );
                                  return next;
                                });
                              },
                            },
                          ]}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {!readOnly && drafts.length > 0 ? (
            <Button
              className="intake-builder-add"
              variant="secondary"
              onClick={addQuestion}
            >
              <span aria-hidden>+ </span>Add question
            </Button>
          ) : null}
        </div>

        <aside className="intake-question-panel" aria-label="Question">
          <h2>Question</h2>
          {!selected ? (
            <p className="intake-question-empty">
              Select a question to edit its wording and type.
            </p>
          ) : (
            <>
              <label className="field">
                <span>Question</span>
                <input
                  value={selected.label}
                  disabled={readOnly}
                  aria-invalid={
                    !selected.label.trim() ||
                    dupLabels.includes(selected.label.trim().toLowerCase())
                  }
                  onChange={(event) =>
                    updateDraft(selected.id, { label: event.target.value })
                  }
                />
                {!selected.label.trim() ? (
                  <span className="field-error">Enter a label.</span>
                ) : null}
                {selected.label.trim() &&
                dupLabels.includes(selected.label.trim().toLowerCase()) ? (
                  <span className="field-error">
                    Another question uses this label.
                  </span>
                ) : null}
              </label>
              <label className="field">
                <span>Help text</span>
                <input
                  value={selected.helpText}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateDraft(selected.id, { helpText: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Answer type</span>
                <select
                  value={selected.type}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateDraft(
                      selected.id,
                      withFieldType(
                        selected,
                        event.target.value as FieldDraft["type"],
                      ),
                    )
                  }
                >
                  {BUILDER_FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {fieldTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="intake-switch-row">
                <span>Required</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={selected.required}
                  disabled={readOnly}
                  aria-checked={selected.required}
                  onChange={(event) =>
                    updateDraft(selected.id, {
                      required: event.target.checked,
                    })
                  }
                />
              </label>
              <label className="intake-switch-row">
                <span>Flag for review</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={selected.highlight}
                  disabled={readOnly}
                  aria-checked={selected.highlight}
                  onChange={(event) =>
                    updateDraft(selected.id, {
                      highlight: event.target.checked,
                    })
                  }
                />
              </label>
              {isTextType(selected.type) ? (
                <label className="field">
                  <span>Max length</span>
                  <input
                    value={selected.maxLength}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateDraft(selected.id, {
                        maxLength: event.target.value,
                      })
                    }
                  />
                </label>
              ) : null}
              {selected.type === "number" ? (
                <label className="field">
                  <span>Unit</span>
                  <input
                    value={selected.unit}
                    disabled={readOnly}
                    placeholder="kg"
                    onChange={(event) =>
                      updateDraft(selected.id, { unit: event.target.value })
                    }
                  />
                </label>
              ) : null}
              {isChoiceType(selected.type) ? (
                <fieldset className="templates-options">
                  <legend>Choices</legend>
                  {selected.options.map((option, optionIndex) => (
                    <div key={option.id} className="templates-option-row">
                      <input
                        value={option.label}
                        disabled={readOnly}
                        placeholder={`Option ${optionIndex + 1}`}
                        onChange={(event) =>
                          updateDraft(selected.id, {
                            options: selected.options.map((opt) =>
                              opt.id === option.id
                                ? { ...opt, label: event.target.value }
                                : opt,
                            ),
                          })
                        }
                      />
                      <Button
                        variant="tertiary"
                        disabled={readOnly || selected.options.length <= 2}
                        onClick={() =>
                          updateDraft(selected.id, {
                            options: selected.options.filter(
                              (opt) => opt.id !== option.id,
                            ),
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    disabled={readOnly}
                    onClick={() =>
                      updateDraft(selected.id, {
                        options: [
                          ...selected.options,
                          { id: crypto.randomUUID(), label: "" },
                        ],
                      })
                    }
                  >
                    Add option
                  </Button>
                  {selected.options.filter((o) => o.label.trim()).length < 2 ? (
                    <p className="form-error">
                      A choice question needs at least 2 options.
                    </p>
                  ) : null}
                </fieldset>
              ) : null}
              <p className="intake-question-note">
                {readOnly
                  ? "FitBud base forms are read-only. Fork to edit your own copy."
                  : `Clients who already answered v${detail.latestVersionNumber} keep their answers. v${nextVersion} applies to new submissions.`}
              </p>
            </>
          )}
        </aside>
      </div>

      {showPreview ? (
        <div
          className="intake-preview-scrim"
          role="presentation"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="intake-preview-card"
            role="dialog"
            aria-modal="true"
            aria-label="Form preview"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="intake-preview-card-head">
              <h2>Preview</h2>
              <Button
                variant="tertiary"
                onClick={() => setShowPreview(false)}
              >
                Close
              </Button>
            </div>
            <FormPhonePreview fields={builtPreview} title={detail.name} />
          </div>
        </div>
      ) : null}

      {showFork ? (
        <ForkTemplateModal
          templateId={detail.id}
          templateTitle={detail.name}
          hubSlug="onboarding"
          kind="onboarding"
          onClose={() => setShowFork(false)}
          onForked={(id) => navigate(`/templates/onboarding/${id}`)}
        />
      ) : null}
    </section>
  );
}
