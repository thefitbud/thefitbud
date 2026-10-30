import type { MealAssignment } from "@fitbud/contracts";
import { formatClockTime, formatKcal } from "@fitbud/core";
import { LinkedMedia } from "../LinkedMedia";
import { Button } from "../Button";
import { planEnergyKcal } from "./activityUtils";

function macroCell(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return String(value);
}

export function MealPanel({
  assignment,
  clientTimezone,
  onAddToLibrary,
}: {
  assignment: MealAssignment;
  clientTimezone: string;
  onAddToLibrary?: (name: string) => void;
}) {
  const compliance = assignment.compliance;
  const plannedItems = assignment.prescription.items ?? [];
  const loggedItems = compliance?.loggedItems ?? [];
  const loggedTotals = compliance?.loggedTotals;
  const planKcal = planEnergyKcal(plannedItems);
  const energyDelta =
    loggedTotals?.energyKcal != null ? loggedTotals.energyKcal - planKcal : null;

  return (
    <div className="activity-panel" data-testid="meal-panel">
      <header className="activity-panel-head">
        <h2>{assignment.mealName}</h2>
        <p className="muted">
          {assignment.localDate} · window ends{" "}
          {formatClockTime(assignment.windowEndsAt, clientTimezone)}
        </p>
      </header>

      <section aria-labelledby="meal-planned-heading">
        <h3 id="meal-planned-heading">Planned</h3>
        {plannedItems.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <ul className="activity-panel-list">
            {plannedItems.map((item, index) => (
              <li key={`planned-${index}`}>
                {"name" in item ? item.name : "Food"}
                {"portionLabel" in item && item.portionLabel
                  ? ` · ${item.portionLabel}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="activity-panel-totals">
          Plan ≥ {formatKcal(planKcal)}
        </p>
      </section>

      <section aria-labelledby="meal-actual-heading">
        <h3 id="meal-actual-heading">Logged</h3>
        {!compliance ? (
          <p className="muted">Not logged yet.</p>
        ) : (
          <>
            {compliance.notes ? (
              <p className="activity-panel-note">{compliance.notes}</p>
            ) : null}
            {loggedItems.length > 0 ? (
              <table className="activity-panel-table">
                <thead>
                  <tr>
                    <th scope="col">Food</th>
                    <th scope="col">Qty</th>
                    <th scope="col">kcal</th>
                    <th scope="col">P</th>
                    <th scope="col">C</th>
                    <th scope="col">F</th>
                  </tr>
                </thead>
                <tbody>
                  {loggedItems.map((row, index) => (
                    <tr key={`${row.name}-${index}`}>
                      <td>
                        {row.name}
                        {row.custom ? (
                          <span className="activity-custom-food">
                            Custom · not in library
                          </span>
                        ) : null}
                        {row.custom && onAddToLibrary ? (
                          <Button
                            type="button"
                            variant="tinted"
                            className="button-sm"
                            onClick={() => onAddToLibrary(row.name)}
                          >
                            Add to my food library
                          </Button>
                        ) : null}
                      </td>
                      <td>
                        {row.quantity != null ? row.quantity : "—"}
                        {row.servingLabel ? ` ${row.servingLabel}` : ""}
                      </td>
                      <td>{macroCell(row.energyKcal)}</td>
                      <td>{macroCell(row.proteinG)}</td>
                      <td>{macroCell(row.carbsG)}</td>
                      <td>{macroCell(row.fatG)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No itemised log.</p>
            )}
            <p className="activity-panel-totals">
              Totals ≥{" "}
              {loggedTotals?.energyKcal != null
                ? `${loggedTotals.energyKcal} kcal`
                : "—"}
              {energyDelta != null && energyDelta !== 0
                ? ` (${energyDelta > 0 ? "+" : ""}${energyDelta} kcal)`
                : ""}
            </p>
            {compliance.mediaAssetId ? (
              <LinkedMedia
                mediaAssetId={compliance.mediaAssetId}
                label={`${assignment.mealName} photo`}
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
