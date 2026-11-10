import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  CheckinFormTemplateDetail,
  CheckinStandardKey,
} from "@fitbud/contracts";
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
  checkinDraftSections,
  checkinFieldTypeLabel,
  draftsFromCheckinFields,
  duplicateCheckinFieldDraft,
  measurementTypeOptions,
  missingStandardGroups,
  moveCustomDraft,
  moveStandardGroup,
  normalizeCheckinDraftOrder,
  ownQuestionFeedsChart,
  setStandardGroupKeys,
  STANDARD_KEY_PICKER_COPY,
  updateStandardGroup,
  type CheckinFieldDraft,
  type StandardCheckinGroup,
  type StandardCheckinGroupId,
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

const sectionHeadStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  gap: "0.75rem",
  margin: "0.25rem 0 0.5rem",
};
const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--mid-grey)",
};
const rowHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  minHeight: 44,
};
const rowToggleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: 0,
  border: 0,
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  color: "inherit",
};
const rowSubStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--mid-grey)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%",
};
const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "0.2rem 0.6rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  background: "var(--pale-lavender)",
  color: "var(--indigo)",
};
const mutedBadgeStyle: CSSProperties = {
  ...badgeStyle,
  background: "transparent",
  border: "1px solid #e7e9f2",
  color: "var(--mid-grey)",
};
const hintStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--mid-grey)",
  margin: "0.25rem 0 0.75rem",
};

function requiredText(required: boolean): string {
  return required ? "required" : "optional";
}

function standardSubtitle(
  group: StandardCheckinGroup,
  drafts: CheckinFieldDraft[],
): string {
  const required = requiredText(drafts.some((draft) => draft.required));
  if (group.keys.length > 1) {
    const picked = drafts
      .map((draft) =>
        (STANDARD_KEY_PICKER_COPY[draft.key!]?.label ?? draft.label).toLowerCase(),
      )
      .join(", ");
    return group.id === "body"
      ? `${picked} · cm · ${required}`
      : `${picked} · ${required}`;
  }
  return `${group.kind} · ${required}`;
}

function ownSubtitle(draft: CheckinFieldDraft): string {
  return `${checkinFieldTypeLabel(draft.type).toLowerCase()} · ${requiredText(draft.required)}`;
}

