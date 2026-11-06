/**
 * Allowlist for the staging QA accounts (D-QA1-2).
 *
 * After `normalizeIdentifier`, the address must be exactly `qa+<tag>@thefitbud.com`.
 * Mobile numbers, other domains, and plain `qa@thefitbud.com` do not match.
 * The pattern lives here, with no provider types, so trainer-web can share it
 * without importing the API (D-W3b-9).
 */
export const TEST_OTP_IDENTIFIER_RE = /^qa\+[a-z0-9-]{1,32}@thefitbud\.com$/;
