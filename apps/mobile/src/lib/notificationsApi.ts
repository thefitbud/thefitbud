import { resolveApiBaseUrl } from "./api";

/** POST /notifications/:id/read — not yet on FitBudApiClient public surface. */
export async function markNotificationRead(
  accessToken: string,
  notificationId: string,
): Promise<void> {
  const response = await fetch(
    `${resolveApiBaseUrl()}/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Could not mark notification read (${response.status}).`);
  }
}
