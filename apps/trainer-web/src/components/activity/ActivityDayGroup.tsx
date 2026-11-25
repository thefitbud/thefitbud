import type { MealAssignment } from "@fitbud/contracts";
import type { WorkspaceActivityItem } from "@fitbud/contracts";
import { ActivityRow, type NudgeUiState } from "./ActivityRow";
import { dayHeading } from "./activityUtils";

type Props = {
  date: string;
  /** The client’s today, so the heading can read "Today · Wed 18 Nov". */
  today?: string;
  headerSuffix: string | null;
  items: WorkspaceActivityItem[];
  clientTimezone: string;
  trainerTimezone: string;
  mealAssignments: Map<string, MealAssignment>;
  nudgeState: Record<string, NudgeUiState>;
  nudgingId: string | null;
  online: boolean;
  readOnly?: boolean;
  onNudge: (item: WorkspaceActivityItem) => void;
  onView: (item: WorkspaceActivityItem) => void;
};

export function ActivityDayGroup({
  date,
  today,
  headerSuffix,
  items,
  clientTimezone,
  trainerTimezone,
  mealAssignments,
  nudgeState,
  nudgingId,
  online,
  readOnly = false,
  onNudge,
  onView,
}: Props) {
  return (
    <section className="activity-day-group" data-testid="activity-day-group">
      <header className="activity-day-head">
        <h2 className="activity-day-header">{dayHeading(date, today)}</h2>
        {headerSuffix ? (
          <p className="activity-day-meta">{headerSuffix}</p>
        ) : null}
      </header>
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
            readOnly={readOnly}
            onNudge={() => onNudge(item)}
            onView={() => onView(item)}
          />
        ))}
      </ul>
    </section>
  );
}
