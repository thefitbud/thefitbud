import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CheckinFormTemplateDetail } from "@fitbud/contracts";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Eye,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, Pill, SidePanel, Toggle } from "../../components/ui";
import { BuilderLayout, useBuilderMode } from "../../components/builder/BuilderLayout";
import "../../components/builder/builder.css";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../../components/StatePanels";
import { useOnline } from "../../hooks/useOnline";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import {
  addedStandardKeys,
  addStandardKeys,
  blankCheckinField,
  buildCheckinFields,
  CHECKIN_FIELD_TYPES,
  checkinDraftSections,
  checkinFieldTypeLabel,
  draftsFromCheckinFields,
  duplicateCheckinFieldDraft,
  measurementTypeOptions,
  moveCustomDraft,
  moveStandardGroup,
  normalizeCheckinDraftOrder,
  ownQuestionFeedsChart,
  setStandardGroupKeys,
  standardKeyCopy,
  STANDARD_CHECKIN_GROUPS,
  STANDARD_KEY_PICKER_COPY,
  updateStandardGroup,
  type CheckinFieldDraft,
  type StandardCheckinGroup,
  type StandardCheckinGroupId,
} from "./checkinBuilder";
import { CheckinMeasurePicker } from "./CheckinMeasurePicker";
import { standardRowIcon, typeRowIcon } from "./checkinIcons";
import { FormPhonePreview } from "./FormPhonePreview";
import { ForkTemplateModal } from "./ForkTemplateModal";
import { errorText } from "./shared";
import "./CheckinTemplateBuilderPage.css";

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

type Row =
  | {
      kind: "standard";
      id: string;
      group: StandardCheckinGroup;
      drafts: CheckinFieldDraft[];
    }
  | { kind: "own"; id: string; draft: CheckinFieldDraft };

function rowTitle(row: Row): string {
  return row.kind === "standard" ? row.group.title : row.draft.label.trim() || "Untitled question";
}

function rowSubtitle(row: Row): string {
  return row.kind === "standard"
    ? standardSubtitle(row.group, row.drafts)
    : ownSubtitle(row.draft);
}

function rowDraftIds(row: Row): string[] {
  return row.kind === "standard" ? row.drafts.map((draft) => draft.id) : [row.draft.id];
}

function RowIcon({ row }: { row: Row }) {
  const Icon =
    row.kind === "standard"
      ? standardRowIcon(row.group.keys[0]!)
      : typeRowIcon(row.draft.type);
  return (
    <span className="ck-tile" aria-hidden>
      <Icon className="ui-i" strokeWidth={1.75} />
    </span>
  );
}

type PickerState =
  | null
  | { mode: "add" }
  | { mode: "edit"; groupId: StandardCheckinGroupId };

export function CheckinTemplateBuilderPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const mode = useBuilderMode();
  const idBase = useId();
  const [detail, setDetail] = useState<CheckinFormTemplateDetail | null>(null);
  const [drafts, setDrafts] = useState<CheckinFieldDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [showFork, setShowFork] = useState(false);
  const [picker, setPicker] = useState<PickerState>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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
  const rows = useMemo<Row[]>(
    () => [
      ...sections.standard.map(
        (entry): Row => ({
          kind: "standard",
          id: `std:${entry.group.id}`,
          group: entry.group,
          drafts: entry.drafts,
        }),
      ),
      ...sections.custom.map((draft): Row => ({ kind: "own", id: `own:${draft.id}`, draft })),
    ],
    [sections],
  );
  const activeIndex = Math.max(
    0,
    rows.findIndex((row) => row.id === selectedId),
  );
  const active = rows[activeIndex] ?? null;
  const allAdded = addedStandardKeys(drafts).length >= STANDARD_CHECKIN_GROUPS.flatMap((g) => g.keys).length;
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
    setSelectedId(`own:${draft.id}`);
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

  const total = rows.length;
  const standardRows = rows.filter((row) => row.kind === "standard");
  const ownRows = rows.filter((row) => row.kind === "own");

  function renderRow(row: Row) {
    const isActive = active?.id === row.id;
    const charted =
      row.kind === "own"
        ? ownQuestionFeedsChart(row.draft)
        : false;
    return (
      <li
        key={row.id}
        className={isActive ? "ck-row is-selected" : "ck-row"}
        data-testid={row.kind === "standard" ? `standard-question-${row.group.id}` : `own-question-${row.draft.id}`}
      >
        <button
          type="button"
          className="ck-row-btn"
          aria-current={isActive ? "true" : undefined}
          onClick={() => setSelectedId(row.id)}
        >
          <RowIcon row={row} />
          <span className="ck-row-copy">
            <span className="ck-row-title">{rowTitle(row)}</span>
            <span className="ck-row-sub">{rowSubtitle(row)}</span>
          </span>
          {charted ? <Pill tone="done">Charted</Pill> : null}
        </button>
      </li>
    );
  }

  const questionList = (
    <div className="ck-list">
      {drafts.length === 0 && readOnly ? (
        <EmptyState title="No questions yet." />
      ) : (
        <>
          <h2 className="ck-list-head">Standard · charted in Progress</h2>
          {standardRows.length > 0 ? (
            <ul className="ck-rows" aria-label="Standard questions">
              {standardRows.map(renderRow)}
            </ul>
          ) : (
            <p className="ck-empty">No standard questions on this form.</p>
          )}
          {!readOnly && !allAdded ? (
            <Button
              variant="quiet"
              className="ck-add"
              onClick={() => setPicker({ mode: "add" })}
            >
              <Plus className="ui-i" strokeWidth={1.75} aria-hidden />
              Add standard measure
            </Button>
          ) : null}
          <h2 className="ck-list-head ck-list-head-own">Your questions</h2>
          <p className="ck-list-note">Shown in check-in review. Not charted.</p>
          {ownRows.length > 0 ? (
            <ul className="ck-rows" aria-label="Your own questions">
              {ownRows.map(renderRow)}
            </ul>
          ) : (
            <p className="ck-empty">No questions of your own yet.</p>
          )}
          {!readOnly ? (
            <Button variant="quiet" className="ck-add" onClick={addOwnQuestion}>
              <Plus className="ui-i" strokeWidth={1.75} aria-hidden />
              Add your own question
            </Button>
          ) : null}
        </>
      )}
    </div>
  );

  function renderStandardCard(row: Extract<Row, { kind: "standard" }>) {
    const { group, drafts: groupDrafts } = row;
    const first = groupDrafts[0]!;
    const groupId: StandardCheckinGroupId = group.id;
    const panelId = `${idBase}-std-${group.id}`;
    const pickerTitle = group.id === "photos" ? "Photos to collect" : "Measurements to collect";
    const standardIndex = sections.standard.findIndex((entry) => entry.group.id === group.id);
    return (
      <>
        <div className="ck-field">
          <label className="ck-lbl" htmlFor={`${panelId}-question`}>
            Question
          </label>
          <input
            id={`${panelId}-question`}
            className="ck-input"
            value={group.title}
            readOnly
            disabled
            aria-describedby={`${panelId}-fixed`}
          />
          <span id={`${panelId}-fixed`} className="ck-help">
            Wording is fixed for standard questions.
          </span>
        </div>
        {group.keys.length > 1 ? (
          <div className="ck-field">
            <span className="ck-lbl" id={`${panelId}-pick`}>
              {pickerTitle}
            </span>
            <button
              type="button"
              className="ck-picker-trigger"
              disabled={readOnly}
              aria-labelledby={`${panelId}-pick`}
              aria-haspopup="dialog"
              onClick={() => setPicker({ mode: "edit", groupId })}
            >
              <span className="ck-chips">
                {groupDrafts.map((draft) => (
                  <span key={draft.id} className="ck-chip">
                    {standardKeyCopy(draft.key!).label}
                  </span>
                ))}
              </span>
              <span className="ck-picker-change">Change</span>
            </button>
            <span className="ck-help">
              Clients see only the ones you pick.
              {group.id === "body" ? " Saved and charted in cm." : ""}
            </span>
          </div>
        ) : null}
        <div className="ck-field">
          <label className="ck-lbl" htmlFor={`${panelId}-tip`}>
            Tip for the client
          </label>
          <input
            id={`${panelId}-tip`}
            className="ck-input"
            value={first.helpText}
            disabled={readOnly}
            onChange={(event) =>
              setDrafts((current) =>
                updateStandardGroup(current, groupId, { helpText: event.target.value }),
              )
            }
          />
        </div>
        <div className="ck-toggles">
          <RequiredToggle
            checked={first.required}
            disabled={readOnly}
            onChange={(required) =>
              setDrafts((current) => updateStandardGroup(current, groupId, { required }))
            }
          />
        </div>
        {group.id === "body" ? (
          <p className="ck-help">
            Each value saves as a measurement and charts in Progress › Body. Need something we
            don&apos;t list? Add it as your own question; it shows in review but isn&apos;t
            charted.
          </p>
        ) : null}
        {!readOnly ? (
          <div className="ck-moves">
            <Button
              variant="quiet"
              size="sm"
              disabled={standardIndex === 0}
              onClick={() => setDrafts((current) => moveStandardGroup(current, groupId, -1))}
            >
              <ArrowUp className="ui-i" strokeWidth={1.75} aria-hidden />
              Up
            </Button>
            <Button
              variant="quiet"
              size="sm"
              disabled={standardIndex === sections.standard.length - 1}
              onClick={() => setDrafts((current) => moveStandardGroup(current, groupId, 1))}
            >
              <ArrowDown className="ui-i" strokeWidth={1.75} aria-hidden />
              Down
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  function renderOwnCard(row: Extract<Row, { kind: "own" }>) {
    const draft = row.draft;
    const panelId = `${idBase}-own-${draft.id}`;
    const ownIndex = sections.custom.findIndex((entry) => entry.id === draft.id);
    const invalidLabel =
      !draft.label.trim() || dupLabels.includes(draft.label.trim().toLowerCase());
    return (
      <>
        <div className="ck-field">
          <label className="ck-lbl" htmlFor={`${panelId}-label`}>
            Question
          </label>
          <input
            id={`${panelId}-label`}
            className="ck-input"
            value={draft.label}
            disabled={readOnly}
            aria-invalid={invalidLabel}
            onChange={(event) => updateDraft(draft.id, { label: event.target.value })}
          />
          {!draft.label.trim() ? <span className="ck-error">Enter a label.</span> : null}
          {draft.label.trim() && dupLabels.includes(draft.label.trim().toLowerCase()) ? (
            <span className="ck-error">Another question uses this label.</span>
          ) : null}
        </div>
        <div className="ck-field">
          <label className="ck-lbl" htmlFor={`${panelId}-type`}>
            Answer type
          </label>
          <select
            id={`${panelId}-type`}
            className="ck-input"
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
        </div>
        {draft.type === "scale_1_5" ? (
          <div className="ck-pair">
            <div className="ck-field">
              <label className="ck-lbl" htmlFor={`${panelId}-low`}>
                Label for 1
              </label>
              <input
                id={`${panelId}-low`}
                className="ck-input"
                value={draft.lowLabel}
                disabled={readOnly}
                onChange={(event) => updateDraft(draft.id, { lowLabel: event.target.value })}
              />
            </div>
            <div className="ck-field">
              <label className="ck-lbl" htmlFor={`${panelId}-high`}>
                Label for 5
              </label>
              <input
                id={`${panelId}-high`}
                className="ck-input"
                value={draft.highLabel}
                disabled={readOnly}
                onChange={(event) => updateDraft(draft.id, { highLabel: event.target.value })}
              />
            </div>
          </div>
        ) : null}
        {draft.type === "measurement" ? (
          <>
            <div className="ck-field">
              <label className="ck-lbl" htmlFor={`${panelId}-metric`}>
                Metric
              </label>
              <select
                id={`${panelId}-metric`}
                className="ck-input"
                value={draft.measurementType}
                disabled={readOnly}
                onChange={(event) =>
                  updateDraft(draft.id, {
                    measurementType: event.target.value as CheckinFieldDraft["measurementType"],
                  })
                }
              >
                {measurementTypeOptions(draft.measurementType).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {draft.measurementType === "other" ? (
              <div className="ck-field">
                <label className="ck-lbl" htmlFor={`${panelId}-unit`}>
                  Unit
                </label>
                <input
                  id={`${panelId}-unit`}
                  className="ck-input"
                  value={draft.unit}
                  disabled={readOnly}
                  onChange={(event) => updateDraft(draft.id, { unit: event.target.value })}
                />
              </div>
            ) : null}
          </>
        ) : null}
        {draft.type === "photo_intent" ? (
          <div className="ck-field">
            <label className="ck-lbl" htmlFor={`${panelId}-slot`}>
              Photo slot
            </label>
            <select
              id={`${panelId}-slot`}
              className="ck-input"
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
          </div>
        ) : null}
        {draft.type === "single_choice" || draft.type === "multiple_choice" ? (
          <fieldset className="ck-choices">
            <legend className="ck-lbl">Choices</legend>
            {draft.options.map((option, optionIndex) => (
              <input
                key={option.id}
                className="ck-input"
                value={option.label}
                disabled={readOnly}
                aria-label={`Choice ${optionIndex + 1}`}
                placeholder={`Option ${optionIndex + 1}`}
                onChange={(event) =>
                  updateDraft(draft.id, {
                    options: draft.options.map((opt) =>
                      opt.id === option.id ? { ...opt, label: event.target.value } : opt,
                    ),
                  })
                }
              />
            ))}
          </fieldset>
        ) : null}
        <div className="ck-field">
          <label className="ck-lbl" htmlFor={`${panelId}-help`}>
            Help text <span className="ck-opt">(optional)</span>
          </label>
          <input
            id={`${panelId}-help`}
            className="ck-input"
            value={draft.helpText}
            placeholder="Shown under the question"
            disabled={readOnly}
            onChange={(event) => updateDraft(draft.id, { helpText: event.target.value })}
          />
        </div>
        <div className="ck-toggles">
          <RequiredToggle
            checked={draft.required}
            disabled={readOnly}
            onChange={(required) => updateDraft(draft.id, { required })}
          />
        </div>
        {!readOnly ? (
          <div className="ck-moves">
            <Button
              variant="quiet"
              size="sm"
              disabled={ownIndex === 0}
              onClick={() => setDrafts((current) => moveCustomDraft(current, draft.id, -1))}
            >
              <ArrowUp className="ui-i" strokeWidth={1.75} aria-hidden />
              Up
            </Button>
            <Button
              variant="quiet"
              size="sm"
              disabled={ownIndex === sections.custom.length - 1}
              onClick={() => setDrafts((current) => moveCustomDraft(current, draft.id, 1))}
            >
              <ArrowDown className="ui-i" strokeWidth={1.75} aria-hidden />
              Down
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                const copy = duplicateCheckinFieldDraft(draft);
                setDrafts((current) => {
                  const at = current.findIndex((entry) => entry.id === draft.id);
                  const next = [...current];
                  next.splice(at + 1, 0, copy);
                  return next;
                });
                setSelectedId(`own:${copy.id}`);
              }}
            >
              <Copy className="ui-i" strokeWidth={1.75} aria-hidden />
              Duplicate
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  function removeActive() {
    if (!active || readOnly) return;
    if (active.kind === "standard") {
      const groupId = active.group.id;
      setDrafts((current) => setStandardGroupKeys(current, groupId, []));
    } else {
      const id = active.draft.id;
      setDrafts((current) => current.filter((row) => row.id !== id));
    }
    setSelectedId(null);
  }

  const propertiesCard = active ? (
    <section className="ck-card" aria-label="Question details" data-testid="checkin-question-card">
      <header className="ck-card-head">
        <h2 className="ck-card-title">
          Question {activeIndex + 1} of {total}
        </h2>
        <span className="ck-card-kind">
          {active.kind === "standard"
            ? active.group.charted
              ? "Standard · charted"
              : "Standard"
            : ownQuestionFeedsChart(active.draft)
              ? "Your question · charted"
              : "Your question"}
        </span>
        {!readOnly ? (
          <Button variant="quiet" size="sm" onClick={removeActive}>
            <Trash2 className="ui-i" strokeWidth={1.75} aria-hidden />
            {active.kind === "standard" ? "Remove" : "Delete"}
          </Button>
        ) : null}
      </header>
      <div className="ck-card-body" key={active.id}>
        {active.kind === "standard" ? renderStandardCard(active) : renderOwnCard(active)}
      </div>
    </section>
  ) : (
    <section className="ck-card" aria-label="Question details">
      <p className="ck-empty">
        {readOnly ? "No questions on this form." : "Add a question to start."}
      </p>
    </section>
  );

  const previewPane = (
    <div className="ck-preview">
      <header className="ck-preview-head">
        <h2 className="builder-pane-title">Preview</h2>
        <span className="ck-preview-note">As a client sees it</span>
      </header>
      <FormPhonePreview
        fields={previewFields}
        title={detail.name}
        activeIds={active ? rowDraftIds(active) : undefined}
      />
    </div>
  );

  const countText = `${total} ${total === 1 ? "question" : "questions"}`;
  const topbar = (
    <>
      <div className="builder-topbar-main">
        <Link
          className="builder-back"
          to="/templates/checkins"
          aria-label="Back to check-in forms"
          title="Back to check-in forms"
        >
          <ArrowLeft className="ui-i" strokeWidth={1.75} aria-hidden />
        </Link>
        <div className="builder-titleline">
          <div className="builder-title-row">
            <h1 className="ck-title">{detail.name}</h1>
            <span className="builder-draft-pill" data-testid="builder-version-pill">
              <Pill
                tone={readOnly ? "info" : "neutral"}
                icon={
                  readOnly ? (
                    <Check className="ui-i" strokeWidth={2} aria-hidden />
                  ) : (
                    <Pencil className="ui-i" strokeWidth={1.75} aria-hidden />
                  )
                }
              >
                {readOnly
                  ? `FitBud base · v${detail.latestVersionNumber}`
                  : `Draft · v${nextVersion}`}
              </Pill>
            </span>
            <p className="builder-status">
              {readOnly ? "Read-only · " : ""}
              {countText}
            </p>
          </div>
        </div>
      </div>
      <div className="builder-topbar-actions">
        {mode === "narrow" ? (
          <Button
            variant="secondary"
            aria-expanded={previewOpen}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="ui-i" strokeWidth={1.75} aria-hidden />
            Preview
          </Button>
        ) : null}
        {mode === "small" ? null : readOnly ? (
          <Button variant="primary" onClick={() => setShowFork(true)}>
            Fork to edit
          </Button>
        ) : (
          <Button variant="primary" disabled={acting} onClick={() => void saveVersion()}>
            {acting ? "Saving…" : "Save version"}
          </Button>
        )}
      </div>
    </>
  );

  const banner =
    message || saveError ? (
      <>
        {message ? (
          <p className="builder-banner is-info" role="status">
            {message}
          </p>
        ) : null}
        {saveError ? (
          <p className="builder-banner is-attention" role="alert">
            {saveError}
          </p>
        ) : null}
      </>
    ) : null;

  const smallScreen = (
    <article className="ck-readonly" data-testid="checkin-readonly-summary">
      <ul className="ck-rows" aria-label="Questions">
        {rows.map((row) => (
          <li key={row.id} className="ck-row">
            <div className="ck-row-btn">
              <RowIcon row={row} />
              <span className="ck-row-copy">
                <span className="ck-row-title">{rowTitle(row)}</span>
                <span className="ck-row-sub">{rowSubtitle(row)}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );

  const wide = mode === "wide";
  return (
    <section className="page builder-v3 checkin-builder-page" data-testid="screen-TW-25">
      <BuilderLayout
        mode={mode}
        topbar={topbar}
        banner={banner}
        left={questionList}
        center={wide ? propertiesCard : questionList}
        right={wide ? previewPane : propertiesCard}
        smallScreen={smallScreen}
      />
      <SidePanel open={previewOpen && mode === "narrow"} onClose={() => setPreviewOpen(false)} title="Preview">
        <FormPhonePreview
          fields={previewFields}
          title={detail.name}
          activeIds={active ? rowDraftIds(active) : undefined}
        />
      </SidePanel>
      {picker?.mode === "add" ? (
        <CheckinMeasurePicker
          mode="add"
          added={addedStandardKeys(drafts)}
          onCancel={() => setPicker(null)}
          onConfirm={(keys) => {
            setDrafts((current) => addStandardKeys(current, keys));
            const first = STANDARD_CHECKIN_GROUPS.find((group) =>
              group.keys.some((key) => keys.includes(key)),
            );
            if (first) setSelectedId(`std:${first.id}`);
            setPicker(null);
          }}
        />
      ) : null}
      {picker?.mode === "edit" ? (
        <CheckinMeasurePicker
          mode="edit"
          groupId={picker.groupId}
          selected={drafts.flatMap((draft) =>
            draft.key &&
            STANDARD_CHECKIN_GROUPS.find((group) => group.id === picker.groupId)!.keys.includes(
              draft.key,
            )
              ? [draft.key]
              : [],
          )}
          onCancel={() => setPicker(null)}
          onConfirm={(keys) => {
            const groupId = picker.groupId;
            setDrafts((current) => setStandardGroupKeys(current, groupId, keys));
            setPicker(null);
          }}
        />
      ) : null}
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

function RequiredToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="ck-toggle-row">
      <Toggle checked={checked} disabled={disabled} labelledBy={id} onChange={onChange} />
      <span id={id} className="ck-toggle-label">
        Required
      </span>
    </div>
  );
}
