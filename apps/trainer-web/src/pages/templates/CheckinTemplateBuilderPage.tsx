import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CheckinFormTemplateDetail } from "@fitbud/contracts";
import { Button } from "../../components/Button";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../../components/StatePanels";
import { useOnline } from "../../hooks/useOnline";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import {
  blankCheckinField,
  buildCheckinFields,
  CHECKIN_FIELD_TYPES,
  checkinFieldTypeLabel,
  draftsFromCheckinFields,
  duplicateCheckinFieldDraft,
  measurementTypeOptions,
  type CheckinFieldDraft,
} from "./checkinBuilder";
import { FormPhonePreview } from "./FormPhonePreview";
import { ForkTemplateModal } from "./ForkTemplateModal";
import { errorText } from "./shared";

function sortedVersions(detail: CheckinFormTemplateDetail) {
  return [...detail.versions].sort((a, b) => a.version - b.version);
}

function duplicateCheckinLabels(drafts: CheckinFieldDraft[]): string[] {
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

export function CheckinTemplateBuilderPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const [detail, setDetail] = useState<CheckinFormTemplateDetail | null>(null);
  const [drafts, setDrafts] = useState<CheckinFieldDraft[]>([]);
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
      .getCheckinFormTemplate(templateId)
      .then((loaded) => {
        setDetail(loaded);
        const latest =
          sortedVersions(loaded).find((v) => v.id === loaded.latestVersionId) ??
          sortedVersions(loaded).at(-1);
        setDrafts(draftsFromCheckinFields(latest?.fields ?? []));
      })
      .catch((err: unknown) =>
        setLoadError(errorText(err, "Could not load this check-in form.")),
      );
  }, [templateId]);

  useEffect(() => load(), [load]);

  const nextVersion = (detail?.latestVersionNumber ?? 0) + 1;
  const readOnly = detail?.ownership === "global";
  const dupLabels = useMemo(() => duplicateCheckinLabels(drafts), [drafts]);
  const previewFields = useMemo(() => {
    const built = buildCheckinFields(
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
    const built = buildCheckinFields(drafts);
    if (!built.ok) {
      setSaveError(built.error);
      return;
    }
    setActing(true);
    setSaveError(null);
    setMessage(null);
    try {
      const saved = await apiClient.createCheckinFormTemplateVersion(
        detail.id,
        { fields: built.fields },
        createIdempotencyKey(),
      );
      setDetail(saved);
      const next =
        sortedVersions(saved).find((v) => v.id === saved.latestVersionId) ??
        sortedVersions(saved).at(-1);
      setDrafts(draftsFromCheckinFields(next?.fields ?? []));
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
      <section className="page" data-testid="screen-TW-25">
        <ErrorState message={loadError} onRetry={load} screenId="TW-25" />
        <Link to="/templates/checkins">Back to check-ins</Link>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="page" data-testid="screen-TW-25">
        <LoadingBlock label="Loading form…" />
      </section>
    );
  }

  if (!online) {
    return (
      <section className="page" data-testid="screen-TW-25">
        <ErrorState
          kind="network"
          screenId="TW-25"
          title="You're offline"
          message="Reconnect to edit this form."
        />
      </section>
    );
  }

  return (
    <section className="page form-builder-page" data-testid="screen-TW-25">
      <header className="form-builder-header">
        <div>
          <Link to="/templates/checkins">← Check-in forms</Link>
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

      <div className="form-builder-panes">
        <div className="form-builder-editor" tabIndex={0}>
          {drafts.length === 0 ? (
            <EmptyState title="No questions yet.">
              <Button
                variant="secondary"
                disabled={readOnly}
                onClick={() => setDrafts([blankCheckinField()])}
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
                          next.splice(
                            index + 1,
                            0,
                            duplicateCheckinFieldDraft(draft),
                          );
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
                              ? {
                                  ...row,
                                  type: event.target
                                    .value as CheckinFieldDraft["type"],
                                }
                              : row,
                          ),
                        )
                      }
                    >
                      {CHECKIN_FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {checkinFieldTypeLabel(type)}
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
                  {draft.type === "measurement" ? (
                    <>
                      <label className="field">
                        <span>Metric</span>
                        <select
                          value={draft.measurementType}
                          disabled={readOnly}
                          onChange={(event) =>
                            setDrafts((current) =>
                              current.map((row) =>
                                row.id === draft.id
                                  ? {
                                      ...row,
                                      measurementType: event.target
                                        .value as CheckinFieldDraft["measurementType"],
                                    }
                                  : row,
                              ),
                            )
                          }
                        >
                          {measurementTypeOptions().map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {draft.measurementType === "other" ? (
                        <label className="field">
                          <span>Unit</span>
                          <input
                            value={draft.unit}
                            disabled={readOnly}
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
                    </>
                  ) : null}
                  {draft.type === "photo_intent" ? (
                    <label className="field">
                      <span>Photo slot</span>
                      <select
                        value={draft.photoSlot}
                        disabled={readOnly}
                        onChange={(event) =>
                          setDrafts((current) =>
                            current.map((row) =>
                              row.id === draft.id
                                ? {
                                    ...row,
                                    photoSlot: event.target
                                      .value as CheckinFieldDraft["photoSlot"],
                                  }
                                : row,
                            ),
                          )
                        }
                      >
                        <option value="front">Front</option>
                        <option value="side">Side</option>
                        <option value="back">Back</option>
                        <option value="any">Any</option>
                      </select>
                    </label>
                  ) : null}
                  {draft.type === "scale_1_5" ? (
                    <>
                      <label className="field">
                        <span>1 · low label</span>
                        <input
                          value={draft.lowLabel}
                          disabled={readOnly}
                          onChange={(event) =>
                            setDrafts((current) =>
                              current.map((row) =>
                                row.id === draft.id
                                  ? { ...row, lowLabel: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>5 · high label</span>
                        <input
                          value={draft.highLabel}
                          disabled={readOnly}
                          onChange={(event) =>
                            setDrafts((current) =>
                              current.map((row) =>
                                row.id === draft.id
                                  ? { ...row, highLabel: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </label>
                    </>
                  ) : null}
                  {draft.type === "single_choice" ||
                  draft.type === "multiple_choice" ? (
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
                        </div>
                      ))}
                    </fieldset>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {!readOnly ? (
            <div className="button-row">
              <Button
                variant="secondary"
                onClick={() =>
                  setDrafts((current) => [...current, blankCheckinField()])
                }
              >
                Add question
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  setDrafts((current) => [
                    ...current,
                    blankCheckinField("measurement"),
                  ])
                }
              >
                Add measurement
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  setDrafts((current) => [
                    ...current,
                    {
                      ...blankCheckinField("photo_intent"),
                      label: "Front photo",
                      photoSlot: "front",
                    },
                    {
                      ...blankCheckinField("photo_intent"),
                      label: "Side photo",
                      photoSlot: "side",
                    },
                    {
                      ...blankCheckinField("photo_intent"),
                      label: "Back photo",
                      photoSlot: "back",
                    },
                  ])
                }
              >
                Add photo slots
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  setDrafts((current) => [
                    ...current,
                    {
                      ...blankCheckinField("scale_1_5"),
                      label: "Energy",
                    },
                  ])
                }
              >
                Add scale 1–5
              </Button>
            </div>
          ) : null}
        </div>
        <FormPhonePreview fields={previewFields} title={detail.name} />
      </div>

      {showFork ? (
        <ForkTemplateModal
          templateId={detail.id}
          templateTitle={detail.name}
          hubSlug="checkins"
          kind="checkin"
          onClose={() => setShowFork(false)}
          onForked={(id) => navigate(`/templates/checkins/${id}`)}
        />
      ) : null}
    </section>
  );
}
