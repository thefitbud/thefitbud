/**
 * Client workspace tab strip (TW-09a).
 *
 * Every `/clients/:relationshipId/*` screen that uses WorkspaceHeader renders
 * this list, in this order. Sessions, Packages, and Configure are not tabs.
 * Configure coaching stays on the header overflow menu and on existing
 * in-page links.
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
 * Nested routes such as check-in review stay on their parent tab.
 * Configure and onboarding match none of these tabs.
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
  return false;
}
