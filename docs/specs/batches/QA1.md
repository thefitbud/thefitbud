# QA1 · Automated end-to-end QA: test-mode OTP, QA seed, Maestro, staging Playwright and API smoke, nightly CI

**Status:** Draft (2 Nov 2026). Specs written for every QA1 task (see Lanes). Decisions D-QA1-1 to D-QA1-6 decided by the planning bot; D-QA1-7 to D-QA1-11 decided by Firoz on 2 Nov 2026 (were Q1–Q5). No open questions.
**Source:** Firoz's request of 2 Nov 2026 ("agents find bugs instead of Firoz testing by hand"), after two bugs reached his phone that no test caught: AB2 (every `Screen`-based screen crashed on Android on `accessibilityRole` `main`, fixed in #146) and the OTP code screen showing "code didn't work" after a 200 and resending a used code on double tap (QT9).
**Naming:** batch files so far are `W0`–`W4` (beta waves). QA1 is the first QA batch, outside the W sequence, so later QA batches are `QA2`, … Task ids use the new prefix **QT** (QA task) so they never collide with the batch id or existing prefixes (AB, AU, BT, DC, I, LA, OB, WD, X).
**Goal:** coding agents build the suites through the normal batch flow; after merge the FitBud UI bot runs them nightly against staging and reports to Firoz. Target: suites merged by Tue 10 Nov so the nightly run covers the BT5 dress rehearsal (Thu 12 Nov).
**Launch rule:** Firoz's launch message is the go. The orchestrator does not wait for a status or a sign-off. If a decision below is still marked **Open**, the tasks that need it stop and report; the rest run.

## Decisions
- **Carried over (decided):** staging is `api-staging.thefitbud.com` / `app-staging.thefitbud.com` with D1 `fitbud-staging` (D-W2-7); CLAUDE.md is the source of truth (D-W2-10); beta builds use the production variant and the rehearsal uses the staging variant `com.thefitbud.mobile.staging` (D-W4-3); iOS builds on hold (Firoz, 1 Nov); code is reviewed by agents, not by hand (Firoz, 1 Nov).
- **D-QA1-1 Test-mode OTP switch.** Decided by the planning bot, 2 Nov 2026: two Worker **secrets** on staging only, `QA_TEST_OTP_ENABLED=on` and `QA_TEST_OTP_CODE` (6 digits). A secret, not a `wrangler.toml` var, because the repo is public. Active only when `ENVIRONMENT=staging`; production refuses to serve if either is set (runtime guard). Reuses the test-mode push token's shape: a narrow named switch plus the runtime guard. Used by QT1.
- **D-QA1-2 Allowlist.** Decided by the planning bot, 2 Nov 2026: `^qa\+[a-z0-9-]{1,32}@thefitbud\.com$`, login purpose only. Firoz's real-email staging accounts are never allowlisted. Used by QT1, QT2.
- **D-QA1-3 QA seed.** Decided by the planning bot, 2 Nov 2026: three new accounts `qa+trainer@`, `qa+ontrack@`, `qa+slipping@thefitbud.com`, generated from the demo generator with a fixed reference date, `QA `-prefixed display names, a reset scoped to those three ids only, applied by the nightly job before each run. Used by QT2, QT3, QT5, QT6, QT7.
- **D-QA1-4 OTP error copy.** Decided by the planning bot, 2 Nov 2026: the four messages in QT9's spec. Wording approved by Firoz (D-QA1-11).
- **D-QA1-5 CI runner: GitHub-hosted, emulator on `ubuntu-latest`, APK built on the runner.** Decided by the planning bot, 2 Nov 2026. The repo is public, so standard GitHub-hosted runners are free; `ubuntu-latest` has KVM, so the Android emulator is accelerated; building the APK with `expo prebuild` + Gradle avoids EAS build minutes and `EXPO_TOKEN`. Maestro Cloud and EAS Workflows' Maestro runs are billed per device-minute or need a paid plan, so they are not used (D-QA1-8). Used by QT7.
- **D-QA1-6 PR vs nightly.** Decided by the planning bot, 2 Nov 2026: `ci.yml` stays the PR gate (unit, lint, typecheck, local Playwright, banned strings). The new `qa.yml` runs the Maestro **smoke** tag on PRs touching mobile (advisory), and everything (reset, API smoke, staging Playwright, Maestro full) nightly at 02:00 IST and on demand. Only the nightly/manual run on `main` writes staging. Used by QT7.
- **D-QA1-7 Nightly writes on QA accounts (was Q1).** Decided by Firoz, 2 Nov 2026: yes. The nightly run may make real, meaningful changes on the QA accounts that reflect real behaviour, such as resolving exceptions, reviewing check-ins, logging workouts and meals, and adding notes. The reset (D-QA1-3) restores them each night. QA accounts only, never Firoz's real-email accounts. Used by QT3, QT5, QT6, QT7.
- **D-QA1-8 Emulator flakiness (was Q2).** Decided by Firoz, 2 Nov 2026: if the GitHub-hosted emulator is flaky for infrastructure reasons, we live with it. No move to EAS Workflows or Maestro Cloud, so `EXPO_TOKEN` is not needed. Used by QT7.
- **D-QA1-9 No reviewer on `staging-qa` (was Q3).** Decided by Firoz, 2 Nov 2026: the default is accepted. Runs that write to staging need no reviewer approval; the token stays scoped to staging D1 only. Used by QT7.
- **D-QA1-10 Maestro smoke stays advisory (was Q4).** Decided by Firoz, 2 Nov 2026: the Maestro smoke job is not made a required check on `main`. Used by QT7.
- **D-QA1-11 OTP error copy approved (was Q5).** Decided by Firoz, 2 Nov 2026: the QT9 OTP error wording (D-QA1-4) is approved as written. Used by QT9.