/** Multi-select for the keys of a standard group (frame 171b). */
function StandardKeyPicker({
  group,
  selected,
  disabled,
  onChange,
}: {
  group: StandardCheckinGroup;
  selected: CheckinStandardKey[];
  disabled: boolean;
  onChange: (keys: CheckinStandardKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const labelId = useId();
  const isBody = group.id === "body";
  const title = isBody ? "Measurements to collect" : "Photos to collect";

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="field" style={{ position: "relative" }}>
      <span id={labelId}>{title}</span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          flexWrap: "wrap",
          minHeight: 44,
          width: "100%",
          padding: "0.35rem 2rem 0.35rem 0.5rem",
          border: `1px solid ${open ? "var(--indigo)" : "#e7e9f2"}`,
          borderRadius: 12,
          background: "#fff",
          textAlign: "left",
          cursor: disabled ? "default" : "pointer",
          position: "relative",
          font: "inherit",
        }}
      >
        {selected.map((key) => (
          <span key={key} style={badgeStyle}>
            {STANDARD_KEY_PICKER_COPY[key]?.label ?? key}
          </span>
        ))}
        <span
          aria-hidden
          style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)" }}
        >
          ▾
        </span>
      </button>
      <span style={hintStyle}>Clients see only the ones you pick.</span>
      {open ? (
        <div
          ref={panelRef}
          id={listId}
          role="group"
          aria-label={title}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
          style={{
            position: "absolute",
            zIndex: 5,
            left: 0,
            right: 0,
            top: "4.75rem",
            background: "#fff",
            border: "1px solid #e7e9f2",
            borderRadius: 14,
            boxShadow: "var(--shadow)",
            padding: "0.4rem",
          }}
        >
          {group.keys.map((key) => {
            const checked = selected.includes(key);
            const copy = STANDARD_KEY_PICKER_COPY[key];
            const lastOne = checked && selected.length === 1;
            return (
              <label
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  minHeight: 48,
                  padding: "0.35rem 0.6rem",
                  borderRadius: 10,
                  background: checked ? "var(--pale-lavender)" : "transparent",
                  cursor: lastOne ? "default" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={lastOne}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, key]
                        : selected.filter((value) => value !== key),
                    )
                  }
                  style={{ width: 20, height: 20 }}
                />
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600 }}>{copy?.label ?? key}</span>
                  {copy?.hint ? (
                    <span style={{ fontSize: "0.8rem", color: "var(--mid-grey)" }}>
                      {copy.hint}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              borderTop: "1px solid #e7e9f2",
              marginTop: "0.4rem",
              padding: "0.5rem 0.4rem 0.1rem 0.6rem",
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "var(--mid-grey)" }}>
              {selected.length} picked{isBody ? " · all in cm" : ""}
            </span>
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CheckinTemplateBuilderPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const [detail, setDetail] = useState<CheckinFormTemplateDetail | null>(null);
  const [drafts, setDrafts] = useState<CheckinFieldDraft[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
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
        setDrafts(
          normalizeCheckinDraftOrder(draftsFromCheckinFields(latest?.fields ?? [])),
        );
      })
      .catch((err: unknown) =>
        setLoadError(errorText(err, "Could not load this check-in form.")),
      );
  }, [templateId]);

  useEffect(() => load(), [load]);

  const nextVersion = (detail?.latestVersionNumber ?? 0) + 1;
  const readOnly = detail?.ownership === "global";
  const sections = useMemo(() => checkinDraftSections(drafts), [drafts]);
  const missing = useMemo(() => missingStandardGroups(drafts), [drafts]);
  const dupLabels = useMemo(() => duplicateCheckinLabels(drafts), [drafts]);
  const previewFields = useMemo(() => {
    const built = buildCheckinFields(
      drafts.map((d) =>
        d.label.trim() ? d : { ...d, label: d.label || "Untitled" },
      ),
    );
    return built.ok ? built.fields : [];
  }, [drafts]);

  function updateDraft(id: string, patch: Partial<CheckinFieldDraft>) {
    setDrafts((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function addOwnQuestion() {
    const draft = blankCheckinField();
    setDrafts((current) => normalizeCheckinDraftOrder([...current, draft]));
    setExpanded(draft.id);
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
      setDrafts(
        normalizeCheckinDraftOrder(draftsFromCheckinFields(next?.fields ?? [])),
      );
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

  function renderStandardRow(
    group: StandardCheckinGroup,
    groupDrafts: CheckinFieldDraft[],
    index: number,
  ) {
    const first = groupDrafts[0]!;
    const isOpen = expanded === group.id;
    const panelId = `checkin-std-${group.id}`;
    const groupId: StandardCheckinGroupId = group.id;
    return (
      <li
        key={group.id}
        className="form-question-card"
        data-testid={`standard-question-${group.id}`}
        style={isOpen ? { borderColor: "var(--indigo)" } : undefined}
      >
        <div style={rowHeadStyle}>
          <span className="drag-handle" aria-hidden>
            ⋮⋮
          </span>
          <button
            type="button"
            style={rowToggleStyle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => setExpanded(isOpen ? null : group.id)}
          >
            <strong>{group.title}</strong>
            <span style={rowSubStyle}>{standardSubtitle(group, groupDrafts)}</span>
          </button>
          <span style={badgeStyle}>{group.charted ? "Charted" : "Standard"}</span>
        </div>
        {isOpen ? (
          <div id={panelId} style={{ marginTop: "0.75rem" }}>
            <div className="field">
              <label htmlFor={`${panelId}-question`}>Question</label>
              <input
                id={`${panelId}-question`}
                value={group.title}
                readOnly
                disabled
                aria-describedby={`${panelId}-fixed`}
              />
              <span id={`${panelId}-fixed`} style={hintStyle}>
                Wording is fixed for standard questions.
              </span>
            </div>
            {group.keys.length > 1 ? (
              <StandardKeyPicker
                group={group}
                selected={groupDrafts.map((draft) => draft.key!)}
                disabled={readOnly}
                onChange={(keys) =>
                  setDrafts((current) => setStandardGroupKeys(current, groupId, keys))
                }
              />
            ) : null}
            {group.id === "body" ? (
              <p style={hintStyle}>Saved and charted in cm.</p>
            ) : null}
            <label className="field">
              <span>Tip for the client</span>
              <input
                value={first.helpText}
                disabled={readOnly}
                onChange={(event) =>
                  setDrafts((current) =>
                    updateStandardGroup(current, groupId, {
                      helpText: event.target.value,
                    }),
                  )
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={first.required}
                disabled={readOnly}
                onChange={(event) =>
                  setDrafts((current) =>
                    updateStandardGroup(current, groupId, {
                      required: event.target.checked,
                    }),
                  )
                }
              />
              <span>Required</span>
            </label>
            {group.id === "body" ? (
              <p style={hintStyle}>
                Each value saves as a measurement and charts in Progress › Body.
                Need something we don't list? Add it as your own question; it
                shows in review but isn't charted.
              </p>
            ) : null}
            {!readOnly ? (
              <div className="form-question-toolbar" style={{ marginTop: "0.75rem" }}>
                <Button
                  variant="tertiary"
                  disabled={index === 0}
                  onClick={() => setDrafts((current) => moveStandardGroup(current, groupId, -1))}
                >
                  Up
                </Button>
                <Button
                  variant="tertiary"
                  disabled={index === sections.standard.length - 1}
                  onClick={() => setDrafts((current) => moveStandardGroup(current, groupId, 1))}
                >
                  Down
                </Button>
                <Button
                  variant="tertiary"
                  onClick={() => {
                    setDrafts((current) => setStandardGroupKeys(current, groupId, []));
                    setExpanded(null);
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  }

  function renderOwnRow(draft: CheckinFieldDraft, index: number) {
    const isOpen = expanded === draft.id;
    const panelId = `checkin-own-${draft.id}`;
    const invalidLabel =
      !draft.label.trim() || dupLabels.includes(draft.label.trim().toLowerCase());
    return (
      <li
        key={draft.id}
        className="form-question-card"
        style={isOpen ? { borderColor: "var(--indigo)" } : undefined}
      >
        <div style={rowHeadStyle}>
          <span className="drag-handle" aria-hidden>
            ⋮⋮
          </span>
          <button
            type="button"
            style={rowToggleStyle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => setExpanded(isOpen ? null : draft.id)}
          >
            <strong>{draft.label.trim() || "Untitled question"}</strong>
            <span style={rowSubStyle}>{ownSubtitle(draft)}</span>
          </button>
          {ownQuestionFeedsChart(draft) ? (
            <span style={badgeStyle}>Charted</span>
          ) : (
            <span style={mutedBadgeStyle}>Not charted</span>
          )}
        </div>
        {isOpen ? (
          <div id={panelId} style={{ marginTop: "0.75rem" }}>
            <label className="field">
              <span>Label</span>
              <input
                value={draft.label}
                disabled={readOnly}
                aria-invalid={invalidLabel}
                onChange={(event) => updateDraft(draft.id, { label: event.target.value })}
              />
              {!draft.label.trim() ? (
                <span className="field-error">Enter a label.</span>
              ) : null}
              {draft.label.trim() &&
              dupLabels.includes(draft.label.trim().toLowerCase()) ? (
                <span className="field-error">Another question uses this label.</span>
              ) : null}
            </label>
            <label className="field">
              <span>Help text</span>
              <input
                value={draft.helpText}
                disabled={readOnly}
                onChange={(event) => updateDraft(draft.id, { helpText: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Type</span>
              <select
                value={draft.type}
                disabled={readOnly}
                onChange={(event) =>
                  updateDraft(draft.id, {
                    type: event.target.value as CheckinFieldDraft["type"],
                  })
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
                onChange={(event) => updateDraft(draft.id, { required: event.target.checked })}
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
                      updateDraft(draft.id, {
                        measurementType: event.target
                          .value as CheckinFieldDraft["measurementType"],
                      })
                    }
                  >
                    {measurementTypeOptions(draft.measurementType).map((option) => (
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
                      onChange={(event) => updateDraft(draft.id, { unit: event.target.value })}
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
                    updateDraft(draft.id, {
                      photoSlot: event.target.value as CheckinFieldDraft["photoSlot"],
                    })
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
                    onChange={(event) => updateDraft(draft.id, { lowLabel: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>5 · high label</span>
                  <input
                    value={draft.highLabel}
                    disabled={readOnly}
                    onChange={(event) => updateDraft(draft.id, { highLabel: event.target.value })}
                  />
                </label>
              </>
            ) : null}
            {draft.type === "single_choice" || draft.type === "multiple_choice" ? (
              <fieldset className="templates-options">
                <legend>Choices</legend>
                {draft.options.map((option, optionIndex) => (
                  <div key={option.id} className="templates-option-row">
                    <input
                      value={option.label}
                      disabled={readOnly}
                      placeholder={`Option ${optionIndex + 1}`}
                      onChange={(event) =>
                        updateDraft(draft.id, {
                          options: draft.options.map((opt) =>
                            opt.id === option.id
                              ? { ...opt, label: event.target.value }
                              : opt,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </fieldset>
            ) : null}
            {!readOnly ? (
              <div className="form-question-toolbar" style={{ marginTop: "0.75rem" }}>
                <Button
                  variant="tertiary"
                  disabled={index === 0}
                  onClick={() => setDrafts((current) => moveCustomDraft(current, draft.id, -1))}
                >
                  Up
                </Button>
                <Button
                  variant="tertiary"
                  disabled={index === sections.custom.length - 1}
                  onClick={() => setDrafts((current) => moveCustomDraft(current, draft.id, 1))}
                >
                  Down
                </Button>
                <Button
                  variant="tertiary"
                  onClick={() =>
                    setDrafts((current) => {
                      const at = current.findIndex((row) => row.id === draft.id);
                      const next = [...current];
                      next.splice(at + 1, 0, duplicateCheckinFieldDraft(draft));
                      return next;
                    })
                  }
                >
                  Duplicate
                </Button>
                <Button
                  variant="tertiary"
                  onClick={() =>
                    setDrafts((current) => current.filter((row) => row.id !== draft.id))
                  }
                >
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </li>
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
          {drafts.length === 0 && readOnly ? (
            <EmptyState title="No questions yet." />
          ) : (
            <>
              <div style={sectionHeadStyle}>
                <h2 style={sectionTitleStyle}>Standard questions</h2>
                <span style={{ fontSize: "0.8rem", color: "var(--mid-grey)" }}>
                  Charted in Progress, same wording for every client
                </span>
              </div>
              {sections.standard.length > 0 ? (
                <ul className="form-question-list" aria-label="Standard questions">
                  {sections.standard.map((entry, index) =>
                    renderStandardRow(entry.group, entry.drafts, index),
                  )}
                </ul>
              ) : (
                <p className="muted">No standard questions on this form.</p>
              )}
              {!readOnly && missing.length > 0 ? (
                <label className="field" style={{ maxWidth: 320, marginBottom: "1rem" }}>
                  <span>Add a standard question</span>
                  <select
                    value=""
                    onChange={(event) => {
                      const id = event.target.value as StandardCheckinGroupId;
                      if (!id) return;
                      const group = missing.find((row) => row.id === id);
                      if (!group) return;
                      setDrafts((current) =>
                        setStandardGroupKeys(current, id, group.keys),
                      );
                      setExpanded(id);
                    }}
                  >
                    <option value="">Choose…</option>
                    {missing.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div style={sectionHeadStyle}>
                <h2 style={sectionTitleStyle}>Your own questions</h2>
                <span style={{ fontSize: "0.8rem", color: "var(--mid-grey)" }}>
                  Shown in check-in review. Not charted.
                </span>
              </div>
              {sections.custom.length > 0 ? (
                <ul className="form-question-list" aria-label="Your own questions">
                  {sections.custom.map((draft, index) => renderOwnRow(draft, index))}
                </ul>
              ) : (
                <p className="muted">No questions of your own yet.</p>
              )}
              {!readOnly ? (
                <div className="button-row">
                  <Button variant="secondary" onClick={addOwnQuestion}>
                    <span aria-hidden>+ </span>Add your own question
                  </Button>
                </div>
              ) : null}
            </>
          )}
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
