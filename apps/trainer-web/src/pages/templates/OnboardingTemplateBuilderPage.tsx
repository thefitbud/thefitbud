import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { OnboardingFormTemplateDetail } from "@fitbud/contracts";
import { Button } from "../../components/Button";
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

export function OnboardingTemplateBuilderPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const [detail, setDetail] = useState<OnboardingFormTemplateDetail | null>(
    null,
  );
  const [drafts, setDrafts] = useState<FieldDraft[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [showFork, setShowFork] = useState(false);

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
        setDrafts(draftsFromFields(latest?.fields ?? []));
      })
      .catch((err: unknown) =>
        setLoadError(errorText(err, "Could not load this onboarding form.")),
      );
  }, [templateId]);

  useEffect(() => load(), [load]);

  const nextVersion = (detail?.latestVersionNumber ?? 0) + 1;
  const readOnly = detail?.ownership === "global";
  const dupLabels = useMemo(() => duplicateLabels(drafts), [drafts]);
  const builtPreview = useMemo(() => {
    const built = buildFields(
      drafts.map((d) =>
        d.label.trim() ? d : { ...d, label: d.label || "Untitled" },
      ),
    );
    return built.ok ? built.fields : [];
  }, [drafts]);

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
      setDrafts(draftsFromFields(next?.fields ?? []));
      setMessage(
        `Saved as v${saved.latestVersionNumber}. Clients already invited keep their version.`,
      );
    } catch (err) {
      setSaveError(errorText(err, "Could not save this version."));
    } finally {
      setActing(false);
    }
  }

  if (loadError) {
    return (
      <section className="page" data-testid="screen-TW-24">
        <ErrorState message={loadError} onRetry={load} screenId="TW-24" />
        <Link to="/templates/onboarding">Back to onboarding</Link>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="page" data-testid="screen-TW-24">
        <LoadingBlock label="Loading form…" />
      </section>
    );
  }

  if (!online) {
    return (
      <section className="page" data-testid="screen-TW-24">
        <ErrorState
          kind="network"
          screenId="TW-24"
          title="You're offline"
          message="Reconnect to edit this form."
        />
      </section>
    );
  }

  return (
    <section className="page form-builder-page" data-testid="screen-TW-24">
      <header className="form-builder-header">
        <div>
          <Link to="/templates/onboarding">← Onboarding forms</Link>
          <h1>{detail.name}</h1>
          <p className="muted">
            {readOnly ? "FitBud base · read-only" : "Mine"} ·{" "}
            {readOnly
              ? `v${detail.latestVersionNumber}`
              : `Draft · will save as v${nextVersion}`}
          </p>
        </div>
        <div className="button-row">
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
              {acting ? "Saving…" : "Save version"}
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

      <div className="form-builder-panes">
        <div className="form-builder-editor" tabIndex={0}>
          {drafts.length === 0 ? (
            <EmptyState title="No questions yet.">
              <Button
                variant="secondary"
                disabled={readOnly}
                onClick={() => setDrafts([blankField()])}
              >
                Add question
              </Button>
            </EmptyState>
          ) : (
            <ul className="form-question-list">
              {drafts.map((draft, index) => (
                <li key={draft.id} className="form-question-card">
                  <div className="form-question-toolbar">
                    <span className="drag-handle" aria-hidden>
                      ⋮⋮
                    </span>
                    <Button
                      variant="tertiary"
                      disabled={readOnly || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      Up
                    </Button>
                    <Button
                      variant="tertiary"
                      disabled={readOnly || index === drafts.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      Down
                    </Button>
                    <Button
                      variant="tertiary"
                      disabled={readOnly}
                      onClick={() =>
                        setDrafts((current) => {
                          const next = [...current];
                          next.splice(index + 1, 0, duplicateFieldDraft(draft));
                          return next;
                        })
                      }
                    >
                      Duplicate
                    </Button>
                    <Button
                      variant="tertiary"
                      disabled={readOnly}
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter((row) => row.id !== draft.id),
                        )
                      }
                    >
                      Delete
                    </Button>
                  </div>
                  <label className="field">
                    <span>Label</span>
                    <input
                      value={draft.label}
                      disabled={readOnly}
                      aria-invalid={
                        !draft.label.trim() ||
                        dupLabels.includes(draft.label.trim().toLowerCase())
                      }
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((row) =>
                            row.id === draft.id
                              ? { ...row, label: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                    {!draft.label.trim() ? (
                      <span className="field-error">Enter a label.</span>
                    ) : null}
                    {draft.label.trim() &&
                    dupLabels.includes(draft.label.trim().toLowerCase()) ? (
                      <span className="field-error">
                        Another question uses this label.
                      </span>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Help text</span>
                    <input
                      value={draft.helpText}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((row) =>
                            row.id === draft.id
                              ? { ...row, helpText: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <select
                      value={draft.type}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((row) =>
                            row.id === draft.id
                              ? withFieldType(
                                  row,
                                  event.target.value as FieldDraft["type"],
                                )
                              : row,
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
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={draft.required}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((row) =>
                            row.id === draft.id
                              ? { ...row, required: event.target.checked }
                              : row,
                          ),
                        )
                      }
                    />
                    <span>Required</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={draft.highlight}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((row) =>
                            row.id === draft.id
                              ? { ...row, highlight: event.target.checked }
                              : row,
                          ),
                        )
                      }
                    />
                    <span>Highlight for coach</span>
                  </label>
                  {isTextType(draft.type) ? (
                    <label className="field">
                      <span>Max length</span>
                      <input
                        value={draft.maxLength}
                        disabled={readOnly}
                        onChange={(event) =>
                          setDrafts((current) =>
                            current.map((row) =>
                              row.id === draft.id
                                ? { ...row, maxLength: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </label>
                  ) : null}
                  {draft.type === "number" ? (
                    <label className="field">
                      <span>Unit</span>
                      <input
                        value={draft.unit}
                        disabled={readOnly}
                        placeholder="kg"
                        onChange={(event) =>
                          setDrafts((current) =>
                            current.map((row) =>
                              row.id === draft.id
                                ? { ...row, unit: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </label>
                  ) : null}
                  {isChoiceType(draft.type) ? (
                    <fieldset className="templates-options">
                      <legend>Choices</legend>
                      {draft.options.map((option, optionIndex) => (
                        <div key={option.id} className="templates-option-row">
                          <input
                            value={option.label}
                            disabled={readOnly}
                            placeholder={`Option ${optionIndex + 1}`}
                            onChange={(event) =>
                              setDrafts((current) =>
                                current.map((row) =>
                                  row.id === draft.id
                                    ? {
                                        ...row,
                                        options: row.options.map((opt) =>
                                          opt.id === option.id
                                            ? {
                                                ...opt,
                                                label: event.target.value,
                                              }
                                            : opt,
                                        ),
                                      }
                                    : row,
                                ),
                              )
                            }
                          />
                          <Button
                            variant="tertiary"
                            disabled={readOnly || draft.options.length <= 2}
                            onClick={() =>
                              setDrafts((current) =>
                                current.map((row) =>
                                  row.id === draft.id
                                    ? {
                                        ...row,
                                        options: row.options.filter(
                                          (opt) => opt.id !== option.id,
                                        ),
                                      }
                                    : row,
                                ),
                              )
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
                          setDrafts((current) =>
                            current.map((row) =>
                              row.id === draft.id
                                ? {
                                    ...row,
                                    options: [
                                      ...row.options,
                                      {
                                        id: crypto.randomUUID(),
                                        label: "",
                                      },
                                    ],
                                  }
                                : row,
                            ),
                          )
                        }
                      >
                        Add option
                      </Button>
                      {draft.options.filter((o) => o.label.trim()).length <
                      2 ? (
                        <p className="form-error">
                          A choice question needs at least 2 options.
                        </p>
                      ) : null}
                    </fieldset>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {!readOnly ? (
            <Button
              variant="secondary"
              onClick={() => setDrafts((current) => [...current, blankField()])}
            >
              Add question
            </Button>
          ) : null}
        </div>
        <FormPhonePreview fields={builtPreview} title={detail.name} />
      </div>

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
