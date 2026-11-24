import type { ClientLogEditPayload, NotificationType } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatNumber,
  formatPersonName,
} from "./format.js";
import { formatLocalDate } from "./timezone.js";

/**
 * Trainer inbox and push share this wording.
 * Titles name the client. They never include a raw enum token.
 */
const TRAINER_CLIENT_NOTIFICATION_TYPES = [
  "trainer_ask_coach",
  "trainer_checkin_submitted",
  "trainer_intake_submitted",
  "trainer_renewal",
  "trainer_meal_times_changed",
  "trainer_client_log_edited",
] as const;

export type TrainerClientNotificationType =
  (typeof TRAINER_CLIENT_NOTIFICATION_TYPES)[number];

export function isTrainerClientNotificationType(
  type: NotificationType,
): type is TrainerClientNotificationType {
  return (TRAINER_CLIENT_NOTIFICATION_TYPES as readonly string[]).includes(
    type,
  );
}

/**
 * Display name safe to put in a sentence.
 * Drops empty values, the generic "Client" placeholder, and enum-like tokens.
 */
export function clientDisplayLabel(
  displayName: string | null | undefined,
): string | null {
  const formatted = formatPersonName(displayName);
  if (!formatted) return null;
  if (/_/.test(formatted)) return null;
  if (/^clients?$/i.test(formatted)) return null;
  if (/^your(\s|$)/i.test(formatted)) return null;
  return formatted;
}

function firstNameOf(name: string | null): string | null {
  return name?.split(" ")[0] || null;
}

/**
 * Z14-16 (D-W14-23 f): the shared wording for a client changing or removing a
 * meal log, used by the API push, the mobile inbox and the web bell. `today` is
 * the civil date today in the trainer's zone; an edit to another day names that
 * day in the title.
 */
export function clientLogEditCopy(
  payload: ClientLogEditPayload,
  clientName?: string | null,
  today?: string | null,
): { title: string; body: string } {
  const first = firstNameOf(clientDisplayLabel(clientName)) ?? "A client";
  const meal = payload.mealName.trim().toLowerCase();
  const day = formatCivilDate(
    payload.mealDate,
    today ? { now: new Date(`${today}T12:00:00Z`) } : undefined,
  );
  if (payload.action === "removed") {
    const was =
      payload.fromKcal == null
        ? ""
        : ` · was ${formatNumber(payload.fromKcal)} kcal`;
    const dayLabel = today && payload.mealDate === today ? "Today" : day;
    return {
      title: `${first} removed their ${meal} log`,
      body: `${dayLabel}${was}. It's back to not logged.`,
    };
  }
  const dayPart = today && payload.mealDate !== today ? ` · ${day}` : "";
  const title = `${first} edited ${meal}${dayPart}`;
  const has = (f: ClientLogEditPayload["fields"][number]) =>
    payload.fields.includes(f);
  const what = has("kcal")
    ? "ate out"
    : has("foods")
      ? "logged it themselves"
      : has("portion")
        ? "changed portion"
        : null;
  const kcalChanged =
    payload.fromKcal != null &&
    payload.toKcal != null &&
    payload.fromKcal !== payload.toKcal;
  if (kcalChanged) {
    const kcal = `${formatNumber(payload.fromKcal!)} → ${formatNumber(payload.toKcal!)} kcal`;
    return { title, body: what ? `${kcal} · ${what}` : kcal };
  }
  if (has("portion") || has("foods")) {
    return { title, body: `Changed ${has("portion") ? "portion" : "foods"}` };
  }
  if (has("note") && !has("outcome")) {
    return { title, body: "Changed the note." };
  }
  return { title, body: "Open to see what changed." };
}

export function trainerNotificationCopy(
  type: TrainerClientNotificationType,
  clientName?: string | null,
  detail?: { logEdit?: ClientLogEditPayload | null; today?: string | null },
): { title: string; body: string } {
  const name = clientDisplayLabel(clientName);
  switch (type) {
    case "trainer_ask_coach":
      return {
        title: name ? `${name} asked on WhatsApp` : "Asked on WhatsApp",
        body: "Open the item they asked about.",
      };
    case "trainer_checkin_submitted":
      return {
        title: name ? `${name} sent their check-in` : "Check-in submitted",
        body: "Review when you're ready.",
      };
    case "trainer_intake_submitted":
      return {
        title: name ? `${name} finished their intake` : "Intake submitted",
        body: "Review their intake answers.",
      };
    case "trainer_renewal":
      return {
        title: name ? `${name}'s renewal is due` : "Renewal is due",
        body: "Follow up before the window closes.",
      };
    case "trainer_meal_times_changed":
      return {
        title: name ? `${name} changed meal times` : "Meal times changed",
        body: "Reminders will follow their new times.",
      };
    case "trainer_client_log_edited":
      if (detail?.logEdit) {
        return clientLogEditCopy(detail.logEdit, clientName, detail.today);
      }
      return {
        title: name
          ? `${firstNameOf(name)} changed a meal log`
          : "A client changed a meal log",
        body: "Open to see what changed.",
      };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Z14-16 (D-W14-23 a): the quiet marker lines on a meal a client changed, shared
 * by trainer web and the trainer app. Plain words, never a raw enum.
 */
export function mealEditedByLine(input: {
  clientName?: string | null;
  editedAt: string;
  zone: string;
}): string {
  const first = firstNameOf(clientDisplayLabel(input.clientName)) ?? "client";
  const day = formatCivilDate(formatLocalDate(new Date(input.editedAt), input.zone));
  return `Edited by ${first} · ${day}, ${formatClockTime(input.editedAt, input.zone)}`;
}

/** "Was 610 kcal · as planned": what the entry said before the client's edit. */
export function mealWasLine(previous: {
  outcome: string;
  deviationKind: string | null;
  kcal: number | null;
}): string {
  const detail =
    previous.outcome === "skipped"
      ? "skipped"
      : previous.outcome === "confirmed"
        ? "as planned"
        : previous.deviationKind === "restaurant"
          ? "ate out"
          : previous.deviationKind === "portion_adjustment"
            ? "changed portion"
            : "changed from the plan";
  return previous.kcal == null
    ? `Was ${detail}`
    : `Was ${formatNumber(previous.kcal)} kcal · ${detail}`;
}

/**
 * The Activity row for a removed meal log (TM-09e): "Priya removed their dinner
 * log (Fri 13 Nov) · was 1,120 kcal". `summary` is the feed's "Removed the
 * dinner log".
 */
export function mealRemovedActivityLine(input: {
  clientName?: string | null;
  summary: string;
  mealDate: string | null;
  previousKcal: number | null;
}): string {
  const first = firstNameOf(clientDisplayLabel(input.clientName)) ?? "A client";
  const meal = /^Removed the (.+) log$/i.exec(input.summary)?.[1] ?? "meal";
  const day = input.mealDate ? ` (${formatCivilDate(input.mealDate)})` : "";
  const was =
    input.previousKcal == null ? "" : ` · was ${formatNumber(input.previousKcal)} kcal`;
  return `${first} removed their ${meal.toLowerCase()} log${day}${was}`;
}
