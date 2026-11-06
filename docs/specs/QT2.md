---
id: QT2
title: Deterministic QA seed fixtures and reset script for staging
batch: QA1
depends_on: []
lane: qa-seed
files_owned:
  - apps/api/scripts/qa-seed.ts  # new: builds the QA seed SQL
  - apps/api/scripts/qa-reset.ts  # new: builds the reset SQL
  - apps/api/scripts/qa-seed.test.ts  # new
  - apps/api/src/seed/qa/**  # new: personas, fixed ids, expectations file
  - .gitignore  # ignore apps/api/.qa-seed/ output
frames: []
model: opus
size: M
---

## Outcome
Staging has three dedicated QA accounts, separate from Firoz's real-email accounts: `qa+trainer@thefitbud.com` (trainer), `qa+ontrack@thefitbud.com` (on-track client) and `qa+slipping@thefitbud.com` (slipping client), with weeks of history, open exceptions and a pending check-in. A script writes an idempotent seed SQL file and a reset SQL file that returns the QA world to the same known state before every nightly run.

## Context
- **What staging holds today** (staging seed built 2 Nov 2026, not committed): a subset of the local demo world from `apps/api/src/seed/demo` (`buildDemoSeedSql`, personas at `apps/api/src/seed/demo/spec.ts:18-29`): trainer **Rahul Verma** (`main_trainer`), on-track client **Aarav Shah** (`active_on_track`) and slipping client **Rohan Mehta** (`slipping`), plus the exercise and food library. About 8 months of generated history (March to November 2026): ~140 workout assignments and 120 executions with ~1,450 set executions, ~1,140 meal assignments and ~1,010 compliance rows, 36 check-ins with 34 reviews, ~150 exceptions (70 with actions), ~140 measurements, 14 trainer notes, 10 coach asks, 28 plan templates. Those three users were re-pointed at **Firoz's and a teammate's real email addresses** (two OTP-only, one with a password), phone numbers and trainer WhatsApp numbers were nulled, and rows were written with `INSERT OR IGNORE`. Firebase uids are fixed strings so re-applying is stable. The QA seed must **not** reuse those user ids, emails or uids, and must never update or delete their rows.
- **Approach:** reuse the generator, not the staging file. Run the migrations and library seed into an in-memory `node:sqlite` DB, run `buildDemoSeedSql` with a fixed reference instant, keep only the three personas above, then rewrite them to the QA identities: new ids from `demoUuid("user", "qa+…@thefitbud.com")`, firebase uids `qa-seed-trainer`, `qa-seed-ontrack`, `qa-seed-slipping`, `mobile_e164` and `whatsapp_e164` NULL. Display names get a `QA ` prefix (`QA Rahul`, `QA Aarav`, `QA Rohan`) so screenshots and Firoz's trainer view can never confuse them with real data. Emit only rows that differ from the library baseline.
- **Determinism (D-QA1-3):** `--reference-date YYYY-MM-DD` (default: today in Asia/Kolkata). Same date ⇒ byte-identical SQL (sorted by table then primary key). "Today" for the QA trainees always has a workout, three meals and (for on-track) one logged meal; the slipping client always has at least two open exceptions and one submitted, unreviewed check-in. These guarantees are written to `apps/api/src/seed/qa/expectations.json` (ids, display names, counts) which QT3, QT5 and QT6 read instead of hard-coding.
- **Passwords:** the trainer and on-track client get a password so the password journey is testable; the slipping client is OTP-only. The password comes from the environment variable `FITBUD_QA_PASSWORD` at build time and is hashed with `hashPassword` (`apps/api/src/auth/password.ts`). It is never written in plain text; the output file holds only the hash. The script fails if the variable is unset.
- **Reset:** `qa-reset.ts` writes SQL that deletes every row owned by, or referencing, the three QA user ids (and their relationships, workspaces, devices, OTPs, idempotency keys, notifications), in FK-safe order, then the seed is re-applied. It must be scoped by the fixed QA ids only, and must contain a guard statement that aborts (e.g. a failing `SELECT` on a `CHECK`) if any target id is not one of the three.
- **Output:** `apps/api/.qa-seed/qa-seed.sql` and `qa-reset.sql` (git-ignored). Applying them is a **remote command** done by the QT7 nightly job or Firoz (`wrangler d1 execute fitbud-staging --env staging --remote --file …`), never by the implementer. Document the commands in the PR and in QT8's runbook.
- Invoke with `node --experimental-strip-types apps/api/scripts/qa-seed.ts` (no `package.json` change: W4's BT2 owns `apps/api/package.json`).
- Written against `main` at b646ffc. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- No QA identities exist; every staging account is either a real person's address or a teammate's.
- No reset path: the staging seed is `INSERT OR IGNORE` only, so after a test logs a meal the state drifts forever.

## Acceptance criteria
- [ ] `qa-seed.ts --reference-date 2026-11-02` run twice gives byte-identical `qa-seed.sql`; a different date gives a different file.
- [ ] Applying `qa-seed.sql` twice to a fresh local D1 (`pnpm db:reset` then `wrangler d1 execute --local`) succeeds and the second run changes 0 rows.
- [ ] Applying `qa-reset.sql` then `qa-seed.sql` after mutations (log a meal, review a check-in) returns all counts in `expectations.json`.
- [ ] Applying the staging-like seed of the demo personas plus the QA seed, then the reset: **no non-QA row is deleted or changed** (assert a full-table checksum of non-QA rows before and after).
- [ ] No QA row contains a phone number, a real person's email or a plaintext password; the file contains no string equal to `FITBUD_QA_PASSWORD`.
- [ ] `expectations.json` lists, per account: email, role, display name, user id, firebase uid, and today's expected items (workout name, meal names, open exception count, pending check-in id).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Applying anything to staging. Changing `apps/api/src/seed/demo/**` or `seed-demo.ts`. Production seeding of any kind. Firebase console users (custom tokens create them on first sign-in).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/scripts/qa-seed.test.ts`: determinism; idempotent double-apply on `node:sqlite`; reset+reseed round trip; non-QA rows untouched; no PII or plaintext password; reset guard aborts on a foreign id.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: n/a.

## Stop conditions
- `buildDemoSeedSql` cannot be reused without editing `apps/api/src/seed/demo/**`.
- The demo generator is not deterministic for a fixed reference instant (report the source of randomness).
- The reset cannot be scoped to the QA ids without touching shared rows (e.g. a shared workspace).
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `eas build`, `eas submit`), a secret value, production data or a deploy.
