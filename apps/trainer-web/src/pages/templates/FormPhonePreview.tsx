import { useState } from "react";
import type { OnboardingFieldDefinition } from "@fitbud/contracts";
import { checkinFieldTypeLabel } from "./checkinBuilder";
import "./FormPhonePreview.css";

type PreviewField = {
  id: string;
  type: string;
  label: string;
  required: boolean;
  helpText?: string;
  options?: Array<{ id: string; label: string }>;
  lowLabel?: string;
  highLabel?: string;
  unit?: string;
};

function asPreviewFields(
  fields: OnboardingFieldDefinition[] | PreviewField[],
): PreviewField[] {
  return fields.map((field) => {
    if ("options" in field && Array.isArray(field.options)) {
      const opts = field.options;
      if (opts.length > 0 && typeof opts[0] === "string") {
        return {
          ...field,
          options: (opts as string[]).map((option) => ({
            id: option,
            label: option,
          })),
        };
      }
    }
    return field as PreviewField;
  });
}

/** Live phone-frame preview for onboarding / check-in form builders. */
export function FormPhonePreview({
  fields,
  title = "Your form",
  activeIds,
}: {
  fields: OnboardingFieldDefinition[] | PreviewField[];
  title?: string;
  /** Question ids to mark as the one being edited (check-in builder). */
  activeIds?: string[];
}) {
  const preview = asPreviewFields(fields);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const qClass = (field: PreviewField) =>
    `field phone-field phone-q${activeIds?.includes(field.id) ? " is-active" : ""}`;

  return (
    <aside className="form-phone-preview" aria-label="Trainee phone preview">
      <div className="phone-frame form-preview-phone">
        <div className="phone-screen" tabIndex={0}>
          <p className="phone-title">{title}</p>
          {preview.length === 0 ? (
            <p className="muted">Add a question to preview it here.</p>
          ) : (
            preview.map((field) => {
              const label = `${field.label || "Untitled"}${field.required ? " *" : ""}`;
              if (
                field.type === "single_choice" ||
                field.type === "multiple_choice" ||
                field.type === "select"
              ) {
                return (
                  <label key={field.id} className={qClass(field)}>
                    <span>{label}</span>
                    <select
                      value={answers[field.id] ?? ""}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [field.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Choose…</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label || "Option"}
                        </option>
                      ))}
                    </select>
                    {field.helpText ? (
                      <span className="muted">{field.helpText}</span>
                    ) : null}
                  </label>
                );
              }
              if (field.type === "yes_no") {
                return (
                  <fieldset key={field.id} className={qClass(field)}>
                    <legend>{label}</legend>
                    <label>
                      <input type="radio" name={field.id} value="yes" /> Yes
                    </label>
                    <label>
                      <input type="radio" name={field.id} value="no" /> No
                    </label>
                  </fieldset>
                );
              }
              if (field.type === "scale_1_5") {
                return (
                  <fieldset key={field.id} className={qClass(field)}>
                    <legend>{label}</legend>
                    <div className="scale-row">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label key={n} className="scale-chip">
                          <input type="radio" name={field.id} value={n} />
                          <span>{n}</span>
                        </label>
                      ))}
                    </div>
                    <p className="phone-scale-ends">
                      <span>{field.lowLabel ?? "Very low"}</span>
                      <span>{field.highLabel ?? "Very high"}</span>
                    </p>
                  </fieldset>
                );
              }
              if (
                field.type === "long_text" ||
                field.type === "textarea"
              ) {
                return (
                  <label key={field.id} className={qClass(field)}>
                    <span>{label}</span>
                    <textarea rows={3} readOnly placeholder="Your answer" />
                    {field.helpText ? (
                      <span className="muted">{field.helpText}</span>
                    ) : null}
                  </label>
                );
              }
              if (field.type === "photo_intent") {
                return (
                  <div key={field.id} className={qClass(field)}>
                    <p>{label}</p>
                    <p className="muted">
                      Photo slot · {checkinFieldTypeLabel("photo_intent")}
                    </p>
                  </div>
                );
              }
              if (field.type === "measurement") {
                return (
                  <label key={field.id} className={qClass(field)}>
                    <span>
                      {label}
                      {field.unit ? ` (${field.unit})` : ""}
                    </span>
                    <input type="number" readOnly placeholder="0" />
                  </label>
                );
              }
              return (
                <label key={field.id} className={qClass(field)}>
                  <span>
                    {label}
                    {field.unit ? ` (${field.unit})` : ""}
                  </span>
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    readOnly
                    placeholder="Your answer"
                  />
                  {field.helpText ? (
                    <span className="muted">{field.helpText}</span>
                  ) : null}
                </label>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
