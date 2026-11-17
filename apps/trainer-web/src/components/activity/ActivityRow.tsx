import type { MealAssignment } from "@fitbud/contracts";
import type { WorkspaceActivityItem } from "@fitbud/contracts";
import { formatKcal, labelFor } from "@fitbud/core";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  type LucideIcon,
} from "lucide-react";
import { LinkedMedia } from "../LinkedMedia";
import { Button } from "../Button";
import {
  activityChipTone,
  canNudgeItem,
  chipValueForActivity,
  formatActivityTime,
  activityMealChipLabel,
  mealDetailLine,
  planEnergyKcal,
  workoutChipLabel,
  type ActivityChipTone,
} from "./activityUtils";

export type NudgeUiState =
  | { kind: "ready" }
  | { kind: "sent"; label: string }
  | { kind: "limited"; message: string };

type Props = {
  item: WorkspaceActivityItem;
  clientTimezone: string;
  trainerTimezone: string;
  mealAssignment?: MealAssignment;
  nudge?: NudgeUiState;
  nudging?: boolean;
  online: boolean;
  /** When true, hide mutating actions (TW-30 ended workspace). */
  readOnly?: boolean;
  onNudge: () => void;
  onView: () => void;
};

const TONE_ICON: Record<ActivityChipTone, LucideIcon> = {
  positive: CheckCircle2,
  info: Info,
  attention: AlertTriangle,
  critical: AlertOctagon,
  neutral: CircleDashed,
};

function mealTitleLine(
  item: WorkspaceActivityItem,
  assignment: MealAssignment | undefined,
): string {
  if (!assignment) return item.title;
  const compliance = assignment.compliance;
  const logged = compliance?.loggedItems ?? [];
  const planKcal = planEnergyKcal(assignment.prescription.items);
  if (logged.length > 0) {
    const names = logged
      .slice(0, 2)
      .map((row) =>
        row.servingLabel ? `${row.name}, ${row.servingLabel}` : row.name,
      )
      .join(", ");
    const kcal =
      compliance?.loggedTotals?.energyKcal != null
        ? compliance.loggedTotals.energyKcal
        : planKcal;
    return `${item.title} · ${names} · ${formatKcal(kcal)}`;
  }
  if (planKcal > 0) {
    const pending =
      item.state === "pending" || item.state === "overdue"
        ? ` · ${formatKcal(planKcal)} planned`
        : ` · ${formatKcal(planKcal)}`;
    return `${item.title}${pending}`;
  }
  return item.title;
}

export function ActivityRow({
  item,
  clientTimezone,
  trainerTimezone,
  mealAssignment,
  nudge,
  nudging,
  online,
  readOnly = false,
  onNudge,
  onView,
}: Props) {
  const time = formatActivityTime(
    item.occurredAt,
    clientTimezone,
    trainerTimezone,
  );
  const chipLabel =
    item.type === "meal"
      ? activityMealChipLabel(item.state)
      : item.type === "workout"
        ? workoutChipLabel(item.state)
        : undefined;
  const chipText =
    chipLabel ??
    (item.type === "meal"
      ? labelFor("meal_assignment_status", item.state)
      : item.type === "workout"
        ? labelFor("workout_assignment_status", item.state)
        : labelFor("checkin_status", item.state));
  const tone = activityChipTone(item);
  const Icon = TONE_ICON[tone];

  const rawDetail = item.type === "meal" ? mealDetailLine(mealAssignment) : "";
  // mealDetailLine falls back to the deviation kind with underscores swapped
  // for spaces ("portion adjustment"); show the shared label instead (Z5-3).
  const deviationKind = mealAssignment?.compliance?.deviationKind;
  const detail =
    deviationKind && rawDetail === deviationKind.replaceAll("_", " ")
      ? labelFor("meal_deviation_kind", deviationKind)
      : rawDetail;
  // When the title already carries food · kcal, keep detail for notes / skip only.
  const showDetail =
    item.type !== "meal" ||
    (Boolean(detail) &&
      !detail.startsWith("Ate:") &&
      detail !== "Awaiting log" &&
      detail !== "Not logged yet");

  const photoId =
    item.type === "meal" ? mealAssignment?.compliance?.mediaAssetId : null;

  const showNudge = !readOnly && canNudgeItem(item);
  const title =
    item.type === "meal" ? mealTitleLine(item, mealAssignment) : item.title;

  return (
    <li className="activity-feed-row" data-testid="activity-row">
      <time className="activity-feed-time" dateTime={item.occurredAt} title={time.title}>
        {time.label}
      </time>
      <div className="activity-feed-main">
        <p className="activity-feed-title">{title}</p>
        {showDetail && detail ? (
          <p className="activity-feed-detail">{detail}</p>
        ) : null}
        {photoId ? (
          <div className="activity-feed-thumb">
            <LinkedMedia mediaAssetId={photoId} label={`${item.title} photo`} />
          </div>
        ) : null}
      </div>
      <span
        className={`activity-status activity-status-${tone}`}
        data-kind={item.type}
        data-value={chipValueForActivity(item)}
      >
        <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
        <span>{chipText}</span>
      </span>
      <div className="activity-feed-actions">
        {showNudge ? (
          nudge?.kind === "sent" ? (
            <Button type="button" variant="tinted" disabled>
              Sent {nudge.label}
            </Button>
          ) : nudge?.kind === "limited" ? (
            <span className="muted activity-nudge-note">{nudge.message}</span>
          ) : (
            <Button
              type="button"
              variant="tinted"
              disabled={!online || nudging}
              onClick={onNudge}
            >
              {nudging ? "Nudging…" : "Nudge"}
            </Button>
          )
        ) : null}
        <Button type="button" variant="secondary" onClick={onView}>
          View
        </Button>
      </div>
    </li>
  );
}
