/**
 * Client workspace tab strip (TW-09a).
 *
 * Every `/clients/:relationshipId/*` screen that uses WorkspaceHeader renders
 * this list, in this order (W13-10, D-WEB-3): Overview, Plan, Activity,
 * Progress, Check-ins, History, Settings. Sessions, Packages and Configure are
 * not tabs; Coaching setup, Reminders and Onboarding answers are sections of
 * the Settings tab.
 */
export const CLIENT_WORKSPACE_TABS = [
  { id: "overview", label: "Overview", segment: "overview" },
  { id: "plan", label: "Plan", segment: "plan" },
  { id: "activity", label: "Activity", segment: "activity" },
  { id: "progress", label: "Progress", segment: "progress" },
  {
    id: "check-ins",
    label: "Check-ins",
    segment: "check-ins",
    badge: "submitted-checkins",
  },
  { id: "history", label: "History", segment: "history" },
  { id: "settings", label: "Settings", segment: "settings" },
] as const;

export type ClientWorkspaceTab = (typeof CLIENT_WORKSPACE_TABS)[number];

/** Labels that must never appear in the client workspace tab strip. */
export const FORBIDDEN_CLIENT_WORKSPACE_TAB_LABELS = [
  "Sessions",
  "Packages",
  "Configure",
] as const;

export function clientWorkspaceTabHref(
  relationshipId: string,
  tab: ClientWorkspaceTab,
): string {
  return `/clients/${relationshipId}/${tab.segment}`;
}

/**
 * Overview is also the workspace index (`/clients/:id` and `/overview`).
 * Nested routes such as check-in review stay on their parent tab. The old
 * `configure` and `onboarding` routes redirect into Settings (D-W13-15), so
 * they select Settings while the redirect runs.
 */
export function isClientWorkspaceTabActive(
  pathname: string,
  relationshipId: string,
  tab: ClientWorkspaceTab,
): boolean {
  const base = `/clients/${relationshipId}`;
  const href = `${base}/${tab.segment}`;
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (tab.id === "overview" && (pathname === base || pathname === `${base}/`)) {
    return true;
  }
  if (
    tab.id === "settings" &&
    (pathname === `${base}/configure` || pathname === `${base}/onboarding`)
  ) {
    return true;
  }
  return false;
}
