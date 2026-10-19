import { formatClockTime, formatRelative } from "@fitbud/core";

type Entry = {
  operation: string;
  payloadJson: string;
  clientOccurredAt: string;
  lastError: string | null;
  status: string;
};

function payload(entry: Entry): Record<string, unknown> {
  try {
    const parsed = JSON.parse(entry.payloadJson) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mealName(body: Record<string, unknown>): string {
  return (
    text(body.mealName) ??
    text(body.label) ??
    text((body.body as Record<string, unknown> | undefined)?.mealName) ??
    "Meal"
  );
}

/** Trainee-facing outbox line. Never an operation name or id. */
export function describeOutboxEntry(entry: Entry): string {
  const body = payload(entry);
  const when = formatClockTime(entry.clientOccurredAt) || "just now";
  switch (entry.operation) {
    case "meal.confirm":
      return `${mealName(body)} · Eaten as planned · ${when}`;
    case "meal.skip":
      return `${mealName(body)} · Skipped · ${when}`;
    case "meal.deviate":
      return `${mealName(body)} · Something different · ${when}`;
    case "workout.start":
      return `Workout started · ${when}`;
    case "workout.complete":
      return `Workout finished · ${when}`;
    case "workout.skip":
      return `Workout skipped · ${when}`;
    case "workout.complete_set":
      return `Set logged · ${when}`;
    case "checkin.submit":
      return `Check-in sent · ${when}`;
    case "checkin.save_draft":
      return `Check-in draft · ${when}`;
    case "measurement.create":
      return `Measurement logged · ${when}`;
    default:
      return `Saved on this phone · ${when}`;
  }
}

export function conflictCopy(lastError: string | null): string {
  const raw = (lastError ?? "").toLowerCase();
  if (raw.includes("ended") || raw.includes("coaching has ended")) {
    return "Couldn't send. Coaching has ended.";
  }
  if (raw.includes("photo") || raw.includes("too large")) {
    return "Photo too large";
  }
  if (raw.includes("closed") || raw.includes("resolved") || raw.includes("late")) {
    return "Your coach closed this before your log was sent.";
  }
  if (raw.includes("superseded") || raw.includes("replaced") || raw.includes("changed")) {
    return "Your coach updated this. Your log was kept in history.";
  }
  if (raw.includes("replaced")) {
    return "Couldn't save. The meal was replaced.";
  }
  return "Couldn't send. We'll try again when you're online.";
}

export function lastSyncedLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "Not synced yet";
  const relative = formatRelative(iso, now);
  if (!relative || relative === "just now") return "Last synced just now";
  return `Last synced ${relative}`;
}

export type IndicatorKind = "synced" | "syncing" | "waiting" | "problem";

export function indicatorFromCounts(input: {
  pending: number;
  inFlight: number;
  failed: number;
  offline: boolean;
  syncedAt: number | null;
  now: number;
}): { kind: IndicatorKind; label: string; visible: boolean } {
  if (input.failed > 0) {
    return { kind: "problem", label: "Couldn't send", visible: true };
  }
  if (input.offline && (input.pending > 0 || input.inFlight > 0)) {
    return { kind: "waiting", label: "Saved on phone", visible: true };
  }
  if (input.inFlight > 0) {
    return { kind: "syncing", label: "Sending", visible: true };
  }
  if (input.pending > 0) {
    return { kind: "waiting", label: "Saved on phone", visible: true };
  }
  if (input.syncedAt != null && input.now - input.syncedAt < 2000) {
    return { kind: "synced", label: "Synced", visible: true };
  }
  return { kind: "synced", label: "Synced", visible: false };
}
