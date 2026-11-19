import { formatCivilDate } from "./format.js";
import { zonedDateTimeFormat } from "./zone.js";

/**
 * Account deletion and reactivation copy (Z12-29, D-W12-6), shared by the
 * trainee app and trainer web (Z12-30). The archive rule is D-W6-7: deleting
 * archives the account for 6 months; signing in again in that time offers to
 * bring it back; after that it is purged. TR-20d's sample copy ("30 days") is
 * not used (D-W12-25).
 */

/** Where an immediate, permanent deletion is requested (D-W6-7). */
export const ACCOUNT_DELETION_EMAIL = "tech@thefitbud.com";
export const ACCOUNT_DELETION_EMAIL_SUBJECT = "Delete my FitBud account";
/** `mailto:` link that opens the mail app with the subject filled in. */
export const ACCOUNT_DELETION_MAILTO = `mailto:${ACCOUNT_DELETION_EMAIL}?subject=${encodeURIComponent(
  ACCOUNT_DELETION_EMAIL_SUBJECT,
)}`;

/** The word typed to confirm. */
export const ACCOUNT_DELETION_CONFIRM_WORD = "DELETE";

export const accountDeletionCopy = {
  title: "Delete account",
  body:
    "We'll archive your account for 6 months. Sign in again any time in those 6 months to bring it back, with everything as you left it. After 6 months your account and its data are deleted for good.",
  /** Split around the email so it can render as a link. */
  emailLead: "Want it deleted permanently right away? Email ",
  emailTail: " from the email or phone number on this account and we'll delete it.",
  confirmLabel: "Type DELETE to confirm",
  confirmButton: "Delete account",
  cancel: "Cancel",
  /** Fresh proof step (D-W6-31: a sign-in within the last 5 minutes). */
  proofTitle: "Check it's you",
  proofPasswordLead: "Enter your password to delete your account.",
  proofPasswordLabel: "Password",
  proofUseCode: "Send me a code instead",
  proofUsePassword: "Use my password instead",
  proofCodeSent: (identifier: string) =>
    `We sent a 6-digit code to ${identifier}. Enter it to delete your account.`,
  proofCodeLabel: "Code",
  proofSendCode: "Send code",
  proofResend: "Send a new code",
  /** Shown before the proof step on the confirm screen. */
  proofHintPassword: "Next, we'll ask for your password to check it's you.",
  activeClients: (count: number) =>
    `End coaching with your active clients first. You have ${count} active ${
      count === 1 ? "client" : "clients"
    }.`,
  goToClients: "Go to Clients",
  archived: (purgeDate: string) =>
    `Your account is archived. Sign in before ${purgeDate} to bring it back.`,
  archivedOk: "OK",
} as const;

export const accountReactivationCopy = {
  title: "Welcome back",
  body: (purgeDate: string) =>
    `Your account is archived and will be deleted for good on ${purgeDate}.`,
  traineeNote:
    "Coaching that ended when you deleted your account stays ended. Ask your coach to restart it.",
  trainerNote: "Your clients' coaching stays ended. You can restart it from Clients.",
  reactivate: "Reactivate my account",
  signOut: "Sign out",
  /** BP1-reactivate-account-ios.png footnote. */
  signOutNote: "Signing out keeps it archived.",
} as const;

/**
 * The purge date as "Mon 3 May 2027" in `timeZone`. Always with the year: it is
 * about 6 months away, often in the next year. Never an ISO date.
 */
export function formatPurgeDate(purgeAfterIso: string, timeZone: string): string {
  const date = new Date(purgeAfterIso);
  if (Number.isNaN(date.getTime())) return "";
  let civil: string;
  try {
    civil = zonedDateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    // An unknown zone name: UTC still gives a real date, never the ISO text.
    civil = date.toISOString().slice(0, 10);
  }
  // `now` in another year makes formatCivilDate keep the year.
  return formatCivilDate(civil, { now: new Date(Date.UTC(1970, 0, 1)) });
}
