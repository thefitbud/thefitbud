import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Camera,
  ClipboardCheck,
  ClipboardList,
  Dumbbell,
  FileText,
  HeartHandshake,
  Pencil,
  Ruler,
  StickyNote,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import type { HistoryItem, HistoryItemKind } from "@fitbud/contracts";
import { formatCivilDate, labelFor } from "@fitbud/core";

/** Replace civil ISO dates embedded in API title strings. */
export function humanizeHistoryText(text: string): string {
  return text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (match) =>
    formatCivilDate(match),
  );
}

const KIND_ICON: Record<HistoryItemKind, LucideIcon> = {
  onboarding_submitted: FileText,
  onboarding_reviewed: ClipboardCheck,
  configuration_activated: ClipboardList,
  subscription_revision: HeartHandshake,
  plan_version: Pencil,
  workout_execution: Dumbbell,
  meal_compliance: UtensilsCrossed,
  checkin_submitted: ClipboardCheck,
  checkin_reviewed: ClipboardCheck,
  measurement: Ruler,
  progress_entry: TrendingUp,
  progress_photo: Camera,
  exception: AlertTriangle,
  trainer_note: StickyNote,
  intervention: HeartHandshake,
};

export function historyKindIcon(kind: HistoryItemKind): LucideIcon {
  return KIND_ICON[kind] ?? HeartHandshake;
}

function civilDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function parseCivilParts(civil: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(civil);
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  };
}

function toCivilString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday-start week key (civil date of that Monday in `timeZone`). */
export function historyWeekStartKey(iso: string, timeZone: string): string {
  const civil = civilDateInZone(iso, timeZone);
  const parts = parseCivilParts(civil);
  if (!parts) return civil;
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  const dow = date.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + diff);
  return toCivilString(date);
}

export function historyWeekHeading(weekStartCivil: string): string {
  return `Week of ${formatCivilDate(weekStartCivil, { includeWeekday: false })}`;
}

export type HistoryWeekGroup = {
  weekStart: string;
  heading: string;
  items: HistoryItem[];
};

export function groupHistoryByWeek(
  items: HistoryItem[],
  timeZone: string,
): HistoryWeekGroup[] {
  const byWeek = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const key = historyWeekStartKey(item.occurredAt, timeZone);
    const bucket = byWeek.get(key);
    if (bucket) bucket.push(item);
    else byWeek.set(key, [item]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekStart, weekItems]) => ({
      weekStart,
      heading: historyWeekHeading(weekStart),
      items: weekItems,
    }));
}

/** Tint of a row's icon tile: the v3 semantic tones, never raw colours. */
export type HistoryTone = "done" | "neutral" | "crit" | "warn" | "info" | "coach";

export function historyKindTone(
  item: Pick<HistoryItem, "kind" | "status">,
): HistoryTone {
  switch (item.kind) {
    case "meal_compliance":
      return item.status === "confirmed" ? "done" : "warn";
    case "workout_execution":
      return item.status === "skipped" ? "warn" : "done";
    case "checkin_submitted":
    case "checkin_reviewed":
    case "onboarding_submitted":
      return "info";
    case "exception":
      return "crit";
    case "intervention":
    case "onboarding_reviewed":
      return "coach";
    default:
      return "neutral";
  }
}

/** Who a row is about: the client, the trainer, or FitBud itself. */
export type HistoryActor = "client" | "trainer" | "system";

export type HistoryLine = {
  actor: HistoryActor;
  /** Sentence = lead + bold + tail, e.g. "Ananya " + "skipped" + " Lunch". */
  lead: string;
  bold: string;
  tail: string;
  /** Actor line under the sentence, e.g. "Logged by Ananya". */
  meta: string;
};

export type HistoryNames = { client: string; trainer: string };

/** First word of a display name ("Ananya Bose" -> "Ananya"). */
export function firstName(
  displayName: string | null | undefined,
  fallback = "The client",
): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || fallback;
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function stripEnd(text: string): string {
  return text.replace(/[.\s]+$/, "");
}

