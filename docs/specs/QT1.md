---
id: QT1
title: Staging-only test-mode email OTP for qa+ accounts
batch: QA1
depends_on: []
lane: api-auth
files_owned:
  - apps/api/src/auth/test-otp.ts  # new: allowlist + flag check, pure functions
  - apps/api/src/auth/test-otp.test.ts  # new
  - apps/api/src/routes/auth-login.ts  # /otp/start branch only
  - apps/api/src/routes/auth-login.test-otp.test.ts  # new route-level tests
  - apps/api/src/middleware/runtime-guard.ts  # refuse the flag in production
  - apps/api/src/middleware/runtime-guard.test.ts
  - apps/api/.dev.vars.example  # names only, no values
frames: []
model: opus
size: M
---

## Outcome
On staging only, an automated test can sign in to a `qa+…@thefitbud.com` account with email OTP without reading a mailbox: `/auth/otp/start` for an allowlisted address stores the fixed QA code instead of a random one and sends no email, and the normal `/auth/otp/verify` path accepts it once. In production the same request behaves exactly like today, and the Worker refuses to serve at all if the flag is set there.

## Context
- **Why** (2 Nov 2026): the Maestro (QT3), Playwright (QT5) and API (QT6) suites must sign in on `api-staging.thefitbud.com` unattended. Email OTP goes through ZeptoMail; nothing on a CI runner can read the code. Firoz's real-email staging accounts are OTP-only by design and must not be touched.
- **Pattern to reuse: the test-mode push token.** `AUTH_MODE=test` makes the mobile app use a constant synthetic push token (`apps/mobile/src/notifications/register.ts:155`, `:208`) and the API treats it as a normal token (`apps/api/src/routes/notifications.ts:200-207`); the reminder trigger refuses unless `AUTH_MODE` is test (`apps/api/src/routes/notifications.ts:748`). Deployed environments are protected by `runtimeMisconfigurations` (`apps/api/src/middleware/runtime-guard.ts:31-49`), which makes staging and production refuse to serve when a test double is configured. QT1 follows the same shape: a narrow, named switch, a pure helper that decides, and the runtime guard as the production backstop. Unlike the push token, staging keeps `AUTH_MODE=firebase` (`apps/api/wrangler.toml:109-113`); only the OTP code source changes.
- **Decided in this batch (D-QA1-1):** two Worker **secrets** on `fitbud-api-staging` only, set by Firoz with `wrangler secret put`: `QA_TEST_OTP_ENABLED` (value `on`) and `QA_TEST_OTP_CODE` (6 digits, chosen by Firoz, stored as the GitHub secret of the same name). The code is a secret because the repo is **public**; a code in `wrangler.toml` would let anyone sign in to the QA accounts on staging. No `wrangler.toml` change (W4's BT2 owns it). Declare the two optional fields with a local intersection type in `test-otp.ts` (`Env & { QA_TEST_OTP_ENABLED?: string; QA_TEST_OTP_CODE?: string }`) instead of editing `apps/api/src/types.ts`, which W4's BT2 owns.
- **Allowlist (D-QA1-2):** the identifier, after `normalizeIdentifier`, must match `^qa\+[a-z0-9-]{1,32}@thefitbud\.com$`. Mobile numbers never match. No other domain, no plain `qa@`.
- **Active only when all hold:** `ENVIRONMENT === "staging"`, `QA_TEST_OTP_ENABLED === "on"`, `QA_TEST_OTP_CODE` matches `^\d{6}$`, purpose is `login`, identifier is allowlisted. Anything else → today's code path untouched. `ENVIRONMENT=local` is **not** enabled (local already has the dev email sink); keep it out to keep the rule simple.
- **How it works:** in `/otp/start` (`apps/api/src/routes/auth-login.ts:259`), when active, write the `auth_otps` row with the fixed code's hash (`sha256Hex(`${code}:${idHash}`)`, same as `:382`) and skip the email send. Rate limits, expiry, `attempts`, the 5-attempt invalidation and single-use `consumedAt` in `/otp/verify` (`:340-391`) are **unchanged**, so a used code fails exactly as a real one does. Emit a structured log `auth.otp.test_mode` with the identifier hash only (never the code or the email).
- **Production must be impossible, three layers:** (1) the helper returns false unless `ENVIRONMENT === "staging"`; (2) `runtimeMisconfigurations` adds `QA_TEST_OTP_ENABLED=set` as a problem when `ENVIRONMENT === "production"` and either secret is present, so production refuses every request (names only, never values); (3) tests below.
- Written against `main` at b646ffc. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- `apps/api/src/routes/auth-login.ts:259-330`: every login OTP is random and emailed; no unattended sign-in path exists on staging.
- `apps/api/src/middleware/runtime-guard.ts:31-49`: no check for QA switches.
- `apps/api/.dev.vars.example`: does not name the two new variables.

## Acceptance criteria
- [ ] `isTestOtpActive(env, identifier, purpose)` and `TEST_OTP_IDENTIFIER_RE` exported from `apps/api/src/auth/test-otp.ts`; pure, no I/O.
- [ ] On `ENVIRONMENT=staging` with both secrets set, `POST /auth/otp/start {identifier: "qa+trainer@thefitbud.com", purpose: "login"}` returns the same 200 body as today, sends **no** email (the email provider stub records zero sends), and `POST /auth/otp/verify` with the fixed code returns 200 `purpose: "login"` with session fields.
- [ ] Verifying the same code a second time returns `401 OTP_INVALID` (single use preserved). A wrong code increments `attempts`; 5 wrong codes invalidate.
- [ ] For a non-allowlisted email (`tech+client2@thefitbud.com`, `qa@thefitbud.com`, `qa+x@thefitbud.co`, `QA+X@evil.com`), staging with the flag on behaves exactly as today: random code, email sent, fixed code rejected `401 OTP_INVALID`.
- [ ] **Production rejects it:** with `ENVIRONMENT=production` and both secrets set, (a) `runtimeMisconfigurations` reports `QA_TEST_OTP_ENABLED=set` and every request gets the guard's refusal; (b) with the guard bypassed in the test, `isTestOtpActive` is false and the fixed code returns `401 OTP_INVALID`.
- [ ] Flag missing, `off`, or a code that is not 6 digits → inactive on staging.
- [ ] No secret value, the fixed code or a QA email address appears in any log line (assert on captured logs).
- [ ] `apps/api/.dev.vars.example` lists `QA_TEST_OTP_ENABLED=` and `QA_TEST_OTP_CODE=` with a comment "staging secrets only; never production".
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Password sign-in (already works; QT2 seeds the password). Invite and reset OTP purposes. WhatsApp OTP. Any mobile or web change. Setting the secrets (Firoz, manual step).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/auth/test-otp.test.ts`: truth table over environment × flag × code shape × identifier × purpose, including the negative identifiers above and upper-case normalisation.
- `apps/api/src/routes/auth-login.test-otp.test.ts`: route tests on the in-memory D1 harness used by `auth-login.test.ts`: start+verify success, single use, wrong-code attempts, non-allowlisted unchanged, **production rejects** (both layers), no secret in logs.
- `apps/api/src/middleware/runtime-guard.test.ts`: new cases for production with each secret set, and staging with them set (no problem reported).
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: n/a.

## Stop conditions
- The OTP row cannot carry the fixed code without a schema or migration change.
- `ENVIRONMENT` is not reliably `staging` on the staging Worker (re-check `apps/api/wrangler.toml:109-113`).
- Making it work needs `apps/api/src/types.ts` or `apps/api/wrangler.toml` (W4 BT2 owns both): stop and report.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `eas build`, `eas submit`), a secret value, production data or a deploy.
