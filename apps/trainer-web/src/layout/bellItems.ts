import type { Notification } from "@fitbud/contracts";
import { trainerNotificationCopy } from "@fitbud/core";

/**
 * Z14-16 (D-W14-23 b, g): the web bell rows for clients' meal-log changes.
 * Unread only, newest first, at most five. The title is the same shared copy the
 * push and the trainer app show. The link opens that client's Activity on the
 * meal day with the entry's panel open (a removed entry: the day only).
 */
export function logEditBellItems(
  notifications: readonly Notification[],
  names: ReadonlyMap<string, string>,
  today: string,
): Array<{ id: string; title: string; href: string }> {
  return notifications
    .filter(
      (row) =>
        row.type === "trainer_client_log_edited" &&
        !row.readAt &&
        row.coachingRelationshipId &&
        row.logEdit,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((row) => {
      const edit = row.logEdit!;
      const rel = row.coachingRelationshipId!;
      const query = new URLSearchParams({ date: edit.mealDate });
      if (edit.action === "edited") query.set("entry", edit.entryId);
      return {
        id: `log-${row.id}`,
        title: trainerNotificationCopy(
          "trainer_client_log_edited",
          names.get(rel) ?? row.clientDisplayName,
          { logEdit: edit, today },
        ).title,
        href: `/clients/${rel}/activity?${query.toString()}`,
      };
    });
}
