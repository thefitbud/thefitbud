import type { CheckinCadence, MealPhotoRequirement } from "@fitbud/contracts";
import {
  checkinCadenceSchema,
  mealPhotoRequirementSchema,
} from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import type { ConfigureFormValues } from "./sectionStatus";
import {
  DEFAULT_STEPS_TARGET,
  stepsNumber,
  stepsTargetOptions,
  type StepsTargetState,
} from "./useStepsTarget";

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Frame 149 (v3, targets only): Expectation · Target · Details. No "Raises a
 * flag when" column (that is 149-ref, not built; D-W8-3). Targets look and act
 * editable; windows stay editable inline in Details.
 */
export function ExpectationsTable({
  form,
  onChange,
  disabled,
  checkinFormName,
  firstName,
  steps,
  stepsBlockedReason,
}: {
  form: ConfigureFormValues;
  onChange: (patch: Partial<ConfigureFormValues>) => void;
  /** The version's own fields (locked on an active version). */
  disabled: boolean;
  checkinFormName: string;
  firstName: string;
  steps: StepsTargetState & { disabled: boolean };
  /** Why the steps target can't be set yet (no configuration saved), or null. */
  stepsBlockedReason: string | null;
}) {
  const stepsValue = steps.target ?? DEFAULT_STEPS_TARGET;
  return (
    <>
      <table className="cs-expectations">
        <thead>
          <tr>
            <th scope="col">Expectation</th>
            <th scope="col">Target</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Workouts</th>
            <td>
              <select
                className="cs-target"
                name="sessionsPerWeek"
                aria-label="Sessions per week"
                disabled={disabled}
                value={form.sessionsPerWeek}
                onChange={(event) =>
                  onChange({ sessionsPerWeek: Number(event.target.value) })
                }
              >
                {range(1, 7).map((n) => (
                  <option key={n} value={n}>
                    {n} a week
                  </option>
                ))}
              </select>
            </td>
            <td className="cs-details">
              Log within{" "}
              <input
                className="cs-inline-number"
                type="number"
                name="completionWindowHours"
                aria-label="Completion window (hours)"
                min={1}
                max={72}
                disabled={disabled}
                value={form.completionWindowHours}
                onChange={(event) =>
                  onChange({
                    completionWindowHours: Number(event.target.value),
                  })
                }
              />{" "}
              h of the planned time
            </td>
          </tr>
          <tr>
            <th scope="row">Meals logged</th>
            <td>
              <select
                className="cs-target"
                name="mealsPerDay"
                aria-label="Meals per day"
                disabled={disabled}
                value={form.mealsPerDay}
                onChange={(event) =>
                  onChange({ mealsPerDay: Number(event.target.value) })
                }
              >
                {range(1, 8).map((n) => (
                  <option key={n} value={n}>
                    {n} a day
                  </option>
                ))}
              </select>
            </td>
            <td className="cs-details">
              Confirm within{" "}
              <input
                className="cs-inline-number"
                type="number"
                name="confirmationWindowHours"
                aria-label="Confirmation window (hours)"
                min={1}
                max={48}
                disabled={disabled}
                value={form.confirmationWindowHours}
                onChange={(event) =>
                  onChange({
                    confirmationWindowHours: Number(event.target.value),
                  })
                }
              />{" "}
              h · photos{" "}
              <select
                className="cs-inline-select"
                name="photoRequirement"
                aria-label="Meal photo requirement"
                disabled={disabled}
                value={form.photoRequirement}
                onChange={(event) =>
                  onChange({
                    photoRequirement: event.target.value as MealPhotoRequirement,
                  })
                }
              >
                {mealPhotoRequirementSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {labelFor("meal_photo_requirement", option).toLowerCase()}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr>
            <th scope="row">Check-in</th>
            <td>
              <select
                className="cs-target"
                name="cadence"
                aria-label="Cadence"
                disabled={disabled}
                value={form.cadence}
                onChange={(event) =>
                  onChange({ cadence: event.target.value as CheckinCadence })
                }
              >
                {checkinCadenceSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {labelFor("checkin_cadence", option)}
                  </option>
                ))}
              </select>
            </td>
            <td className="cs-details">
              {form.dueWindowHours} h window · {checkinFormName}
            </td>
          </tr>
          <tr data-testid="configure-steps-row">
            <th scope="row">Steps</th>
            <td>
              <select
                className="cs-target"
                name="stepsTarget"
                aria-label="Daily steps target"
                aria-describedby="configure-steps-detail"
                disabled={steps.disabled}
                value={stepsValue}
                onChange={(event) => {
                  void steps.save(Number(event.target.value));
                }}
              >
                {stepsTargetOptions(stepsValue).map((n) => (
                  <option key={n} value={n}>
                    {stepsNumber(n)} a day
                  </option>
                ))}
              </select>
            </td>
            <td className="cs-details" id="configure-steps-detail">
              {stepsBlockedReason ??
                (steps.loadFailed
                  ? "Could not load the steps target. Reload to try again."
                  : `Counts only when ${firstName} connects Apple Health or Health Connect`)}
              {steps.error ? (
                <span className="form-error cs-row-error" role="alert">
                  {steps.error}
                </span>
              ) : null}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="cs-expectations-note">
        Targets are counts, never a score.
      </p>
    </>
  );
}
