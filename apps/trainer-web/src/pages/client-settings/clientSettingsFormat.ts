import type {
  ClientSettingsSubscription,
  CoachingMode,
  PaymentMethod,
  PaymentStatus,
} from "@fitbud/contracts";
import { normalizeWhatsappE164 } from "@fitbud/core";

/**
 * Labels for the client-settings enums. `packages/core/src/labels.ts` has no
 * namespace for these yet and is outside this task's files, so the page keeps
 * a typed map here (follow-up: move into `labelFor`). Typed by the contract
 * enums, so a new enum value fails typecheck instead of showing raw text.
 */
export const COACHING_MODE_LABELS: Record<CoachingMode, string> = {
  online: "Online",
  in_person: "In person",
  hybrid: "Hybrid",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank",
};

/** Paise → "₹6,000" (Indian grouping; paise shown only when not whole rupees). */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/** "+919000000008" → "+91 90000 00008"; other countries "+<digits>". */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

/** Value for the phone input: Indian numbers without the +91 shown beside it. */
export function phoneInputValue(e164: string | null): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

export type PhoneParse =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "ok"; e164: string };

/**
 * Reads the phone input. Without a leading "+" the field is an Indian mobile
 * (the "+91" shown beside it): 10 digits, or 12 starting with 91. With "+" it
 * is any country, checked by the same rule the server applies.
 */
export function parsePhoneInput(raw: string): PhoneParse {
  const value = raw.trim();
  if (!value) return { kind: "empty" };
  if (/[^\d\s()+-]/.test(value)) return { kind: "invalid" };
  const digits = value.replace(/\D/g, "");
  if (value.startsWith("+")) {
    const normalized = normalizeWhatsappE164(value);
    // A leading "+" means the country code is typed: no 91 may be added.
    if (!normalized || normalized !== digits) return { kind: "invalid" };
    return { kind: "ok", e164: `+${normalized}` };
  }
  if (digits.length === 10) return { kind: "ok", e164: `+91${digits}` };
  if (digits.length === 12 && digits.startsWith("91")) {
    return { kind: "ok", e164: `+${digits}` };
  }
  return { kind: "invalid" };
}

/** IANA zone → "India Standard Time (IST)"; the zone id when Intl can't name it. */
export function formatTimeZone(timeZone: string, now = new Date()): string {
  try {
    const part = (style: "long" | "short") =>
      new Intl.DateTimeFormat("en-IN", { timeZone, timeZoneName: style })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value ?? "";
    const long = part("long");
    const short = part("short");
    if (!long) return timeZone;
    return /^[A-Z]{2,5}$/.test(short) ? `${long} (${short})` : long;
  } catch {
    // An unknown zone id: show it as stored rather than guess a name.
    return timeZone;
  }
}

/** Civil YYYY-MM-DD of an instant in a timezone (browser zone when omitted). */
export function civilDateOf(iso: string, timeZone?: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return iso.slice(0, 10);
  }
}

/** Whole days from civil `from` to civil `to` (negative when `to` is earlier). */
export function civilDaysBetween(from: string, to: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** Whole weeks since an instant ("8 weeks"); null under one week. */
export function weeksSince(iso: string, now = new Date()): string | null {
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return null;
  const weeks = Math.floor((now.getTime() - started) / (7 * 86_400_000));
  if (weeks < 1) return null;
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}

/**
 * Renewal chip text from the server-derived renewal state. "Current" shows no
 * chip (same rule as the workspace header). The day count is the civil gap
 * from today to the stored renewal date.
 */
export function renewalChipLabel(
  subscription: Pick<ClientSettingsSubscription, "renewalState" | "renewsOn">,
  today: string,
): string | null {
  const days = civilDaysBetween(today, subscription.renewsOn);
  switch (subscription.renewalState) {
    case "upcoming":
      // Today's date is the browser's, so a timezone edge can read 0 days.
      return days > 0 ? `Renews in ${days} d` : "Renews soon";
    case "due":
      // The server derives "due" as renewing today in the trainer's timezone.
      return "Renews today";
    case "expired":
      return "Renewal expired";
    default:
      return null;
  }
}
