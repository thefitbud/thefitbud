/**
 * Needs you v3 (TM-01*): summary grid tiles and reason sections.
 * Pure model — no React. Grouping follows docs/design/v3/src/kit_trainer.py
 * and b_needsyou.py.
 */
import type {
  AttentionGroupsResponse,
  CoachAsk,
  TrainerCheckinInboxItem,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatPersonName,
  labelFor,
} from "@fitbud/core";
import {
  attentionIssueLine,
  buildClientAttentionCards,
  formatAttentionAge,
  latestAcknowledgedAt,
  oldestItemAgeMinutes,
  type ClientAttentionCard,
} from "../attentionCards";

type AttentionGroup = AttentionGroupsResponse["groups"][number];
type AttentionGroupItem = AttentionGroup["items"][number];

const OFF_PLAN_TYPES = new Set<AttentionGroupItem["type"]>(["meal_deviation"]);

const MISSED_TYPES = new Set<AttentionGroupItem["type"]>([
  "missed_workout",
  "skipped_workout",
  "overdue_meal",
  "skipped_meal",
  "meal_logged_later",
  "overdue_checkin",
]);

export type NeedsYouTileId = "missed" | "asked" | "checkins" | "off";

export type NeedsYouTile = {
  id: NeedsYouTileId;
  label: string;
  count: number;
  sub: string;
};

export type NeedsYouChipKind =
  | "critical"
  | "attention"
  | "pain"
  | "ask"
  | "checkin"
  | "off"
  | "reviewed";

export type NeedsYouCardModel = {
  key: string;
  relationshipId: string;
  name: string;
  issue: string;
  age: string;
  chip: { kind: NeedsYouChipKind; label: string } | null;
  action: "Review" | "Reply" | null;
  /** Source for the action handler. */
  source:
    | { kind: "exception"; card: ClientAttentionCard }
    | { kind: "ask"; ask: CoachAsk }
    | { kind: "checkin"; item: TrainerCheckinInboxItem };
};

export type NeedsYouSectionId =
  | "missed"
  | "asked"
  | "checkins"
  | "off"
  | "reviewed";

export type NeedsYouSection = {
  id: NeedsYouSectionId;
  title: string;
  count: number;
  hint: string | null;
  cards: NeedsYouCardModel[];
};

export type NeedsYouScreenModel = {
  eyebrow: string;
  tiles: NeedsYouTile[];
  sections: NeedsYouSection[];
  /** Unique clients across actionable sections (not reviewed-only). */
  clientCount: number;
  allCaughtUp: boolean;
};

/** D-W14-29: the acknowledged section and its rows. */
export const NOTED_SECTION_TITLE = "Noted, still open";
const NOTED_CHIP = "Noted";

/** "Noted · 9:52 am", or "Noted" when the server gave no time. */
export function notedChipLabel(
  acknowledgedAt: string | null,
  timeZone?: string,
): string {
  if (!acknowledgedAt) return NOTED_CHIP;
  try {
    const clock = formatClockTime(acknowledgedAt, timeZone ?? "Asia/Kolkata");
    return clock ? `${NOTED_CHIP} · ${clock}` : NOTED_CHIP;
  } catch {
    return NOTED_CHIP;
  }
}

/** D-W14-25: rows a section shows before "See all". */
export const SECTION_PREVIEW_ROWS = 3;

/** What each section's count is called in "See all 5 missed". */
const SEE_ALL_NOUN: Record<NeedsYouSectionId, string> = {
  missed: "missed",
  asked: "asked",
  checkins: "check-ins",
  off: "off plan",
  reviewed: "noted",
};

export function seeAllLabel(section: NeedsYouSection): string | null {
  if (section.cards.length <= SECTION_PREVIEW_ROWS) return null;
  return `See all ${section.cards.length} ${SEE_ALL_NOUN[section.id]}`;
}

/** Rows drawn on Attention for a section: none when collapsed, else the first 3. */
export function visibleCards(
  section: NeedsYouSection,
  collapsed: boolean,
): NeedsYouCardModel[] {
  return collapsed ? [] : section.cards.slice(0, SECTION_PREVIEW_ROWS);
}

/** Index of the section a tile jumps to, or null (zero tile: muted, not pressable). */
export function jumpSectionIndex(
  model: NeedsYouScreenModel,
  id: NeedsYouSectionId,
): number | null {
  const index = model.sections.findIndex((s) => s.id === id);
  return index < 0 ? null : index;
}

