import {
  adherenceStateSchema,
  onboardingStatusSchema,
  type AdherenceState,
  type CheckinStatus,
  type ClientDirectoryItem,
  type OnboardingStatus,
} from "@fitbud/contracts";

export const CLIENT_STATUS_FILTERS = onboardingStatusSchema.options;
export const CLIENT_ADHERENCE_FILTERS = adherenceStateSchema.options;

const DIRECTORY_SCAN_LIMIT = 50;
const DIRECTORY_SCAN_PAGES = 40;

export type ClientDirectoryFilters = {
  q: string;
  status: OnboardingStatus[];
  adherenceState: AdherenceState[];
  goal: string[];
};

export type ClientDirectoryListQuery = {
  q?: string;
  status?: OnboardingStatus[];
  adherenceState?: AdherenceState[];
  goal?: string[];
  cursor?: string;
  limit?: number;
};

export function emptyClientDirectoryFilters(): ClientDirectoryFilters {
  return { q: "", status: [], adherenceState: [], goal: [] };
}

export function onboardingStatusLabel(status: OnboardingStatus): string {
  switch (status) {
    case "invited":
      return "Invited";
    case "onboarding_pending":
      return "Onboarding pending";
    case "onboarding_submitted":
      return "Onboarding submitted";
    case "coaching_ready":
      return "Coaching ready";
    case "active":
      return "Active";
    case "ended":
      return "Ended";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function primaryActionForStatus(status: OnboardingStatus): {
  label: string;
  href: string | null;
} {
  switch (status) {
    case "invited":
      return { label: "Waiting for acceptance", href: null };
    case "onboarding_pending":
      return { label: "View onboarding", href: "onboarding" };
    case "onboarding_submitted":
      return { label: "Review intake", href: "onboarding" };
    case "coaching_ready":
    case "active":
      return { label: "Open workspace", href: "overview" };
    case "ended":
      return { label: "Ended", href: null };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function adherenceStateLabel(state: AdherenceState): string {
  switch (state) {
    case "on_track":
      return "On track";
    case "needs_attention":
      return "Needs attention";
    case "no_recent_data":
      return "No recent data";
    case "not_available":
      return "Not available";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function checkinStatusLabel(status: CheckinStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "due":
      return "Due";
    case "submitted":
      return "Submitted";
    case "reviewed":
      return "Reviewed";
    case "overdue":
      return "Overdue";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Workspace path for one directory row.
 * Pending invitations have a null relationship id and stay unlinkable.
 */
export function directoryWorkspaceHref(item: {
  relationshipId: string | null;
  status: OnboardingStatus;
}): string | null {
  if (!item.relationshipId) return null;
  const action = primaryActionForStatus(item.status);
  if (!action.href) return null;
  return `/clients/${item.relationshipId}/${action.href}`;
}

export function hasClientDirectoryFilters(
  filters: ClientDirectoryFilters,
): boolean {
  return (
    filters.q.trim().length > 0 ||
    filters.status.length > 0 ||
    filters.adherenceState.length > 0 ||
    filters.goal.length > 0
  );
}

export function parseClientDirectoryFilters(
  params: URLSearchParams,
): ClientDirectoryFilters {
  return {
    q: params.get("q") ?? "",
    status: uniqueInOrder(CLIENT_STATUS_FILTERS, params.getAll("status")),
    adherenceState: uniqueInOrder(
      CLIENT_ADHERENCE_FILTERS,
      params.getAll("adherenceState"),
    ),
    goal: uniqueGoals(params.getAll("goal")),
  };
}

export function writeClientDirectoryFilters(
  current: URLSearchParams,
  filters: ClientDirectoryFilters,
): URLSearchParams {
  const params = new URLSearchParams(current);
  params.delete("q");
  params.delete("status");
  params.delete("adherenceState");
  params.delete("goal");
  params.delete("cursor");
  if (filters.q) params.set("q", filters.q);
  for (const status of filters.status) params.append("status", status);
  for (const state of filters.adherenceState) {
    params.append("adherenceState", state);
  }
  for (const goal of filters.goal) params.append("goal", goal);
  return params;
}

export function clientDirectoryFilterKey(
  filters: ClientDirectoryFilters,
): string {
  return JSON.stringify({
    q: filters.q,
    status: filters.status,
    adherenceState: filters.adherenceState,
    goal: filters.goal,
  });
}

export function clientDirectoryFiltersFromKey(
  key: string,
): ClientDirectoryFilters {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch {
    return emptyClientDirectoryFilters();
  }
  if (!parsed || typeof parsed !== "object") {
    return emptyClientDirectoryFilters();
  }
  const record = parsed as {
    q?: unknown;
    status?: unknown;
    adherenceState?: unknown;
    goal?: unknown;
  };
  const params = new URLSearchParams();
  if (typeof record.q === "string") params.set("q", record.q);
  appendStrings(params, "status", record.status);
  appendStrings(params, "adherenceState", record.adherenceState);
  appendStrings(params, "goal", record.goal);
  return parseClientDirectoryFilters(params);
}

/** First page omits cursor. Passing null or "" also omits it so a filter change does not resume an old page. */
export function clientDirectoryListQuery(
  filters: ClientDirectoryFilters,
  options?: { cursor?: string | null; limit?: number },
): ClientDirectoryListQuery {
  const q = filters.q.trim();
  return {
    ...(q ? { q } : {}),
    ...(filters.status.length > 0 ? { status: filters.status } : {}),
    ...(filters.adherenceState.length > 0
      ? { adherenceState: filters.adherenceState }
      : {}),
    ...(filters.goal.length > 0 ? { goal: filters.goal } : {}),
    ...(options?.cursor ? { cursor: options.cursor } : {}),
    ...(options?.limit !== undefined ? { limit: options.limit } : {}),
  };
}

export function toggleClientDirectoryValue<T extends string>(
  order: readonly T[],
  selected: readonly T[],
  value: T,
): T[] {
  const next = new Set(selected);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  const known = order.filter((item) => next.has(item));
  const extras = [...next].filter((item) => !order.includes(item));
  return [...known, ...extras];
}

/** Distinct short goals from directory rows. Blank goals are omitted. Order is alphabetical. */
export function distinctGoalShorts(
  items: readonly { goalShort: string | null }[],
): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const goal = item.goalShort?.trim() ?? "";
    if (!goal || goal.length > 120) continue;
    seen.add(goal);
  }
  return [...seen].sort((left, right) => left.localeCompare(right));
}

export function clientDirectoryItemKey(item: {
  relationshipId: string | null;
  invitationId: string | null;
}): string {
  if (item.relationshipId) return `relationship:${item.relationshipId}`;
  if (item.invitationId) return `invitation:${item.invitationId}`;
  return "client:unknown";
}

/**
 * Follows nextCursor until the directory read is exhausted.
 * Callers that want goal options pass empty filters so `goal` is not sent.
 */
export async function pageClientDirectory(
  listClients: (query?: ClientDirectoryListQuery) => Promise<{
    items: ClientDirectoryItem[];
    nextCursor: string | null;
  }>,
  filters: ClientDirectoryFilters = emptyClientDirectoryFilters(),
  options?: { limit?: number; maxPages?: number },
): Promise<ClientDirectoryItem[]> {
  const limit = options?.limit ?? DIRECTORY_SCAN_LIMIT;
  const maxPages = options?.maxPages ?? DIRECTORY_SCAN_PAGES;
  const items: ClientDirectoryItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await listClients(
      clientDirectoryListQuery(filters, { cursor, limit }),
    );
    items.push(...result.items);
    if (!result.nextCursor || result.nextCursor === cursor) break;
    cursor = result.nextCursor;
  }
  return items;
}

function uniqueInOrder<T extends string>(
  order: readonly T[],
  values: readonly string[],
): T[] {
  const allowed = new Set<string>(order);
  const selected = new Set<T>();
  for (const value of values) {
    if (!allowed.has(value)) continue;
    selected.add(value as T);
  }
  return order.filter((item) => selected.has(item));
}

function uniqueGoals(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const goals: string[] = [];
  for (const value of values) {
    const goal = value.trim();
    if (!goal || goal.length > 120 || seen.has(goal)) continue;
    seen.add(goal);
    goals.push(goal);
  }
  return goals;
}

function appendStrings(
  params: URLSearchParams,
  key: string,
  values: unknown,
): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value === "string") params.append(key, value);
  }
}
