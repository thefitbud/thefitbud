/**
 * The single source of every value that is substituted into the public legal
 * documents (Z14-27, D-W14-31). The published text lives in
 * `docs/legal/published/*.md` and holds `{{key}}` tokens; the trainer web pages
 * and the mobile Legal screen fill them from here.
 *
 * Rules:
 * - A value Firoz has supplied is a string here. A value he has not supplied is
 *   `null` and renders as "To be confirmed". Never guess one: an unfilled value
 *   is correct until Firoz or counsel supplies it.
 * - `assertLegalPublishable()` fails if any value is still `null`. The
 *   production deploy scripts call it, so an unfilled value cannot ship to
 *   production. Staging, local runs and tests render the marker and carry on.
 * - Counsel has not signed off. Until `LEGAL_COUNSEL_SIGNOFF` is filled (or
 *   Firoz asks in writing to drop the banner), every page says it is pending
 *   counsel review and not yet in force.
 */

export type LegalValues = {
  /** Contracting party (Terms §1, Privacy §2, Beta Terms §1). Supplied by Firoz, 24 Nov 2026. */
  partyName: string | null;
  /** Registered address. Supplied by Firoz, 24 Nov 2026. Keep it in this file only. */
  ownerAddress: string | null;
  /** Grievance Officer (Privacy §14). Supplied by Firoz, 24 Nov 2026. */
  grievanceOfficer: string | null;
  /** Floor of the liability cap, for example "₹5,000" (Terms §12.3). Counsel to confirm. */
  liabilityCapFloor: string | null;
  /** Notice before any trainer fee, for example "30 days" (Terms §15.2). */
  noticePeriod: string | null;
  /** Notice of a material change to the Terms, for example "30 days" (Terms §16). */
  changeNoticePeriod: string | null;
  /** Time we ask for to settle a dispute before proceedings, for example "30 days" (Terms §17.4). */
  disputeResolutionPeriod: string | null;
  /** Age from which medical clearance is specifically urged, for example "40" (Health notice §4). */
  medicalClearanceAge: string | null;
  /** Where the production database and media bucket are held (Privacy §8). A fact from the dashboard. */
  dataLocation: string | null;
  /** The approved retention schedule in plain language (Privacy §9). Only what the code enforces. */
  retentionSchedule: string | null;
  /** Time to finish a deletion request, for example "30 days" (Privacy §9, §12). */
  deletionPeriod: string | null;
  /** How long an ended coaching relationship is kept (Privacy §9). */
  endedRelationshipRetention: string | null;
  /** How long backups are kept, for example "90 days" (Privacy §9, §12). */
  backupRetention: string | null;
  /** Statutory time to answer a rights request (Privacy §12). Counsel to confirm. */
  rightsResponsePeriod: string | null;
  /** Time to acknowledge a grievance (Privacy §14). */
  grievanceAckPeriod: string | null;
  /** Licences of fonts, icons and other third-party components (Credits). Generate from the manifests. */
  fontIconLicences: string | null;
};

export type LegalKey = keyof LegalValues;

export const LEGAL_VALUES: LegalValues = {
  partyName: "Shaik Firoz Basha",
  ownerAddress: "22-216, Subbaiahathota, Chilakaluripet, Andhra Pradesh 522616, India",
  grievanceOfficer: "Shaik Firoz Basha",
  liabilityCapFloor: null,
  noticePeriod: null,
  changeNoticePeriod: null,
  disputeResolutionPeriod: null,
  medicalClearanceAge: null,
  dataLocation: null,
  retentionSchedule: null,
  deletionPeriod: null,
  endedRelationshipRetention: null,
  backupRetention: null,
  rightsResponsePeriod: null,
  grievanceAckPeriod: null,
  fontIconLicences: null,
};

/** Support and legal contact, already used across the product. */
export const LEGAL_SUPPORT_EMAIL = "tech@thefitbud.com";

/** Date the documents take effect (supplied by Firoz in the drafts, 24 Nov 2026). */
export const LEGAL_EFFECTIVE_DATE = "1 December 2026";
/** Date of the last change to the published text. */
export const LEGAL_LAST_UPDATED = "1 December 2026";

/**
 * Counsel sign-off. `null` until Firoz records who approved the text and when
 * (or asks to drop the banner). While it is `null` every page keeps the banner.
 */
export type LegalSignoff = { name: string; date: string };
export const LEGAL_COUNSEL_SIGNOFF: LegalSignoff | null = null;

export const LEGAL_BANNER = {
  title: "Pending counsel review",
  text: "A lawyer has not approved this text yet, so it is not yet in force. Do not rely on it as the terms or policy that apply to you.",
} as const;

export function isLegalInForce(signoff: LegalSignoff | null = LEGAL_COUNSEL_SIGNOFF): boolean {
  return signoff !== null;
}

/** What a missing value shows. */
export const TO_BE_CONFIRMED = "To be confirmed";

/**
 * Inline marker around a missing value in the substituted text. The renderers
 * turn `==text==` into a highlighted run, so a gap can never read as part of
 * the sentence.
 */
const MARK = "==";
const MISSING_TEXT = `${MARK}${TO_BE_CONFIRMED}${MARK}`;

function isFilled(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Keys whose value is still missing, in declaration order. */
export function missingLegalValues(values: LegalValues = LEGAL_VALUES): LegalKey[] {
  return (Object.keys(values) as LegalKey[]).filter((key) => !isFilled(values[key]));
}

/**
 * Throws if any value is still missing. Called by the production deploy
 * scripts. The message names the keys only, never their values.
 */
export function assertLegalPublishable(values: LegalValues = LEGAL_VALUES): void {
  const missing = missingLegalValues(values);
  if (missing.length > 0) {
    throw new Error(
      `Legal documents are not ready to publish. Fill these values in packages/core/src/legal-config.ts: ${missing.join(", ")}.`,
    );
  }
}

function resolveToken(token: string, values: LegalValues): string {
  if (token === "noticePeriodPossessive") {
    return isFilled(values.noticePeriod) ? `${values.noticePeriod}'` : MISSING_TEXT;
  }
  if (!Object.hasOwn(values, token)) return MISSING_TEXT;
  const value = values[token as LegalKey];
  return isFilled(value) ? value : MISSING_TEXT;
}

/** Replace every `{{key}}` in the published text. Unknown or unfilled keys show "To be confirmed". */
export function fillLegalTokens(markdown: string, values: LegalValues = LEGAL_VALUES): string {
  return markdown.replace(/\{\{(\w+)\}\}/g, (_m, token: string) => resolveToken(token, values));
}