/** The pills of the sticky row: the four tiles, plus Noted when that section exists. */
export type NeedsYouPill = {
  id: NeedsYouSectionId;
  label: string;
  count: number;
};

export function pillsFor(model: NeedsYouScreenModel): NeedsYouPill[] {
  const pills: NeedsYouPill[] = model.tiles.map((t) => ({
    id: t.id,
    label: t.label,
    count: t.count,
  }));
  const noted = model.sections.find((s) => s.id === "reviewed");
  if (noted) pills.push({ id: "reviewed", label: "Noted", count: noted.count });
  return pills;
}

const OPEN_STATUSES: ReadonlySet<AttentionGroupItem["status"]> = new Set([
  "detected",
  "active",
]);
const NOTED_STATUSES: ReadonlySet<AttentionGroupItem["status"]> = new Set([
  "acknowledged",
]);

function projectGroup(
  group: AttentionGroup,
  predicate: (item: AttentionGroupItem) => boolean,
  statuses: ReadonlySet<AttentionGroupItem["status"]> = OPEN_STATUSES,
): AttentionGroup | null {
  const items = group.items.filter(
    (item) => statuses.has(item.status) && predicate(item),
  );
  if (items.length === 0) return null;
  const mostSevere = items.some((item) => item.severity === "critical")
    ? "critical"
    : "attention";
  return {
    ...group,
    items,
    itemCount: items.length,
    mostSevere,
    oldestAgeMinutes: items.reduce(
      (max, item) => Math.max(max, item.ageMinutes),
      0,
    ),
  };
}

function severityChip(
  severity: AttentionGroupItem["severity"],
): NeedsYouCardModel["chip"] {
  if (severity === "critical") {
    return { kind: "critical", label: "Critical" };
  }
  return { kind: "attention", label: "Attention" };
}

function exceptionCards(
  groups: AttentionGroup[],
  predicate: (item: AttentionGroupItem) => boolean,
  chip: (card: ClientAttentionCard) => NeedsYouCardModel["chip"],
  action: "Review" | null = "Review",
  statuses: ReadonlySet<AttentionGroupItem["status"]> = OPEN_STATUSES,
): NeedsYouCardModel[] {
  const projected = groups
    .map((group) => projectGroup(group, predicate, statuses))
    .filter((group): group is AttentionGroup => group != null);
  return buildClientAttentionCards(projected).map((card) => {
    const items =
      projected.find((g) => g.relationshipId === card.relationshipId)?.items ??
      [card.primary];
    return {
      key: `ex:${card.relationshipId}`,
      relationshipId: card.relationshipId,
      name: formatPersonName(card.traineeDisplayName),
      issue: attentionIssueLine(items),
      // The frames show a bare age ("5 d"); the section already says it is open.
      age: formatAttentionAge(oldestItemAgeMinutes(items)).replace(/^since\s+/, ""),
      chip: chip(card),
      action,
      source: { kind: "exception", card },
    };
  });
}

/** Topic "pain" (and copy that mentions pain) get the Mentions pain chip. */
export function askMentionsPain(ask: CoachAsk): boolean {
  const topic = ask.topic.trim().toLowerCase();
  if (topic === "pain" || topic.includes("pain")) return true;
  const label = (ask.itemLabel ?? "").toLowerCase();
  return /\bpain\b|\btight\b|\bsore\b/.test(label);
}

export function askIssueLine(ask: CoachAsk): string {
  const label = ask.itemLabel?.trim();
  if (label) {
    // Quotes when it already looks like a client question.
    if (label.includes("?") || label.includes("“") || label.includes('"')) {
      return label.startsWith("“") || label.startsWith('"')
        ? label
        : `“${label.replace(/^["“]|["”]$/g, "")}”`;
    }
    return label;
  }
  return labelFor("coach_ask_topic", ask.topic);
}

/** Short age for ask / check-in rows: "12 min", "2 h", "1 d". */
export function shortAgeLabel(ageMinutes: number): string {
  if (ageMinutes < 60) {
    const m = Math.max(1, Math.round(ageMinutes));
    return `${m} min`;
  }
  if (ageMinutes < 24 * 60) {
    const h = Math.max(1, Math.round(ageMinutes / 60));
    return `${h} h`;
  }
  const d = Math.max(1, Math.round(ageMinutes / (24 * 60)));
  return `${d} d`;
}