## Conflicts between the request, the code and CLAUDE.md (listed, not resolved)
1. "Reuse the pattern of the existing test-mode push token": that token is tied to `AUTH_MODE=test`, which the runtime guard forbids on staging (`apps/api/src/middleware/runtime-guard.ts:37-39`). QT1 reuses the shape (named switch + guard), not `AUTH_MODE`.
2. CLAUDE.md "never run remote commands" applies to implementer agents. The nightly `seed-reset` job runs `wrangler d1 execute --remote` against staging; that is the workflow acting under Firoz's secret, not an agent, and is limited to the QA ids.
3. W4's BT2 (not started) owns `apps/api/src/types.ts`, `apps/api/wrangler.toml` and `apps/api/package.json`. QA1 avoids all three: QT1 types its two env fields locally, QT2 and QT6 are invoked without new package scripts.
4. The request lists "Playwright E2E for trainer web on staging"; a local Playwright suite already gates PRs (`ci.yml` job `e2e`). QT5 adds a staging config beside it rather than changing it.
5. Item 9 (OTP error) was checked against AB2 and open PRs on 2 Nov: not covered (AB2 changed `Screen.tsx` only; open PRs #138, #57, #50 do not touch `AuthScreen.tsx`). QT9 owns it.

## Lanes

| Lane | Tasks (in order) | Model | Files owned | Spec |
|---|---|---|---|---|
| api-auth | QT1 | opus | `apps/api/src/auth/test-otp*.ts`, `apps/api/src/routes/auth-login.ts` (`/otp/start` branch), `apps/api/src/routes/auth-login.test-otp.test.ts`, `apps/api/src/middleware/runtime-guard*.ts`, `apps/api/.dev.vars.example` | QT1.md |
| qa-seed | QT2 | opus | `apps/api/scripts/qa-seed*.ts`, `apps/api/scripts/qa-reset.ts`, `apps/api/src/seed/qa/**`, `.gitignore` | QT2.md |
| mobile-guard | QT4 | sonnet | `apps/mobile/eslint-rules/**`, `apps/mobile/eslint.config.mjs`, `apps/mobile/.maestro/common/assert-no-crash.yaml` | QT4.md |
| mobile-auth | QT9 | sonnet | `apps/mobile/src/screens/AuthScreen.tsx`, `apps/mobile/src/screens/auth/verifyCodeError*.ts`, `apps/mobile/src/screens/auth/authFlow.test.ts` | QT9.md |
| mobile-maestro | QT3 | sonnet | `apps/mobile/.maestro/config.yaml`, `apps/mobile/.maestro/flows/**`, `apps/mobile/.maestro/common/sign-in-*.yaml`, `apps/mobile/.maestro/README.md` | QT3.md |
| web-staging | QT5 | sonnet | `apps/trainer-web/playwright.staging.config.ts`, `apps/trainer-web/e2e-staging/**` | QT5.md |
| api-qa | QT6 | sonnet | `apps/api/qa-smoke/**`, `apps/api/vitest.staging.config.ts` | QT6.md |
| qa-report | QT8 | sonnet | `scripts/qa/summarize*.mjs`, `scripts/qa/report.schema.json`, `scripts/qa/fixtures/**`, `docs/runbooks/qa-nightly.md` | QT8.md |
| ci | QT7 | opus | `.github/workflows/qa.yml`, `scripts/qa/build-android-apk.sh`, `scripts/qa/run-maestro.sh` | QT7.md |
| human | staging secrets, GitHub secrets and environment, first workflow run, Q1–Q5 answered 2 Nov 2026 (D-QA1-7 to D-QA1-11) | — | — | — |

Two lanes never own the same file. Checked against W3 (AB1 owns `.npmrc`; AB2 owns `apps/mobile/src/components/Screen.tsx` and `accessibilityRole.test.ts`; both merged) and W4 (BT2, BT2b, BT1, BT5 not started): **no overlap**. QT4 reads AB2's test but does not edit it. QT9 owns `AuthScreen.tsx`, which W3's BT3b owned and merged in #144, so there is no live claim. Run at most **3 implementer sessions at once** on one Max seat. No new dependencies (Maestro and actionlint are installed on the runner, not in `package.json`); `pnpm-lock.yaml` must not change. Migrations: none.

## Order (3 implementer slots, one Max seat)
1. **Start:** slot 1 **QT1**; slot 2 **QT9**; slot 3 **QT4**.
2. **When a slot frees, take the next ready task in this order:** **QT2**, **QT8**, **QT6** (after QT1, QT2), **QT5** (after QT1, QT2), **QT3** (after QT1, QT2, QT4, QT9), **QT7** (after QT3, QT5, QT6, QT8). Never more than 3 at once.
3. **Merge** each PR when it is ready: `ci` green, review PASS, merge commits.
4. **Firoz:** the P0 manual steps below, then trigger `qa.yml` once by hand; from then on the nightly runs on its own.

## Specs (written 2 Nov 2026)
`docs/specs/` has QT1, QT2, QT3, QT4, QT5, QT6, QT7, QT8, QT9, each with `batch: QA1`. UI: QT9 only (`103-trainee-signin-error-ios.png`); the rest are `frames: []`, and their screenshots are compared to frames by the UI bot after merge.

| Task | Model | Size | One line |
|---|---|---|---|
| QT1 | opus | M | Staging-only fixed OTP for `qa+…@thefitbud.com`, impossible in production (helper + runtime guard + tests) |
| QT2 | opus | M | Deterministic QA trainer / on-track / slipping accounts with an idempotent seed and an id-scoped reset |
| QT3 | sonnet | M | Maestro flows for every trainee and trainer journey on Android, screenshots + no-crash check |
| QT4 | sonnet | S | ESLint rule for native `accessibilityRole` values plus the shared Maestro no-crash subflow |
| QT5 | sonnet | M | Playwright trainer-web suite against staging, beside the existing local suite |
| QT6 | sonnet | M | Vitest smoke and contract tests against the staging API, host-guarded |
| QT7 | opus | M | `qa.yml`: nightly + on-demand + PR smoke, GitHub-hosted emulator, one `qa-report` artifact |
| QT8 | sonnet | S | `summary.json` schema and builder, screenshot layout, `docs/runbooks/qa-nightly.md` |
| QT9 | sonnet | S | Real OTP verify errors, separate `finishAuth` failure, no double-tap resend |

## After merge: who runs it
- **The FitBud UI bot owns the nightly suite.** Each morning (IST) it fetches the latest `qa.yml` run's `qa-report` artifact (`gh run download <id> -n qa-report`), reads `summary.json`, compares each screenshot with its frame in `docs/design/mockups/png/` (mapping tables in `apps/mobile/.maestro/README.md` and `playwright.staging.config.ts`), and sends Firoz a report: pass/fail per suite, crashes first, contract failures, visual mismatches with both images, and proposed bug tasks. It files nothing and posts nothing without Firoz's approval.
- A crash or contract failure becomes a new task spec in the next batch; a visual mismatch is listed for Firoz to decide (bug or frame out of date).
- Coding agents own the suites' code (fixing a broken flow is a normal task).

## Manual steps for Firoz (QA1)
| # | Pri | Step | Blocks |
|---|---|---|---|
| 1 | P0 | Choose a 6-digit QA code; `wrangler secret put QA_TEST_OTP_CODE --env staging` and `wrangler secret put QA_TEST_OTP_ENABLED --env staging` (value `on`). **Never on production.** | QT3, QT5, QT6 real runs; QT7 first run (after QT1 deploys) |
| 2 | P0 | Deploy the API to staging after QT1 merges (normal staging deploy) | QT1 live on staging; QT3, QT5, QT6 runs |
| 3 | P0 | GitHub → Settings → Secrets (Actions): `QA_TEST_OTP_CODE` (same value), `FITBUD_QA_PASSWORD` (choose one), `CLOUDFLARE_API_TOKEN` (D1 edit on `fitbud-staging` only), `CLOUDFLARE_ACCOUNT_ID` | QT7 |
| 4 | P0 | Create the GitHub environment `staging-qa` and put `CLOUDFLARE_API_TOKEN` in it (no required reviewer, D-QA1-9) | QT7 `seed-reset` |
| 5 | P0 | Run `qa-reset.sql` + `qa-seed.sql` on staging once (or let the first manual workflow run do it) | QT3, QT5, QT6 first runs |
| 6 | P1 | Trigger `qa.yml` by hand once (`workflow_dispatch`, suites=all, tag=full) and hand the run to the UI bot | nightly trust before BT5 (Thu 12 Nov) |
| 7 | P1 | ~~Answer Q1–Q5~~ Done 2 Nov 2026 (D-QA1-7 to D-QA1-11) | none |
| 8 | P1 | Device check for QT9 on the Android dev build (correct code signs in once; airplane mode copy) | QT9 sign-off |
| 9 | P2 | ~~Decide Q4 (required check)~~ Decided: not required (D-QA1-10) | none |
| 10 | P2 | ~~`EXPO_TOKEN` GitHub secret~~ Not needed (D-QA1-8) | none |

No Maestro Cloud account is needed (D-QA1-5).

## Done when
- [ ] Every PR merged with `ci` green and review PASS.
- [ ] A manual `qa.yml` run on `main` produces `qa-report` with results from all four suites on staging.
- [ ] Re-introducing AB2's `"main" as "summary"` on a branch fails lint, unit tests and the Maestro smoke job.
- [ ] Production rejects the QA code (QT1 tests) and the production Worker has neither QA secret.
- [ ] The UI bot has sent Firoz one nightly report from a real run.

## What Firoz does
- Reads the UI bot's nightly report and the batch report. Code is reviewed by agents, not by hand (decided by Firoz, 1 Nov 2026).
- **Manual steps:** the table above; they will also be added to `docs/tasks/manual-steps.md` marked QA1 in a later docs PR.

## Report (filled in by the orchestrator at the end)
