import type { DietAdjustmentScope } from "@fitbud/core";

export type TodayMealsPreview =
  | { status: "loading" }
  | { status: "error"; message: string; onRetry: () => void }
  | { status: "ready"; changing: string[]; protectedMeals: string[]; total: number };

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function PreviewLine({ preview }: { preview: TodayMealsPreview }) {
  if (preview.status === "loading") {
    return (
      <p className="muted" aria-busy="true">
        Checking today&apos;s meals…
      </p>
    );
  }
  if (preview.status === "error") {
    return (
      <p className="field-error" role="alert">
        Couldn&apos;t check today&apos;s meals.{" "}
        <button type="button" className="button-link" onClick={preview.onRetry}>
          Retry
        </button>
      </p>
    );
  }
  if (preview.total === 0) {
    return <p className="muted">No meals are scheduled for today.</p>;
  }
  if (preview.changing.length === 0) {
    return (
      <p className="diet-preview" data-testid="diet-preview">
        All of today&apos;s meals are already logged. Nothing will change today.
      </p>
    );
  }
  const count = preview.changing.length;
  return (
    <p className="diet-preview" data-testid="diet-preview">
      {count} {count === 1 ? "meal" : "meals"} will change today: {preview.changing.join(", ")}.
      {preview.protectedMeals.length > 0
        ? ` ${listNames(preview.protectedMeals)} ${
            preview.protectedMeals.length === 1 ? "is" : "are"
          } already logged and won't change.`
        : ""}
    </p>
  );
}

/** TW-15: diet change scope, shown when a nutrition-only adjustment is published. */
export function DietScopePicker({
  value,
  onChange,
  preview,
}: {
  value: DietAdjustmentScope;
  onChange: (next: DietAdjustmentScope) => void;
  preview: TodayMealsPreview;
}) {
  const options: Array<{ value: DietAdjustmentScope; title: string; body: string }> = [
    {
      value: "today_onward",
      title: "From today onward",
      body: "Updates the plan from today. Today's and future meals that aren't logged yet will change.",
    },
    {
      value: "today_only",
      title: "Today only",
      body: "Changes only today's meals that aren't logged yet. The plan stays the same from tomorrow.",
    },
  ];
  return (
    <fieldset className="diet-scope" data-testid="screen-TW-15">
      <legend>When should the diet change apply?</legend>
      <div className="radio-cards" role="radiogroup" aria-label="Diet change scope">
        {options.map((option) => (
          <label
            key={option.value}
            className={value === option.value ? "radio-card is-selected" : "radio-card"}
          >
            <input
              type="radio"
              name="diet-scope"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="radio-card-copy">
              <span className="radio-card-title">{option.title}</span>
              <span className="radio-card-detail">{option.body}</span>
            </span>
          </label>
        ))}
      </div>
      <PreviewLine preview={preview} />
      <p className="muted">Workouts aren&apos;t affected. Logged meals are protected.</p>
    </fieldset>
  );
}