/** "Lunch on 2026-11-18 was Confirmed (Restaurant)." -> name + deviation. */
function parseOnWas(
  summary: string,
): { name: string; deviation: string | null } | null {
  const match = /^(.+?) on \d{4}-\d{2}-\d{2} was [^(]+?(?: \((.+)\))?\.?$/.exec(
    summary,
  );
  return match ? { name: match[1]!, deviation: match[2] ?? null } : null;
}

const WORKOUT_VERB: Record<string, string> = {
  completed: "completed",
  skipped: "skipped",
  started: "started",
  paused: "paused",
  modified: "changed",
};

const INTERVENTION_VERB: Record<string, string> = {
  note: "added a note",
  acknowledge: "noted an item and kept it open",
  resolve: "resolved an item",
  plan_adjustment: "adjusted the plan",
  schedule_checkin: "scheduled a check-in",
};

/**
 * One sentence plus an actor line for a history item, mapped on the client
 * from what `HistoryItem` carries (kind, status, title, summary). The contract
 * has no sentence field (W13-8). Names come from the workspace, never the item.
 */
export function historyLine(item: HistoryItem, names: HistoryNames): HistoryLine {
  const summary = humanizeHistoryText(item.summary);
  const { client, trainer } = names;
  const you = (bold: string, tail = "", meta = trainer): HistoryLine => ({
    actor: "trainer",
    lead: "You ",
    bold,
    tail,
    meta,
  });
  const byClient = (bold: string, tail: string, meta: string): HistoryLine => ({
    actor: "client",
    lead: `${client} `,
    bold,
    tail,
    meta,
  });
  switch (item.kind) {
    case "meal_compliance": {
      const parsed = parseOnWas(item.summary);
      const name = parsed?.name ?? "a meal";
      const dev = parsed?.deviation ? lowerFirst(parsed.deviation) : null;
      const meta = `Logged by ${client}${dev ? ` · ${dev}` : ""}`;
      if (item.status === "skipped") return byClient("skipped", ` ${name}`, meta);
      if (item.status === "modified") return byClient("changed", ` ${name}`, meta);
      return {
        actor: "client",
        lead: `${client} logged `,
        bold: `${name} as planned`,
        tail: "",
        meta,
      };
    }
    case "workout_execution": {
      const parsed = parseOnWas(item.summary);
      const verb = WORKOUT_VERB[item.status ?? ""] ?? "logged";
      return byClient(verb, ` ${parsed?.name ?? "a workout"}`, `Logged by ${client}`);
    }
    case "checkin_submitted":
      return byClient("sent a check-in", "", `Submitted by ${client}`);
    case "checkin_reviewed": {
      const outcome = item.status ? labelFor("checkin_review_outcome", item.status) : "";
      return you(
        "reviewed",
        ` ${client}’s check-in`,
        outcome ? `${trainer} · ${outcome}` : trainer,
      );
    }
    case "onboarding_submitted":
      return byClient("submitted", " the onboarding form", `Submitted by ${client}`);
    case "onboarding_reviewed":
      return you("marked", ` ${client} coaching ready`);
    case "configuration_activated": {
      const goal = /^Active expectations with goal: (.+)\.$/.exec(item.summary)?.[1];
      return you(
        "activated",
        " the coaching setup",
        goal ? `${trainer} · goal: ${goal}` : trainer,
      );
    }
    case "subscription_revision":
      return you("updated", " the subscription", `${trainer} · ${stripEnd(summary)}`);
    case "plan_version": {
      const match = /^Plan “(.+)” v(\d+) /.exec(item.title);
      const status = item.status ? labelFor("plan_version_status", item.status) : "";
      return you(
        "changed the plan",
        match ? `: ${match[1]} is now version ${match[2]}` : "",
        status ? `${trainer} · ${lowerFirst(status)}` : trainer,
      );
    }
    case "measurement": {
      const type = lowerFirst(item.title.replace(/^Measurement · /, ""));
      const value = stripEnd(item.summary.replace(/ recorded \(.*\)\.?$/, ""));
      if (/\(Trainer entry\)/.test(item.summary)) {
        return you(`recorded ${type}`, `: ${value}`, `Logged by ${trainer}`);
      }
      return byClient(`recorded ${type}`, `: ${value}`, `Logged by ${client}`);
    }
    case "progress_entry": {
      const kind = item.status
        ? lowerFirst(labelFor("progress_entry_type", item.status))
        : "note";
      const generic = /^Progress entry \(.*\)\.$/.test(item.summary);
      return byClient(
        kind === "note" ? "added a note" : `added a ${kind}`,
        generic ? "" : `: ${stripEnd(item.title)}`,
        `Added by ${client}`,
      );
    }
    case "progress_photo":
      return byClient("uploaded a progress photo", "", `Added by ${client}`);
    case "exception": {
      const type = item.title.replace(/^Exception · /, "");
      const state = item.status ? labelFor("exception_status", item.status) : "";
      const detail = stripEnd(summary.replace(/\s*\(status: [^)]*\)\.?$/, ""));
      return {
        actor: "system",
        lead: "",
        bold: type,
        // The API often repeats the type as the summary ("Overdue meal"): say it once.
        tail: detail && detail.toLowerCase() !== type.toLowerCase() ? `: ${detail}` : "",
        meta: state ? `FitBud · ${lowerFirst(state)}` : "FitBud",
      };
    }
    case "trainer_note":
      return you("added a note", `: ${stripEnd(summary)}`);
    case "intervention": {
      const verb = INTERVENTION_VERB[item.status ?? ""] ?? "recorded an action";
      return you(verb, summary ? `: ${stripEnd(summary)}` : "");
    }
    default:
      return { actor: "system", lead: "", bold: "", tail: summary, meta: "FitBud" };
  }
}

