import {
  adherenceStateSchema,
  onboardingStatusSchema,
  type AdherenceState,
  type CheckinStatus,
  type ClientDirectoryItem,
  type OnboardingStatus,
} from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";

export const CLIENT_STATUS_FILTERS = [
  "invited",
  "onboarding_pending",
  "onboarding_submitted",
  "coaching_ready",
  "active",
] as const satisfies readonly OnboardingStatus[];

export const CLIENT_ADHERENCE_FILTERS = adherenceStateSchema.options;

export const CLIENT_RENEWAL_FILTERS = ["upcoming", "due", "expired"] as const;
export type RenewalFilter = (typeof CLIENT_RENEWAL_FILTERS)[number];

const DIRECTORY_SCAN_LIMIT = 50;
const DIRECTORY_SCAN_PAGES = 40;

export type ClientDirectorySegment = "current" | "ended";

export type ClientDirectoryFilters = {
  q: string;
  status: OnboardingStatus[];
  adherenceState: AdherenceState[];
  goal: string[];
  renewal: RenewalFilter[];
  segment: ClientDirectorySegment;
};

export type ClientDirectoryListQuery = {
  q?: string;
  status?: OnboardingStatus[];
  adherenceState?: AdherenceState[];
  goal?: string[];
  renewal?: RenewalFilter[];
  cursor?: string;
  limit?: number;
};

export function emptyClientDirectoryFilters(): ClientDirectoryFilters {
  return {
    q: "",
    status: [],
    adherenceState: [],
    goal: [],
    renewal: [],
    segment: "current",
  };
}

export function onboardingStatusLabel(status: OnboardingStatus): string {
  return labelFor("onboarding_status", status);
}

/** One contextual action per roster row (TW-06). */
export function primaryActionForStatus(
  status: OnboardingStatus,
  invitationId?: string | null,
): {
  label: string;
  href: string | null;
} {
  switch (status) {
    case "invited":
      return {
        label: "Resend invite",
        href: invitationId ? `/invitations/${invitationId}` : null,
      };
    case "onboarding_pending":
      return { label: "View onboarding", href: "onboarding" };
    case "onboarding_submitted":
      return { label: "Review intake", href: "onboarding" };
    case "coaching_ready":
      return { label: "Set up plan", href: "plan" };
    case "active":
      return { label: "Open", href: "overview" };
    case "ended":
      return { label: "Reactivate", href: "overview" };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function adherenceStateLabel(state: AdherenceState): string {
  return labelFor("adherence_state", state);
}

export function checkinStatusLabel(status: CheckinStatus): string {
  return labelFor("checkin_status", status);
}

export function renewalFilterLabel(value: RenewalFilter): string {
  if (value === "upcoming") return "Upcoming";
  if (value === "due") return "Due";
  return "Expired";
}

/**
 * Workspace path for one directory row.
 * Pending invitations open TW-08 invitation detail.
 */
export function directoryWorkspaceHref(item: {
  relationshipId: string | null;
  invitationId: string | null;
  status: OnboardingStatus;
}): string | null {
  if (item.status === "invited" && item.invitationId) {
    return `/invitations/${item.invitationId}`;
  }
  if (!item.relationshipId) return null;
  const action = primaryActionForStatus(item.status, item.invitationId);
  if (!action.href || action.href.startsWith("/")) return action.href;
  return `/clients/${item.relationshipId}/${action.href}`;
}

export function hasClientDirectoryFilters(
  filters: ClientDirectoryFilters,
): boolean {
  return (
    filters.q.trim().length > 0 ||
    filters.status.length > 0 ||
    filters.adherenceState.length > 0 ||
    filters.goal.length > 0 ||
    filters.renewal.length > 0
  );
}

export function parseClientDirectoryFilters(
  params: URLSearchParams,
): ClientDirectoryFilters {
  const statuses = uniqueInOrder(
    onboardingStatusSchema.options,
    params.getAll("status"),
  );
  const onlyEnded =
    statuses.length > 0 && statuses.every((s) => s === "ended");
  const segment: ClientDirectorySegment =
    params.get("segment") === "ended" || onlyEnded ? "ended" : "current";

  return {
    q: params.get("q") ?? "",
    status:
      segment === "ended"
        ? ["ended"]
        : statuses.filter((s) => s !== "ended"),
    adherenceState: uniqueInOrder(
      CLIENT_ADHERENCE_FILTERS,
      params.getAll("adherenceState"),
    ),
    goal: uniqueGoals(params.getAll("goal")),
    renewal: uniqueInOrder(CLIENT_RENEWAL_FILTERS, params.getAll("renewal")),
    segment,
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
  params.delete("renewal");
  params.delete("segment");
  params.delete("cursor");
  if (filters.q) params.set("q", filters.q);
  if (filters.segment === "ended") {
    params.append("status", "ended");
    params.set("segment", "ended");
  } else {
    for (const status of filters.status) {
      if (status !== "ended") params.append("status", status);
    }
  }
  for (const state of filters.adherenceState) {
    params.append("adherenceState", state);
  }
  for (const goal of filters.goal) params.append("goal", goal);
  for (const renewal of filters.renewal) params.append("renewal", renewal);
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
    renewal: filters.renewal,
    segment: filters.segment,
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
    renewal?: unknown;
    segment?: unknown;
  };
  const params = new URLSearchParams();
  if (typeof record.q === "string") params.set("q", record.q);
  if (record.segment === "ended") params.set("segment", "ended");
  appendStrings(params, "status", record.status);
  appendStrings(params, "adherenceState", record.adherenceState);
  appendStrings(params, "goal", record.goal);
  appendStrings(params, "renewal", record.renewal);
  return parseClientDirectoryFilters(params);
}

/**
 * Builds the list query. Current segment never asks for ended rows
 * (spec decision 12). When no status pills are selected on Current,
 * every non-ended lifecycle is requested so ended stays out.
 */
export function clientDirectoryListQuery(
  filters: ClientDirectoryFilters,
  options?: { cursor?: string | null; limit?: number },
): ClientDirectoryListQuery {
  const q = filters.q.trim();
  let status: OnboardingStatus[] | undefined;
  if (filters.segment === "ended") {
    status = ["ended"];
  } else if (filters.status.length > 0) {
    status = filters.status.filter((s) => s !== "ended");
  } else {
    status = [...CLIENT_STATUS_FILTERS];
  }
  return {
    ...(q ? { q } : {}),
    ...(status && status.length > 0 ? { status } : {}),
    ...(filters.adherenceState.length > 0
      ? { adherenceState: filters.adherenceState }
      : {}),
    ...(filters.goal.length > 0 ? { goal: filters.goal } : {}),
    ...(filters.renewal.length > 0 ? { renewal: filters.renewal } : {}),
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
