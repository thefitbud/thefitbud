/**
 * Trainee Today, workout, and diet lists are current work.
 * Superseded rows stay stored for trainer history and are not shown here.
 */
export function scheduledAssignments<T extends { scheduleStatus: string }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => item.scheduleStatus === "scheduled");
}

/** Sort meal assignments by prescription local time, then name. */
export function sortMealsByTime<
  T extends {
    mealName?: string;
    name?: string;
    localTime?: string | null;
    prescription?: { localTime?: string | null };
    windowStartsAt?: string;
    id?: string;
  },
>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime =
      left.localTime?.trim() ||
      left.prescription?.localTime?.trim() ||
      left.windowStartsAt ||
      "99:99";
    const rightTime =
      right.localTime?.trim() ||
      right.prescription?.localTime?.trim() ||
      right.windowStartsAt ||
      "99:99";
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
    const leftName = (left.mealName ?? left.name ?? "").trim();
    const rightName = (right.mealName ?? right.name ?? "").trim();
    if (leftName !== rightName) return leftName.localeCompare(rightName);
    return (left.id ?? "").localeCompare(right.id ?? "");
  });
}
