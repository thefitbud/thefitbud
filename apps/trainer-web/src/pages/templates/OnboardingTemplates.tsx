import { useState, type FormEvent } from "react";
import type {
  OnboardingAnswers,
  OnboardingFieldDefinition,
  OnboardingFormTemplateDetail,
  OnboardingFormTemplateSummary,
} from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { errorText, formatUpdated, matchesName } from "./shared";
import { useCursorPage } from "./useCursorPage";
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

function sortedVersions(detail: OnboardingFormTemplateDetail) {
  return [...detail.versions].sort((left, right) => left.version - right.version);
}

function summaryFromDetail(
  detail: OnboardingFormTemplateDetail,
): OnboardingFormTemplateSummary {
  return {
    id: detail.id,
    ownership: detail.ownership,
    trainerUserId: detail.trainerUserId,
    name: detail.name,
    description: detail.description,
    latestVersionId: detail.latestVersionId,
    latestVersionNumber: detail.latestVersionNumber,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

function optionSummary(field: OnboardingFieldDefinition): string {
  if (field.type === "select") return ` · ${field.options.join(", ")}`;
  if (field.type === "single_choice" || field.type === "multiple_choice") {
    return ` · ${field.options.map((option) => option.label).join(", ")}`;
  }
  if (
    field.type === "text" ||
    field.type === "textarea" ||
    field.type === "short_text" ||
    field.type === "long_text"
  ) {
    return field.maxLength != null ? ` · max ${field.maxLength}` : "";
  }
  return "";
}

function choiceOptions(field: OnboardingFieldDefinition): Array<{ id: string; label: string }> {
  if (field.type === "select") {
    return field.options.map((option) => ({ id: option, label: option }));
  }
  if (field.type === "single_choice" || field.type === "multiple_choice") {
    return field.options;
  }
  return [];
}

function TraineeFormPreview({ fields }: { fields: OnboardingFieldDefinition[] }) {
  const [answers, setAnswers] = useState<OnboardingAnswers>({});

  function setAnswer(fieldId: string, value: OnboardingAnswers[string] | undefined) {
    setAnswers((current) => {
      const next = { ...current };
      if (value === undefined) delete next[fieldId];
      else next[fieldId] = value;
      return next;
    });
  }

  return (
    <div className="templates-preview" aria-label="Trainee form preview">
      <h3>Trainee preview</h3>
      <p className="muted">
        This is the form a trainee would fill in. Answers here are not saved, and this
        form does not branch or score.
      </p>
      {fields.map((field) => {
        const label = `${field.label}${field.required ? " *" : ""}`;
        if (
          field.type === "text" ||
          field.type === "textarea" ||
          field.type === "short_text" ||
          field.type === "long_text"
        ) {
          const stored = answers[field.id];
          const value = typeof stored === "string" ? stored : "";
          const multiline = field.type === "textarea" || field.type === "long_text";
          return (
            <label key={field.id} className="field">
              <span>{label}</span>
              {multiline ? (
                <textarea
                  value={value}
                  maxLength={field.maxLength}
                  rows={4}
                  onChange={(event) => setAnswer(field.id, event.target.value)}
                />
              ) : (
                <input
                  value={value}
                  maxLength={field.maxLength}
                  onChange={(event) => setAnswer(field.id, event.target.value)}
                />
              )}
              {field.helpText ? <span className="muted">{field.helpText}</span> : null}
            </label>
          );
        }
        if (field.type === "number") {
          const value = answers[field.id];
          return (
            <label key={field.id} className="field">
              <span>{label}</span>
              <input
                type="number"
                inputMode="decimal"
                value={typeof value === "number" ? String(value) : ""}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  if (raw === "") {
                    setAnswer(field.id, undefined);
                    return;
                  }
                  const parsed = Number(raw);
                  setAnswer(field.id, Number.isFinite(parsed) ? parsed : undefined);
                }}
              />
              {field.helpText ? <span className="muted">{field.helpText}</span> : null}
            </label>
          );
        }
        if (field.type === "yes_no") {
          const value = answers[field.id];
          return (
            <fieldset key={field.id} className="templates-options">
              <legend>{label}</legend>
              {field.helpText ? <p className="muted">{field.helpText}</p> : null}
              {([
                ["Yes", true],
                ["No", false],
              ] as const).map(([caption, next]) => (
                <label key={caption} className="templates-check">
                  <input
                    type="radio"
                    name={`preview-${field.id}`}
                    checked={value === next}
                    onChange={() => setAnswer(field.id, next)}
                  />
                  <span>{caption}</span>
                </label>
              ))}
            </fieldset>
          );
        }
        const options = choiceOptions(field);
        const multiple = field.type === "multiple_choice";
        const selected = answers[field.id];
        return (
          <fieldset key={field.id} className="templates-options">
            <legend>{label}</legend>
            {field.helpText ? <p className="muted">{field.helpText}</p> : null}
            {options.map((option) => {
              const checked = multiple
                ? Array.isArray(selected) && selected.includes(option.id)
                : selected === option.id;
              return (
                <label key={option.id} className="templates-check">
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    name={`preview-${field.id}`}
                    checked={checked}
                    onChange={() => {
                      if (!multiple) {
                        setAnswer(field.id, option.id);
                        return;
                      }
                      const current = Array.isArray(selected) ? selected : [];
                      setAnswer(
                        field.id,
                        current.includes(option.id)
                          ? current.filter((id) => id !== option.id)
                          : [...current, option.id],
                      );
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}

function FieldEditor({
  drafts,
  onChange,
}: {
  drafts: FieldDraft[];
  onChange: (drafts: FieldDraft[]) => void;
}) {
  function update(id: string, patch: Partial<FieldDraft>) {
    onChange(drafts.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= drafts.length) return;
    const next = drafts.slice();
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    onChange(next);
  }

  return (
    <div className="templates-field-list">
      {drafts.map((field, index) => (
        <article key={field.id} className="templates-field-card">
          <div className="templates-field-card-head">
            <p className="templates-name">Field {index + 1}</p>
            <div className="plan-comp-row-actions">
              <button
                type="button"
                className="button-ghost"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="button-ghost"
                disabled={index === drafts.length - 1}
                onClick={() => move(index, 1)}
              >
                Down
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={() => {
                  const next = drafts.slice();
                  next.splice(index + 1, 0, duplicateFieldDraft(field));
                  onChange(next);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="button-ghost"
                disabled={drafts.length === 1}
                onClick={() => onChange(drafts.filter((item) => item.id !== field.id))}
              >
                Remove
              </button>
            </div>
          </div>
          <label className="field">
            <span>Label</span>
            <input
              value={field.label}
              maxLength={200}
              onChange={(event) => update(field.id, { label: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select
              value={field.type}
              onChange={(event) => {
                const type = BUILDER_FIELD_TYPES.find(
                  (item) => item === event.target.value,
                );
                if (!type) return;
                onChange(
                  drafts.map((item) =>
                    item.id === field.id ? withFieldType(item, type) : item,
                  ),
                );
              }}
            >
              {BUILDER_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {fieldTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="templates-check">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) => update(field.id, { required: event.target.checked })}
            />
            <span>Required</span>
          </label>
          <label className="field">
            <span>Help text</span>
            <input
              value={field.helpText}
              maxLength={500}
              onChange={(event) => update(field.id, { helpText: event.target.value })}
            />
          </label>
          {isChoiceType(field.type) ? (
            <fieldset className="templates-options">
              <legend>Options</legend>
              {field.options.map((option) => (
                <div key={option.id} className="templates-option-row">
                  <label className="field">
                    <span className="sr-only">Option label</span>
                    <input
                      value={option.label}
                      maxLength={200}
                      onChange={(event) =>
                        update(field.id, {
                          options: field.options.map((item) =>
                            item.id === option.id
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="button-ghost"
                    disabled={field.options.length === 1}
                    onClick={() =>
                      update(field.id, {
                        options: field.options.filter((item) => item.id !== option.id),
                      })
                    }
                  >
                    Remove option
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button-secondary"
                disabled={field.options.length >= 50}
                onClick={() =>
                  update(field.id, {
                    options: [
                      ...field.options,
                      { id: crypto.randomUUID(), label: "" },
                    ],
                  })
                }
              >
                Add option
              </button>
            </fieldset>
          ) : isTextType(field.type) ? (
            <label className="field">
              <span>Max length</span>
              <input
                type="number"
                min={1}
                max={10000}
                value={field.maxLength}
                onChange={(event) => update(field.id, { maxLength: event.target.value })}
              />
            </label>
          ) : null}
        </article>
      ))}
      <button
        type="button"
        className="button-secondary"
        onClick={() => onChange([...drafts, blankField()])}
      >
        Add field
      </button>
    </div>
  );
}

function VersionList({ detail }: { detail: OnboardingFormTemplateDetail }) {
  const versions = sortedVersions(detail);
  return (
    <ol className="templates-version-list">
      {versions.map((version) => (
        <li key={version.id} className="templates-version">
          <header>
            <h4>Version {version.version}</h4>
            <time dateTime={version.createdAt}>{formatUpdated(version.createdAt)}</time>
          </header>
          <p className="muted">
            {version.scope === "global" ? "Global" : "Trainer"} · read-only
          </p>
          <ol>
            {version.fields.map((field) => (
              <li key={field.id}>
                <span className="templates-name">{field.label}</span>
                <span className="muted">
                  {" "}
                  · {fieldTypeLabel(field.type)} ·{" "}
                  {field.required ? "Required" : "Optional"}
                  {optionSummary(field)}
                </span>
                {field.helpText ? <p className="muted">{field.helpText}</p> : null}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

export function OnboardingTemplates() {
  const page = useCursorPage("onboarding-templates", (cursor) =>
    apiClient.listOnboardingFormTemplates({ cursor, limit: 50 }),
  );
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<OnboardingFormTemplateDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [forkName, setForkName] = useState("");
  const [fields, setFields] = useState<FieldDraft[]>([blankField()]);
  const [opening, setOpening] = useState(false);
  const [acting, setActing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const latestFields =
    detail?.ownership === "trainer"
      ? (sortedVersions(detail).at(-1)?.fields ?? null)
      : null;

  const visible = page.items.filter((item) => matchesName(item.name, query));
  const built = buildFields(fields);
  const unchanged = fieldsMatchLatest(fields, latestFields);

  function applyDetail(next: OnboardingFormTemplateDetail) {
    setDetail(next);
    if (next.ownership === "trainer") {
      const latest = sortedVersions(next).at(-1);
      if (latest) setFields(draftsFromFields(latest.fields));
    }
  }

  function remember(next: OnboardingFormTemplateDetail) {
    const summary = summaryFromDetail(next);
    page.setItems((current) => [
      summary,
      ...current.filter((item) => item.id !== summary.id),
    ]);
    applyDetail(next);
    setCreating(false);
    setForkName("");
  }

  async function openTemplate(templateId: string) {
    setOpening(true);
    setError(null);
    setMessage(null);
    setCreating(false);
    try {
      const next = await apiClient.getOnboardingFormTemplate(templateId);
      applyDetail(next);
      setForkName("");
    } catch (err) {
      setError(errorText(err, "Could not load this onboarding template."));
    } finally {
      setOpening(false);
    }
  }

  function startCreate() {
    setCreating(true);
    setDetail(null);
    setName("");
    setDescription("");
    setFields([blankField()]);
    setError(null);
    setMessage(null);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const created = await apiClient.createOnboardingFormTemplate(
        {
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          fields: built.fields,
        },
        createIdempotencyKey(),
      );
      remember(created);
      setMessage("Trainer template created. Version 1 is immutable.");
    } catch (err) {
      setError(errorText(err, "Could not create the onboarding template."));
    } finally {
      setActing(false);
    }
  }

  async function onFork(event: FormEvent) {
    event.preventDefault();
    if (!detail || detail.ownership !== "global") return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const forked = await apiClient.forkOnboardingFormTemplate(
        detail.id,
        forkName.trim() ? { name: forkName.trim() } : {},
        createIdempotencyKey(),
      );
      remember(forked);
      setMessage(
        "Forked into a trainer template. The global template is unchanged, and this did not happen just by opening it.",
      );
    } catch (err) {
      setError(errorText(err, "Could not fork this template."));
    } finally {
      setActing(false);
    }
  }

  async function onAppend(event: FormEvent) {
    event.preventDefault();
    if (!detail || detail.ownership !== "trainer") return;
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiClient.createOnboardingFormTemplateVersion(
        detail.id,
        { fields: built.fields },
        createIdempotencyKey(),
      );
      remember(updated);
      setMessage(`Appended version ${updated.latestVersionNumber}. Earlier versions stay unchanged.`);
    } catch (err) {
      setError(errorText(err, "Could not append a version."));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="templates-stack">
      {page.error ? (
        <p className="form-error" role="alert">
          {page.error}{" "}
          <button type="button" className="button-link" onClick={page.reload}>
            Retry
          </button>
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}

      <div className="templates-toolbar">
        <button type="button" className="button-primary" onClick={startCreate}>
          New trainer template
        </button>
        <label className="templates-filter-search">
          <span className="sr-only">Filter onboarding templates by name</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter loaded templates"
            autoComplete="off"
          />
        </label>
      </div>

      {page.loading ? (
        <p className="muted" aria-busy="true">
          Loading onboarding templates…
        </p>
      ) : visible.length === 0 ? (
        <div className="empty-state" role="status">
          <h2>No onboarding templates in this view</h2>
          <p>
            {page.items.length === 0
              ? "Create a trainer template, or load the next page."
              : "No loaded template matches that name."}
          </p>
        </div>
      ) : (
        <ul className="templates-grid">
          {visible.map((item) => {
            const selected = item.id === detail?.id && !creating;
            return (
              <li key={item.id}>
                <article
                  className={selected ? "templates-item is-selected" : "templates-item"}
                >
                  <header className="templates-item-top">
                    <span
                      className={
                        item.ownership === "global"
                          ? "templates-type"
                          : "templates-type templates-type-nutrition"
                      }
                    >
                      {item.ownership === "global" ? "Global" : "Yours"}
                    </span>
                    <time dateTime={item.updatedAt}>
                      Updated {formatUpdated(item.updatedAt)}
                    </time>
                  </header>
                  <h3>{item.name}</h3>
                  <p className="muted">
                    Version {item.latestVersionNumber}
                    {item.description ? ` · ${item.description}` : ""}
                  </p>
                  <div className="templates-item-actions">
                    <button
                      type="button"
                      className="button-primary"
                      disabled={opening}
                      onClick={() => {
                        void openTemplate(item.id);
                      }}
                    >
                      {item.ownership === "global" ? "Read versions" : "Open"}
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
      {page.nextCursor ? (
        <button
          type="button"
          className="button-secondary"
          disabled={page.loadingMore}
          onClick={page.loadMore}
        >
          {page.loadingMore ? "Loading…" : "Load more templates"}
        </button>
      ) : null}

      {opening ? (
        <p className="muted" aria-busy="true">
          Loading template versions…
        </p>
      ) : null}

      {creating ? (
        <form className="templates-panel" onSubmit={(event) => void onCreate(event)}>
          <div className="templates-panel-header">
            <h2>New trainer template</h2>
            <p className="muted">
              This creates a trainer-owned template and its first immutable version.
              Questions can be short text, long text, single choice, multiple choice,
              number, or yes/no. Saving does not add branching or scoring.
            </p>
          </div>
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Description</span>
            <input
              value={description}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <FieldEditor drafts={fields} onChange={setFields} />
          <button
            type="button"
            className="button-secondary"
            onClick={() => setShowPreview((current) => !current)}
          >
            {showPreview ? "Hide trainee preview" : "Preview trainee form"}
          </button>
          {showPreview ? (
            built.ok ? (
              <TraineeFormPreview fields={built.fields} />
            ) : (
              <p className="form-error" role="alert">
                {built.error}
              </p>
            )
          ) : null}
          <button type="submit" className="button-primary" disabled={acting}>
            {acting ? "Saving…" : "Create template"}
          </button>
        </form>
      ) : null}

      {detail && !creating ? (
        <section className="templates-panel" aria-labelledby="onboarding-detail-heading">
          <div className="templates-panel-header">
            <h2 id="onboarding-detail-heading">{detail.name}</h2>
            <p className="muted">
              {detail.ownership === "global"
                ? "Global template. Versions are read-only. Fork is the only way to make a trainer-owned copy."
                : "Trainer template. Versions already saved are read-only. Append adds a new version."}
            </p>
          </div>
          {detail.description ? <p>{detail.description}</p> : null}
          <VersionList detail={detail} />
          {detail.ownership === "global" ? (
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowPreview((current) => !current)}
              >
                {showPreview ? "Hide trainee preview" : "Preview trainee form"}
              </button>
              {showPreview ? (
                <TraineeFormPreview
                  fields={sortedVersions(detail).at(-1)?.fields ?? []}
                />
              ) : null}
            </>
          ) : null}
          {detail.ownership === "global" ? (
            <form className="templates-form" onSubmit={(event) => void onFork(event)}>
              <label className="field">
                <span>Fork name</span>
                <input
                  value={forkName}
                  maxLength={120}
                  onChange={(event) => setForkName(event.target.value)}
                  placeholder={detail.name}
                />
              </label>
              <button type="submit" className="button-primary" disabled={acting}>
                {acting ? "Forking…" : "Fork"}
              </button>
            </form>
          ) : (
            <form className="templates-form" onSubmit={(event) => void onAppend(event)}>
              <h3>Next version</h3>
              <p className="muted">
                Edit a copy of the latest version, then append. This does not change
                older versions or invitations that already pinned one.
              </p>
              <FieldEditor drafts={fields} onChange={setFields} />
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowPreview((current) => !current)}
              >
                {showPreview ? "Hide trainee preview" : "Preview trainee form"}
              </button>
              {showPreview ? (
                built.ok ? (
                  <TraineeFormPreview fields={built.fields} />
                ) : (
                  <p className="form-error" role="alert">
                    {built.error}
                  </p>
                )
              ) : null}
              {unchanged ? (
                <p className="muted">Change the fields to append a version.</p>
              ) : null}
              <button
                type="submit"
                className="button-primary"
                disabled={acting || unchanged}
              >
                {acting ? "Saving…" : "Append version"}
              </button>
            </form>
          )}
        </section>
      ) : null}
    </div>
  );
}
