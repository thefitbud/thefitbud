/**
 * Trainee Today, workout, and diet lists are current work.
 * Superseded rows stay stored for trainer history and are not shown here.
 */
export function scheduledAssignments<T extends { scheduleStatus: string }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => item.scheduleStatus === "scheduled");
}
