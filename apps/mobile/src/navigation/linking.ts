/**
 * Deep-link parser for fitbud:// and https://{host}/go/{kind}/{id} (TR-23).
 */
import type { LinkKind } from "@fitbud/contracts";

export type ParsedDeepLink = {
  kind: LinkKind;
  id: string;
  /** Optional query extras (e.g. note id on today). */
  query?: Record<string, string>;
};

const LINK_KINDS = new Set<LinkKind>([
  "meal",
  "workout",
  "checkin",
  "exception",
  "ask",
  "plan",
  "client",
  "today",
  "note",
  "reactivate",
]);

function isLinkKind(value: string): value is LinkKind {
  return LINK_KINDS.has(value as LinkKind);
}

/** Parse app-scheme or https /go/ URLs into {kind, id}. */
export function parseDeepLinkUrl(raw: string): ParsedDeepLink | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const withScheme = trimmed.includes("://")
      ? trimmed
      : trimmed.startsWith("/")
        ? `https://fitbud.app${trimmed}`
        : `https://fitbud.app/${trimmed}`;
    const url = new URL(withScheme);
    const path = url.pathname.replace(/\/+$/, "");

    // /go/{kind}/{id}
    const goMatch = path.match(/^\/go\/([a-z]+)\/([^/]+)$/i);
    if (goMatch) {
      const kind = goMatch[1]!.toLowerCase();
      if (!isLinkKind(kind)) return null;
      return {
        kind,
        id: decodeURIComponent(goMatch[2]!),
        query: Object.fromEntries(url.searchParams.entries()),
      };
    }

    // fitbud://{kind}/{id} → host=kind, pathname=/{id}
    // fitbud://go/{kind}/{id} → host=go, pathname=/{kind}/{id}
    if (url.protocol === "fitbud:") {
      const host = url.hostname.toLowerCase();
      const parts = path.replace(/^\//, "").split("/").filter(Boolean);
      if (host === "go" && parts.length >= 2) {
        const kind = parts[0]!.toLowerCase();
        if (!isLinkKind(kind)) return null;
        return {
          kind,
          id: decodeURIComponent(parts[1]!),
          query: Object.fromEntries(url.searchParams.entries()),
        };
      }
      if (isLinkKind(host) && parts.length >= 1) {
        return {
          kind: host,
          id: decodeURIComponent(parts[0]!),
          query: Object.fromEntries(url.searchParams.entries()),
        };
      }
    }

    // Dated today: /today/:date
    const todayMatch = path.match(/^\/today\/(\d{4}-\d{2}-\d{2})$/);
    if (todayMatch) {
      return { kind: "today", id: todayMatch[1]! };
    }

    // Direct routes used in notification table
    const direct: Array<[RegExp, LinkKind]> = [
      [/^\/meal\/([^/]+)$/, "meal"],
      [/^\/workout\/([^/]+)$/, "workout"],
      [/^\/checkin\/([^/]+)$/, "checkin"],
      [/^\/progress$/, "today"],
      [/^\/notifications$/, "today"],
      [/^\/today$/, "today"],
    ];
    for (const [re, kind] of direct) {
      const m = path.match(re);
      if (m) {
        return {
          kind,
          id: m[1] ? decodeURIComponent(m[1]) : "self",
          query: Object.fromEntries(url.searchParams.entries()),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export type ResolvedAppRoute =
  | { type: "tab"; tab: "today" | "workout" | "diet" | "progress" | "more" }
  | { type: "workout_overview"; assignmentId: string }
  | { type: "workout_active"; assignmentId: string }
  | { type: "workout_summary"; executionId: string }
  | { type: "meal"; assignmentId: string }
  | { type: "checkin"; checkinId: string }
  | { type: "note"; noteId: string }
  | { type: "reactivate"; requestId: string }
  | { type: "reminders" }
  | { type: "unavailable"; reason: string }
  | { type: "resolving" };

/** Map a parsed deep link to an in-app route target (before availability check). */
export function routeFromParsedLink(link: ParsedDeepLink): ResolvedAppRoute {
  switch (link.kind) {
    case "meal":
      return { type: "meal", assignmentId: link.id };
    case "workout":
      return { type: "workout_overview", assignmentId: link.id };
    case "checkin":
      return { type: "checkin", checkinId: link.id };
    case "note":
      return { type: "note", noteId: link.id };
    case "reactivate":
      return { type: "reactivate", requestId: link.id };
    case "plan":
      return { type: "tab", tab: "diet" };
    case "today":
      return { type: "tab", tab: "today" };
    case "ask":
    case "exception":
    case "client":
      return { type: "tab", tab: "today" };
    default: {
      const _exhaustive: never = link.kind;
      return _exhaustive;
    }
  }
}
