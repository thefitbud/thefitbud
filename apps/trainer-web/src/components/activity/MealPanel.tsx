import type { MealAssignment } from "@fitbud/contracts";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  formatCivilDate,
  formatClockTime,
  formatInstant,
  formatKcal,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";
import { coachEntryTag, isWithinWindow } from "../../pages/log-entry/logEntryModel";
import type { WorkspaceOutletContext } from "../../pages/workspaceContext";
import { LinkedMedia } from "../LinkedMedia";
import { Button } from "../Button";
import { WhatsAppGlyph } from "../WhatsAppGlyph";
import { clientWhatsappHref } from "../../lib/whatsapp";
import { activityMealChipLabel, planEnergyKcal } from "./activityUtils";
import "./activity.css";

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
  const { relationshipId = assignment.coachingRelationshipId } = useParams();
  const outlet = useOutletContext<WorkspaceOutletContext | undefined>();
  const ended = outlet?.ended ?? false;
  const header = outlet?.workspace?.header;
  const clientName = header?.traineeDisplayName ?? "Client";
  const clientWa = header?.clientWhatsappE164 ?? null;
  const today = formatLocalDate(new Date(), clientTimezone);
  const tag = compliance ? coachEntryTag(compliance, clientTimezone) : null;
  // Ended clients are read-only; a trainer logs or edits a meal dated within 7 days (R2).
  const canLogOrEdit =
    !ended &&
    assignment.scheduleStatus === "scheduled" &&
    isWithinWindow(assignment.localDate, today);
  const plannedItems = assignment.prescription.items ?? [];
  const loggedItems = compliance?.loggedItems ?? [];
  const loggedTotals = compliance?.loggedTotals;
  const planKcal = planEnergyKcal(plannedItems);
  const energyDelta =
    loggedTotals?.energyKcal != null ? loggedTotals.energyKcal - planKcal : null;
  const stateLabel =
    activityMealChipLabel(assignment.status) ??
    labelFor("meal_assignment_status", assignment.status);
  const toneClass =
    assignment.status === "confirmed" || assignment.status === "logged_later"
      ? "activity-status-positive"
      : assignment.status === "modified"
        ? "activity-status-info"
        : assignment.status === "overdue" || assignment.status === "pending"
          ? "activity-status-attention"
          : "activity-status-neutral";

  const waHref = clientWhatsappHref({
    phoneE164: clientWa,
    name: clientName,
  });
  const firstName = clientName.trim().split(/\s+/)[0] || "Client";

  return (
    <div className="activity-panel" data-testid="meal-panel">
      <header className="activity-panel-head">
        <div>
          <h2>
            {assignment.mealName} · {formatCivilDate(assignment.localDate)}
          </h2>
          <p className="muted">
            Window ends {formatClockTime(assignment.windowEndsAt, clientTimezone)}
          </p>
        </div>
        <span className={`activity-status ${toneClass}`}>
          {stateLabel}
        </span>
      </header>

      {tag ? (
        <p className="activity-panel-tag" data-testid="meal-coach-tag">
          <strong>{tag}</strong>
        </p>
      ) : null}
      {canLogOrEdit ? (
        <Link
          className="button-secondary le-entry-link"
          to={`/clients/${relationshipId}/log-entry/meal/${assignment.id}`}
        >
          {compliance ? "Edit meal" : "Log meal"}
        </Link>
      ) : null}

      <div className="activity-panel-compare">
        <section
          className="activity-panel-compare-card"
          aria-labelledby="meal-planned-heading"
        >
          <h3 id="meal-planned-heading">Planned</h3>
          <p className="activity-panel-kcal">{formatKcal(planKcal)}</p>
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
        </section>

        <section
          className="activity-panel-compare-card"
          aria-labelledby="meal-actual-heading"
        >
          <h3 id="meal-actual-heading">Logged</h3>
          {!compliance ? (
            <>
              <p className="activity-panel-kcal">—</p>
              <p className="muted">Not logged yet.</p>
            </>
          ) : (
            <>
              <p className="activity-panel-kcal">
                {loggedTotals?.energyKcal != null
                  ? formatKcal(loggedTotals.energyKcal)
                  : "—"}
              </p>
              {loggedItems.length > 0 ? (
                <ul className="activity-panel-list">
                  {loggedItems.map((row, index) => (
                    <li key={`${row.name}-${index}`}>
                      {row.name}
                      {row.servingLabel ? ` · ${row.servingLabel}` : ""}
                      {row.custom ? (
                        <span className="activity-custom-food">
                          {" "}
                          · Custom · not in library
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
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No itemised log.</p>
              )}
            </>
          )}
        </section>
      </div>

      {compliance ? (
        <dl className="activity-panel-meta">
          {compliance.loggedAt ? (
            <div>
              <dt>Logged at</dt>
              <dd>{formatInstant(compliance.loggedAt, clientTimezone)}</dd>
            </div>
          ) : null}
          {compliance.notes?.trim() ? (
            <div>
              <dt>Reason</dt>
              <dd>{compliance.notes.trim()}</dd>
            </div>
          ) : null}
          {energyDelta != null && energyDelta !== 0 ? (
            <div>
              <dt>Difference</dt>
              <dd className="activity-panel-delta">
                {energyDelta > 0 ? "+" : ""}
                {formatKcal(energyDelta)}
              </dd>
            </div>
          ) : null}
          {compliance.mediaAssetId ? (
            <div>
              <dt>Photo</dt>
              <dd>1 photo</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {compliance?.mediaAssetId ? (
        <LinkedMedia
          mediaAssetId={compliance.mediaAssetId}
          label={`${assignment.mealName} photo`}
        />
      ) : null}

      <div className="activity-panel-actions">
        {waHref && !ended ? (
          <a
            className="button-secondary button-whatsapp"
            href={waHref}
            target="_blank"
            rel="noreferrer"
          >
            <WhatsAppGlyph />
            Message on WhatsApp
          </a>
        ) : (
          <Button variant="whatsapp" disabled>
            <WhatsAppGlyph />
            Message on WhatsApp
          </Button>
        )}
        {!ended ? (
          <Link
            className="activity-panel-note-link"
            to={`/clients/${relationshipId}/overview?note=1`}
          >
            Add note
          </Link>
        ) : null}
      </div>

      <p className="muted" style={{ margin: 0, fontSize: "0.75rem" }}>
        {firstName}&apos;s meal · plan ≥ {formatKcal(planKcal)}
        {loggedTotals?.energyKcal != null
          ? ` · logged ${formatKcal(loggedTotals.energyKcal)}`
          : ""}
      </p>
    </div>
  );
}