function ageMinutesSince(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((nowMs - t) / 60_000));
}

function askCards(
  asks: CoachAsk[],
  names: Record<string, string>,
  nowMs: number,
): NeedsYouCardModel[] {
  return [...asks]
    .sort(
      (a, b) =>
        Date.parse(b.lastAskedAt) - Date.parse(a.lastAskedAt) ||
        a.id.localeCompare(b.id),
    )
    .map((ask) => {
      const pain = askMentionsPain(ask);
      const name =
        names[ask.relationshipId] != null
          ? formatPersonName(names[ask.relationshipId]!)
          : labelFor("coach_ask_topic", ask.topic);
      return {
        key: `ask:${ask.id}`,
        relationshipId: ask.relationshipId,
        name,
        issue: askIssueLine(ask),
        age: shortAgeLabel(ageMinutesSince(ask.lastAskedAt, nowMs)),
        chip: pain
          ? { kind: "pain", label: "Mentions pain" }
          : { kind: "ask", label: "Asked you" },
        action: "Reply" as const,
        source: { kind: "ask" as const, ask },
      };
    });
}

function checkinLine(item: TrainerCheckinInboxItem): string {
  // Inbox has no week/photo fields; civil due date keeps the row grounded.
  return `Weekly check-in · ${formatCivilDate(item.checkin.localDate)}`;
}

function checkinCards(
  checkins: TrainerCheckinInboxItem[],
  nowMs: number,
): NeedsYouCardModel[] {
  return [...checkins]
    .sort((a, b) =>
      (a.checkin.submittedAt ?? a.checkin.localDate).localeCompare(
        b.checkin.submittedAt ?? b.checkin.localDate,
      ),
    )
    .map((item) => {
      const name = formatPersonName(item.traineeDisplayName ?? "Client");
      const submitted = item.checkin.submittedAt;
      const age = submitted
        ? shortAgeLabel(ageMinutesSince(submitted, nowMs))
        : formatCivilDate(item.checkin.localDate);
      return {
        key: `ci:${item.checkin.id}`,
        relationshipId: item.coachingRelationshipId,
        name,
        issue: checkinLine(item),
        age,
        chip: { kind: "checkin" as const, label: "To review" },
        action: "Review" as const,
        source: { kind: "checkin" as const, item },
      };
    });
}

