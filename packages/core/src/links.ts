export type LinkKind =
  | "meal"
  | "workout"
  | "checkin"
  | "exception"
  | "ask"
  | "plan"
  | "client"
  | "today"
  | "progress"
  | "note"
  | "reactivate";

const ROUTES: Record<LinkKind, string> = {
  meal: "/me/day/:date",
  workout: "/me/day/:date",
  checkin: "/checkins/:id",
  exception: "/exceptions/:id",
  ask: "/coach-asks/:id",
  plan: "/plans/:id",
  client: "/clients/:id",
  today: "/me/day/today",
  progress: "/me/progress",
  note: "/me/coach-notes/:id",
  reactivate: "/relationships/:id/reactivate/confirm",
};

export function routeForLinkKind(kind: LinkKind, id: string, date?: string): string {
  const template = ROUTES[kind];
  return template
    .replace(":id", id)
    .replace(":date", date ?? "today");
}
