import type { MealAssignment } from "@fitbud/contracts";
import type { WorkspaceActivityItem } from "@fitbud/contracts";
import { LinkedMedia } from "../LinkedMedia";
import { Button } from "../Button";
import { StatusChip } from "../StatusChip";
import {
  canNudgeItem,
  chipValueForActivity,
  formatActivityTime,
  mealChipLabel,
  mealDetailLine,
  workoutChipLabel,
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
  onNudge: () => void;
  onView: () => void;
};

export function ActivityRow({
  item,
  clientTimezone,
  trainerTimezone,
  mealAssignment,
  nudge,
  nudging,
  online,
  onNudge,
  onView,
}: Props) {
  const time = formatActivityTime(
    item.occurredAt,
    clientTimezone,
    trainerTimezone,
  );
  const chipKind =
    item.type === "meal"
      ? "meal"
      : item.type === "workout"
        ? "workout"
        : "checkin";
  const chipLabel =
    item.type === "meal"
      ? mealChipLabel(item.state)
      : item.type === "workout"
        ? workoutChipLabel(item.state)
        : undefined;

  const detail =
    item.type === "meal"
      ? mealDetailLine(mealAssignment)
      : item.type === "workout"
        ? ""
        : "";

  const photoId =
    item.type === "meal" ? mealAssignment?.compliance?.mediaAssetId : null;

  const showNudge = canNudgeItem(item);

  return (
    <li className="activity-feed-row" data-testid="activity-row">
      <time className="activity-feed-time" dateTime={item.occurredAt} title={time.title}>
        {time.label}
      </time>
      <div className="activity-feed-main">
        <p className="activity-feed-title">{item.title}</p>
        {detail ? <p className="activity-feed-detail">{detail}</p> : null}
        {photoId ? (
          <div className="activity-feed-thumb">
            <LinkedMedia mediaAssetId={photoId} label={`${item.title} photo`} />
          </div>
        ) : null}
      </div>
      <StatusChip
        kind={chipKind}
        value={chipValueForActivity(item)}
        label={chipLabel}
      />
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