function criticalCount(groups: AttentionGroup[]): number {
  let n = 0;
  for (const group of groups) {
    for (const item of group.items) {
      if (
        (item.status === "detected" || item.status === "active") &&
        MISSED_TYPES.has(item.type) &&
        item.severity === "critical"
      ) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

function offPlanSub(groups: AttentionGroup[]): string {
  const cards = exceptionCards(
    groups,
    (item) => OFF_PLAN_TYPES.has(item.type),
    () => ({ kind: "off", label: "Off plan" }),
  );
  if (cards.length === 0) return "none";
  // Prefer the mock-shaped "N of M days over" clause when the summary has it.
  const issue = cards[0]!.issue;
  const over = issue.match(/(\d+)\s+of(?:\s+the\s+last)?\s+(\d+)\s+days?(?:\s+over)?/i);
  if (over) return `${over[1]} of ${over[2]} days over`;
  return issue.length > 28 ? `${issue.slice(0, 26)}…` : issue;
}

function checkinsSub(checkins: TrainerCheckinInboxItem[], nowMs: number): string {
  if (checkins.length === 0) return "none";
  let oldest = 0;
  for (const item of checkins) {
    const iso = item.checkin.submittedAt;
    if (!iso) continue;
    oldest = Math.max(oldest, ageMinutesSince(iso, nowMs));
  }
  if (oldest <= 0) return "to review";
  const days = Math.max(1, Math.round(oldest / (24 * 60)));
  return days === 1 ? "oldest 1 d" : `oldest ${days} d`;
}

function askedSub(asks: CoachAsk[]): string {
  if (asks.length === 0) return "none";
  const pain = asks.filter(askMentionsPain).length;
  if (pain === 0) return "open";
  return pain === 1 ? "1 with pain" : `${pain} with pain`;
}

function missedSub(groups: AttentionGroup[], missedCount: number): string {
  if (missedCount === 0) return "none";
  const crit = criticalCount(groups);
  if (crit === 0) return "open";
  return crit === 1 ? "1 critical" : `${crit} critical`;
}

/**
 * Eyebrow under the status bar: date alone when empty, else
 * "Saturday, 14 Nov · 7 clients need you". Offline overrides with "as of".
 */
export function needsYouEyebrow(input: {
  dateLabel: string;
  clientCount: number;
  offlineClock: string | null;
}): string {
  if (input.offlineClock) {
    return `${input.dateLabel} · as of ${input.offlineClock}`;
  }
  if (input.clientCount <= 0) return input.dateLabel;
  const noun = input.clientCount === 1 ? "client needs" : "clients need";
  return `${input.dateLabel} · ${input.clientCount} ${noun} you`;
}

export function buildNeedsYouScreenModel(input: {
  needsYou: AttentionGroup[];
  reviewed: AttentionGroup[];
  asks: CoachAsk[];
  checkins: TrainerCheckinInboxItem[];
  clientNames: Record<string, string>;
  dateLabel: string;
  offlineClock?: string | null;
  nowMs?: number;
  /** Zone for the "Noted · 9:52 am" time (the trainer's device zone). */
  timeZone?: string;
}): NeedsYouScreenModel {
  const nowMs = input.nowMs ?? Date.now();
  const missed = exceptionCards(
    input.needsYou,
    (item) => MISSED_TYPES.has(item.type),
    (card) => severityChip(card.primary.severity),
  );
  const off = exceptionCards(
    input.needsYou,
    (item) => OFF_PLAN_TYPES.has(item.type),
    () => ({ kind: "off", label: "Off plan" }),
  );
  const asked = askCards(input.asks, input.clientNames, nowMs);
  const checkins = checkinCards(input.checkins, nowMs);
  const reviewed = exceptionCards(
    input.reviewed,
    () => true,
    () => ({ kind: "reviewed", label: NOTED_CHIP }),
    null,
    NOTED_STATUSES,
  ).map((card) => {
    const group = input.reviewed.find(
      (g) => g.relationshipId === card.relationshipId,
    );
    const at = latestAcknowledgedAt(group?.items ?? []);
    return {
      ...card,
      // Noted rows use a short age ("2 d"), not "since N d".
      age: card.age.replace(/^since\s+/, ""),
      chip: {
        kind: "reviewed" as const,
        label: notedChipLabel(at, input.timeZone),
      },
    };
  });

  const tiles: NeedsYouTile[] = [
    {
      id: "missed",
      label: "Missed",
      count: missed.length,
      sub: missedSub(input.needsYou, missed.length),
    },
    {
      id: "asked",
      label: "Asked",
      count: asked.length,
      sub: askedSub(input.asks),
    },
    {
      id: "checkins",
      label: "Check-ins",
      count: checkins.length,
      sub: checkinsSub(input.checkins, nowMs),
    },
    {
      id: "off",
      label: "Off plan",
      count: off.length,
      sub: off.length === 0 ? "none" : offPlanSub(input.needsYou),
    },
  ];

  const sections: NeedsYouSection[] = [];
  if (missed.length > 0) {
    sections.push({
      id: "missed",
      title: "Missed",
      count: missed.length,
      hint: null,
      cards: missed,
    });
  }
  if (asked.length > 0) {
    sections.push({
      id: "asked",
      title: "Asked you",
      count: asked.length,
      hint: null,
      cards: asked,
    });
  }
  if (checkins.length > 0) {
    sections.push({
      id: "checkins",
      title: "Check-ins to review",
      count: checkins.length,
      hint: null,
      cards: checkins,
    });
  }
  if (off.length > 0) {
    sections.push({
      id: "off",
      title: "Off plan",
      count: off.length,
      hint: null,
      cards: off,
    });
  }
  if (reviewed.length > 0) {
    sections.push({
      id: "reviewed",
      title: NOTED_SECTION_TITLE,
      count: reviewed.length,
      hint: "Stays until resolved",
      cards: reviewed,
    });
  }

  const ids = new Set<string>();
  for (const card of [...missed, ...asked, ...checkins, ...off]) {
    ids.add(card.relationshipId);
  }
  const clientCount = ids.size;
  // Empty only when every reason section is gone (reviewed still open counts).
  const allCaughtUp = sections.length === 0;

  return {
    eyebrow: needsYouEyebrow({
      dateLabel: input.dateLabel,
      clientCount,
      offlineClock: input.offlineClock ?? null,
    }),
    tiles,
    sections,
    clientCount,
    allCaughtUp,
  };
}
