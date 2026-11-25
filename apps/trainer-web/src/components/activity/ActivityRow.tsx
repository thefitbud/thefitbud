import { useContext } from "react";
import type { MealAssignment } from "@fitbud/contracts";
import type { WorkspaceActivityItem } from "@fitbud/contracts";
import { formatKcal, labelFor, mealRemovedActivityLine } from "@fitbud/core";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Dumbbell,
  Info,
  Pencil,
  Trash2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { LinkedMedia } from "../LinkedMedia";
import { Button } from "../ui";
import {
  activityChipTone,
  canNudgeItem,
  chipValueForActivity,
  formatActivityTime,
  activityMealChipLabel,
  isClientEdited,
  mealDetailLine,
  planEnergyKcal,
  workoutChipLabel,
  type ActivityChipTone,
} from "./activityUtils";
import { UnreadLogEditsContext } from "./unreadLogEdits";

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

/** The row’s leading tile: the kind of entry, tinted by the status tone. */
const TYPE_ICON: Record<WorkspaceActivityItem["type"], LucideIcon> = {
  meal: UtensilsCrossed,
  workout: Dumbbell,
  checkin: ClipboardCheck,
};

/** TM-09e: a client removed a meal log. A quiet row with a neutral "Removed" tag. */
export function ActivityRemovedRow({
  clientName,
  summary,
  mealDate,
  previousKcal,
  occurredAt,
  clientTimezone,
  trainerTimezone,
}: {
  clientName: string | null;
  summary: string;
  mealDate: string | null;
  previousKcal: number | null;
  occurredAt: string;
  clientTimezone: string;
  trainerTimezone: string;
}) {
  const time = formatActivityTime(occurredAt, clientTimezone, trainerTimezone);
  return (
    <li className="activity-feed-row" data-testid="activity-removed-row">
      <time className="activity-feed-time" dateTime={occurredAt} title={time.title}>
        {time.label}
      </time>
      <span className="activity-tile is-neutral" aria-hidden="true">
        <Trash2 size={20} strokeWidth={1.75} />
      </span>
      <div className="activity-feed-main">
        <p className="activity-feed-title">
          {mealRemovedActivityLine({ clientName, summary, mealDate, previousKcal })}
        </p>
      </div>
      <div className="activity-feed-trail">
        <span className="activity-status activity-status-neutral" data-testid="removed-tag">
          <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>Removed</span>
        </span>
      </div>
    </li>
  );
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
  const TileIcon = TYPE_ICON[item.type];

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

  const clientEdited = isClientEdited(mealAssignment?.compliance);
  const unreadEntries = useContext(UnreadLogEditsContext);
  const editUnread =
    clientEdited && unreadEntries.has(mealAssignment?.compliance?.id ?? "");
  const showNudge = !readOnly && canNudgeItem(item);
  const title =
    item.type === "meal" ? mealTitleLine(item, mealAssignment) : item.title;

  return (
    <li className="activity-feed-row" data-testid="activity-row">
      <time className="activity-feed-time" dateTime={item.occurredAt} title={time.title}>
        {time.label}
      </time>
      <span className={`activity-tile is-${tone}`} aria-hidden="true">
        <TileIcon size={20} strokeWidth={1.75} />
      </span>
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
      <div className="activity-feed-trail">
        <span
          className={`activity-status activity-status-${tone}`}
          data-kind={item.type}
          data-value={chipValueForActivity(item)}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>{chipText}</span>
        </span>
        {clientEdited ? (
          <span className="activity-status activity-status-neutral" data-testid="edited-tag">
            <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Edited</span>
            {editUnread ? (
              <span
                className="activity-unread-dot"
                role="img"
                aria-label="Unread"
                data-testid="edited-unread-dot"
              />
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="activity-feed-actions">
        {showNudge ? (
          nudge?.kind === "sent" ? (
            <Button type="button" variant="quiet" size="sm" disabled>
              Sent {nudge.label}
            </Button>
          ) : nudge?.kind === "limited" ? (
            <span className="muted activity-nudge-note">{nudge.message}</span>
          ) : (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              disabled={!online || nudging}
              onClick={onNudge}
            >
              {nudging ? "Reminding…" : "Remind"}
            </Button>
          )
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={onView}>
          View
        </Button>
      </div>
    </li>
  );
}