export type HistoryDayGroup = {
  /** Civil date in the trainer's timezone, e.g. "2026-11-18". */
  date: string;
  /** "Today", "Yesterday", or a date like "Tue 17 Nov". */
  heading: string;
  /** The date under Today / Yesterday ("Wed 18 Nov"); empty for older days. */
  sub: string;
  items: HistoryItem[];
};

function addDays(civil: string, days: number): string {
  const parts = parseCivilParts(civil);
  if (!parts) return civil;
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  date.setUTCDate(date.getUTCDate() + days);
  return toCivilString(date);
}

/** Newest day first, newest item first inside a day. */
export function groupHistoryByDay(
  items: HistoryItem[],
  timeZone: string,
  now: Date = new Date(),
): HistoryDayGroup[] {
  const today = civilDateInZone(now.toISOString(), timeZone);
  const yesterday = addDays(today, -1);
  const byDay = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const key = civilDateInZone(item.occurredAt, timeZone);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayItems]) => {
      const full = formatCivilDate(date, { now });
      const near = date === today ? "Today" : date === yesterday ? "Yesterday" : null;
      return {
        date,
        heading: near ?? full,
        sub: near ? full : "",
        items: [...dayItems].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      };
    });
}

/** Civil date `days` back from today in `timeZone` (History range menu). */
export function civilDaysAgo(
  days: number,
  timeZone: string,
  now: Date = new Date(),
): string {
  return addDays(civilDateInZone(now.toISOString(), timeZone), -days);
}

export function historySourceHref(
  relationshipId: string,
  item: HistoryItem,
): string | null {
  switch (item.kind) {
    case "plan_version":
    case "configuration_activated":
    case "subscription_revision":
      return `/clients/${relationshipId}/plan`;
    case "checkin_submitted":
      return `/clients/${relationshipId}/check-ins/${item.sourceEntityId}`;
    case "checkin_reviewed":
      return `/clients/${relationshipId}/check-ins`;
    case "exception":
      return `/clients/${relationshipId}/overview?exception=${item.sourceEntityId}`;
    case "trainer_note":
    case "onboarding_submitted":
    case "onboarding_reviewed":
      return `/clients/${relationshipId}/overview`;
    case "workout_execution":
    case "meal_compliance":
      return `/clients/${relationshipId}/activity`;
    case "measurement":
    case "progress_entry":
    case "progress_photo":
      return `/clients/${relationshipId}/progress`;
    case "intervention":
      return `/clients/${relationshipId}/overview`;
    default:
      return null;
  }
}

export function historySourceLabel(item: HistoryItem): string {
  switch (item.kind) {
    case "plan_version":
      return "View plan";
    case "checkin_submitted":
    case "checkin_reviewed":
      return "View check-in";
    case "exception":
      return "View item";
    case "trainer_note":
      return "View overview";
    case "workout_execution":
    case "meal_compliance":
      return "View activity";
    case "measurement":
    case "progress_entry":
    case "progress_photo":
      return "View progress";
    default:
      return "View source";
  }
}
