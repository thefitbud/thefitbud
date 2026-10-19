import type { MealAssignment } from "@fitbud/contracts";
import type { WorkspaceActivityItem } from "@fitbud/contracts";
import { ActivityRow, type NudgeUiState } from "./ActivityRow";
import { dayHeaderLabel } from "./activityUtils";

type Props = {
  date: string;
  headerSuffix: string | null;
  items: WorkspaceActivityItem[];
  clientTimezone: string;
  trainerTimezone: string;
  mealAssignments: Map<string, MealAssignment>;
  nudgeState: Record<string, NudgeUiState>;
  nudgingId: string | null;
  online: boolean;
  onNudge: (item: WorkspaceActivityItem) => void;
  onView: (item: WorkspaceActivityItem) => void;
};

export function ActivityDayGroup({
  date,
  headerSuffix,
  items,
  clientTimezone,
  trainerTimezone,
  mealAssignments,
  nudgeState,
  nudgingId,
  online,
  onNudge,
  onView,
}: Props) {
  return (
    <section className="activity-day-group" data-testid="activity-day-group">
      <h2 className="activity-day-header">
        {dayHeaderLabel(date, headerSuffix)}
      </h2>
      <ul className="activity-feed-list">
        {items.map((item) => (
          <ActivityRow
            key={`${item.type}:${item.id}`}
            item={item}
            clientTimezone={clientTimezone}
            trainerTimezone={trainerTimezone}
            mealAssignment={
              item.type === "meal" ? mealAssignments.get(item.id) : undefined
            }
            nudge={nudgeState[item.id]}
            nudging={nudgingId === item.id}
            online={online}
            onNudge={() => onNudge(item)}
            onView={() => onView(item)}
          />
        ))}
      </ul>
    </section>
  );
}
