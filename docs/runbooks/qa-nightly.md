# QA nightly runbook

How the automated end-to-end QA (batch QA1) runs, how to run it yourself, and how to read the `qa-report` artifact. Decisions: D-QA1-3 (QA accounts, now one persona set per suite — D-W5-14), D-QA1-5 (GitHub-hosted runners, APK built on the runner), D-QA1-6 (what runs when), D-QA1-7 (the nightly run writes to the QA accounts).

No secret value belongs in this file, a PR, a log or a chat. Names only.

## What runs, and when

| Suite | Tool | Task | Raw results |
|---|---|---|---|
| `mobile` | Maestro on an Android emulator, staging-variant app | QT3 | `qa-results/mobile/junit.xml`, screenshots, `qa-results/logs/logcat.log` |
| `ios` | the same Maestro flows on an iOS simulator pinned to `Asia/Kolkata` | CU19 | `qa-results/ios/junit.xml`, screenshots, `qa-results/logs/ios-sim.log` |
| `web` | Playwright against `app-staging.thefitbud.com` | QT5 | `qa-results/web/junit.xml`, `results.json`, screenshots |
| `api` | Vitest against `api-staging.thefitbud.com` | QT6 | `qa-results/api/junit.xml`, `results.json` |
| `unit` | the repo's own unit run (`pnpm test`) as JUnit | QT7 | `qa-results/unit/junit.xml` |

- **Nightly at 02:00 IST** (`30 20 * * *` UTC) on `main`, and **on demand**: four seed jobs (`seed-api`, `seed-web`, `seed-android`, `seed-ios`). Each runs `qa-reset.ts --suite <name>` then `qa-seed.ts --suite <name>` and applies only that suite's SQL. The suites in the table then run side by side. One suite's writes cannot change another's accounts (D-W5-14). A run still changes the accounts it drives (resolves exceptions, reviews check-ins, logs workouts and meals, adds notes). The next reset of that suite restores them. It never touches Firoz's real-email accounts.
- **Pull requests that touch `apps/mobile/**` or `packages/ui-mobile/**`**: the Maestro `smoke` tag on Android and on iOS, advisory (not a required check). PR runs never reset or seed. A dispatched `android` run expects the `mobile` report only; a pull request expects `mobile` and `ios`.
- `ci.yml` stays the PR gate (lint, typecheck, unit, local Playwright, banned strings). The QA workflow does not replace it.

## Prerequisites (local runs)

- Node from `.nvmrc` (22.23.3) and pnpm 9.15.4. `pnpm install`, then `pnpm build:packages`.
- Android Studio with an emulator image, API 34 (`x86_64`, Google APIs). Start it before the Maestro run.
- Maestro CLI (install steps in `apps/mobile/.maestro/README.md`).
- Playwright's Chromium for the web suite: `pnpm --filter @fitbud/trainer-web exec playwright install chromium`.

## Environment variables (names only)

| Name | Used by | Where the value lives |
|---|---|---|
| `QA_TEST_OTP_CODE` | mobile, web, api (the fixed login code on staging, D-QA1-1) | Firoz's vault; GitHub Actions secret; Worker secret on staging only |
| `FITBUD_QA_PASSWORD` | suites that sign in with a password | Firoz's vault; GitHub Actions secret |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | the nightly reset and seed step only (D1 edit on `fitbud-staging`) | GitHub secrets, environment `staging-qa` |

Other variable names (API and app URLs, account emails) are documented by each suite: `apps/mobile/.maestro/README.md`, `apps/trainer-web/playwright.staging.config.ts`, `apps/api/vitest.staging.config.ts`. Export them in your shell; never write them to a file in the repo. `EXPO_TOKEN` is not used (D-QA1-8).

The login code works only for `qa+…@thefitbud.com` addresses and only on staging; production refuses it.

Each suite has its own personas (D-W5-14). `qa-seed` and `qa-reset` require `--suite`, one of `api`, `web`, `android`, `ios`. There is no shared seed file and the scripts do not default a suite.

| `--suite` | Accounts |
|---|---|
| `api` | `qa+trainer@`, `qa+ontrack@`, `qa+slipping@thefitbud.com`, plus `qa+trainer2@` and `qa+client2@` (API-smoke ownership checks only) |
| `web` | `qa+web-trainer@`, `qa+web-ontrack@`, `qa+web-slipping@thefitbud.com` |
| `android` | `qa+android-trainer@`, `qa+android-ontrack@`, `qa+android-slipping@thefitbud.com` |
| `ios` | `qa+ios-trainer@`, `qa+ios-ontrack@`, `qa+ios-slipping@thefitbud.com` |

Display names are the same in every suite (`QA Rahul`, `QA Aarav`, `QA Rohan`). The slipping account is code-only.

## Run each suite locally

Run from the repo root. Staging suites need the staging secrets above, which agents do not have.

```bash
# unit (no secrets)
pnpm test

# api smoke against staging
pnpm --filter @fitbud/api exec vitest run -c vitest.staging.config.ts

# trainer web against staging
pnpm --filter @fitbud/trainer-web exec playwright test -c playwright.staging.config.ts

# Android Maestro. Needs QA_TEST_OTP_CODE and FITBUD_QA_PASSWORD in the environment
# (names only). QA_MAESTRO_TAG is smoke or full (default full).
QA_MAESTRO_TAG=smoke scripts/qa/run-maestro.sh

# iOS Maestro, same flows, simulator set to Asia/Kolkata. QA_IOS_UDID is required.
QA_IOS_UDID=<udid> QA_MAESTRO_TAG=smoke scripts/qa/run-maestro-ios.sh
```

`scripts/qa/run-maestro.sh` and `scripts/qa/run-maestro-ios.sh` are the commands to copy. They read account emails from the top-level `.accounts[]` of `apps/api/src/seed/qa/expectations.json`, install the app, and write `qa-results/mobile` or `qa-results/ios`. On a fresh checkout that top-level list is the **android** suite. The iOS job in `qa.yml` rewrites the file to `suites.ios` before `run-maestro-ios.sh`. A local iOS run has to do the same, or pass the iOS emails itself; copying `.accounts[]` into an iOS run signs in as the Android personas. Hand-rolled `maestro test` flags, tags and the workspace path are in `apps/mobile/.maestro/README.md`.

Each suite writes into `qa-results/<suite>/` as in the table above. Then build the report:

```bash
node scripts/qa/summarize.mjs --in qa-results --out qa-report \
  --frames apps/mobile/.maestro/README.md \
  --frames apps/trainer-web/playwright.staging.config.ts \
  --frame-dir docs/design/mockups/png --environment local
```

`--expect mobile,ios,web,api,unit` is the default. A pull-request smoke run passes `--expect mobile,ios`. A dispatched single suite passes that suite's report name (`mobile` for `android`, otherwise `ios`, `web` or `api`).

Run the builder's own tests with `node --test "scripts/qa/**/*.test.mjs"` (Node 22 needs the glob; a bare directory is rejected).

## Reset and seed the QA accounts on staging

Remote commands. Run by the nightly workflow (environment `staging-qa`) or by Firoz, never by an agent session.

`--suite` is required (`api`, `web`, `android` or `ios`). Repeat the pair for each suite you are refreshing. `qa:seed` needs `FITBUD_QA_PASSWORD` in the environment so it can hash passwords; the plaintext is not written. `qa:reset` does not. Both scripts only write files and refuse `--remote`.

```bash
# example: the api suite. Swap api for web, android or ios.
FITBUD_QA_PASSWORD=… pnpm --filter @fitbud/api qa:seed -- --suite api --reference-date 2026-11-02
pnpm --filter @fitbud/api qa:reset -- --suite api
```

That writes `apps/api/.qa-seed/<suite>/qa-seed.sql`, `apps/api/.qa-seed/<suite>/expectations.json` and `apps/api/.qa-seed/<suite>/qa-reset.sql`. There is no `apps/api/.qa-seed/qa-seed.sql` at the old shared path.

Applying the SQL is the remote step. The nightly `seed-<suite>` job does it, or Firoz does. Reset file first, then the seed, staging only, never `fitbud-prod`:

```bash
cd apps/api
wrangler d1 execute fitbud-staging --env staging --remote --file .qa-seed/<suite>/qa-reset.sql
wrangler d1 execute fitbud-staging --env staging --remote --file .qa-seed/<suite>/qa-seed.sql
```

The reset deletes only that suite's QA user ids and aborts on any other id. The nightly job invokes the same scripts with `tsx` and the same `--suite`.

## Trigger the workflow by hand

```bash
gh workflow run qa.yml -f suites=all -f tag=full
gh run list --workflow qa.yml --limit 3
gh run watch <id>
```

The workflow file is `.github/workflows/qa.yml` (QT7, D-QA1-6). `suites` is `all|api|web|android|ios`, `tag` is `smoke|full`. Dispatch only from `main`.

Android and iOS take a turn in `queue-android` and `queue-ios` before their seed and suite jobs, so two runs of the same Maestro suite do not share accounts (queue, not evict). `api` and `web` still use the `qa-staging-<suite>` concurrency group. A job cancelled while it is pending on that group produces no results: the suite is `not-run`, the run is `partial`, and the report step exits 3. That is not a pass.

"Re-run failed jobs" does not re-run `queue-<suite>`. GitHub keeps the queue job's old success, and `seed-<suite>` plus the suite job then skip. Re-run all jobs, or re-run `queue-<suite>` (that re-runs its dependents). The report job writes this into the run summary.

## Download the artifact

```bash
gh run download <id> -n qa-report -D qa-report
```

Retention is 14 days. The report job runs even when a suite step failed, so a failed run still has `qa-report`.

```
qa-report/
  summary.json             the contract, read this first
  screenshots/<suite>/<name>.png
  raw/<suite>/junit.xml    redacted copies of the raw reports (and results.json)
  logs/*.log               redacted logs, logs/logcat.log for the app
```

## Reading `summary.json`

Schema: `scripts/qa/report.schema.json`, `schemaVersion: 1`. A change that removes or renames a field bumps the version.

Read it in this order:

1. **`crashes`** first. Each has `suite`, `flow`, `kind` (`redbox`, `load-error`, `anr`, `fatal`) and redacted `evidence`. A crash makes the run `fail` even if every flow passed. `flow: "unknown"` means it was found only in logcat.
2. **`status`**: `pass`, `fail` or `partial`.
   - `pass` only when every expected suite is `pass`.
   - `fail` when any suite is `fail` or `error`, or any crash exists.
   - `partial` when nothing failed but an expected suite did not run.
3. **`suites[]`**, always five entries (`mobile`, `ios`, `web`, `api`, `unit`):

   | Suite `status` | Meaning |
   |---|---|
   | `pass` | report parsed, at least one test ran and passed, none failed, no crash |
   | `fail` | a test failed, or the app crashed |
   | `error` | results exist but are unusable: truncated or malformed report, zero tests, everything skipped, or screenshots and logs with no report (runner died). Treat as a failure of the QA run itself. |
   | `not-run` | expected, and nothing at all was produced (`reason` says where it looked) |
   | `not-requested` | not part of this run (for example the web suite in a PR smoke run) |

   An Android `pass` stands only when `logs/logcat.log` holds the app's own output. A missing log, or one with none of that output, scores `fail` even though every flow passed (G18): the crash scan had nothing to scan. The iOS twin scores `error` when `logs/ios-sim.log` does not prove the app's output was captured.

   Each `failures[]` entry has `test`, `message` (first 500 characters, redacted), and when known `screenshot` and `log`.
4. **`screenshots[]`**: `{ suite, name, path, frame }`. `frame` is the file in `docs/design/mockups/png` to compare with, taken from the mapping tables in `apps/mobile/.maestro/README.md` and `apps/trainer-web/playwright.staging.config.ts`. `null` means no mapping: say so, do not guess a frame.
5. **`latency`**: p50 and p95 of the api suite's per-test durations in ms, or `null`.
6. **`warnings`**: unmapped screenshots, mapped frames that do not exist.

Redaction: the builder replaces, with `[redacted]`, the value of `QA_TEST_OTP_CODE` and of any environment variable whose name ends in `TOKEN`, `SECRET`, `PASSWORD` or `KEY` (so `FITBUD_QA_PASSWORD`, `EXPO_TOKEN` and `CLOUDFLARE_API_TOKEN` are covered), `NAME=<20+ characters>` assignments, well-known key shapes (`sk_live_…`, `ghp_…`), bearer tokens, JWTs, a 6-digit code written next to "otp" or "code", and any email other than `qa+…@thefitbud.com`. It does this in messages and in every report and log it copies. Redaction is literal: a secret split across a newline survives as two halves in the raw log copy.

**Screenshots are not redacted.** They are copied byte for byte, and the `qa-report` artifact of a public repository is publicly downloadable. Assume anything visible on screen is public.

**The QA OTP code is treated as non-secret (D-QA1-14, Firoz, 3 Nov 2026).** It is not rotated on a schedule. It is safe to treat this way only because QT1 confines it: it works only when `ENVIRONMENT=staging`, only for `qa+…@thefitbud.com`, only for the `login` purpose, and production refuses every request if either QA secret is set. It reaches three accounts holding generated seed data that are wiped nightly — never production, and never Firoz's real-email accounts, which the allowlist excludes.

Even so, QT3 takes no screenshot of a filled code field, so the code should not appear in an artifact at all. If you ever see one, it is not an emergency — but tell whoever owns QT3, because the flow has drifted from D-QA1-14.

**Revisit D-QA1-14 before the next public run if** staging starts carrying real data, or the allowlist widens beyond the QA accounts. The reasoning above stops holding at that point.

Exit codes of `summarize.mjs`: `0` when it could read the inputs and the run is `pass` or `fail` (a failed test stays in `summary.json`; the workflow's suite steps carry that failure); `2` when a report is malformed or the arguments are wrong; `3` when the run is `partial` (an expected suite is `not-run`). `partial` is never a pass (BT16). On `2` and on `3` it still writes `summary.json` first, so the upload step must run with `if: always()`. The report step in `qa.yml` exits 3 on purpose when a suite was evicted or skipped its queue turn.

## Triage

| What you see | What it is | Next step |
|---|---|---|
| `crashes` not empty | An app crash (AB2-style: a native view rejected a prop). | Open `evidence`, then the flow's `screenshot` and `logs/logcat.log`. Write an AB2-style bug task. |
| An `api` failure about status code or body shape | A contract failure. | API bug task, with the failing request from the message. |
| A `web` or `mobile` failure, no crash | Broken flow or a real regression. | Re-run once (below). If it fails again, bug task. |
| Same test fails then passes on re-run | Flaky. | Note it. Fix the flow in a normal task if it repeats. |
| `error` or `not-run` suite | The QA run itself broke (emulator did not boot, APK build failed, report cut off). | Read the job log of that suite. Infrastructure flakiness on the hosted emulator is accepted (D-QA1-8); re-run. Repeats need a QT task. |
| `partial` | A suite never ran (evicted from `qa-staging-<suite>`, or a partial re-run that skipped `queue-<suite>`). | Read the run summary. Re-run all jobs, or re-run `queue-<suite>`. Never treat `partial` as a pass. The report step exits 3. |
| Screenshot differs from its `frame` | Visual mismatch. | List both images for Firoz. He decides: bug, or frame out of date. |

Re-run once: `gh run rerun <id> --failed`, or trigger by hand as above. A re-run on `main` writes to the QA accounts again, which the next reset restores.

## Who owns what after merge

- **The FitBud UI bot** runs the morning routine (IST): fetches the latest `qa.yml` run's `qa-report`, reads `summary.json`, compares screenshots with their frames, and reports to Firoz: pass/fail per suite, crashes first, contract failures, visual mismatches with both images, proposed bug tasks. It files and posts nothing without Firoz's approval.
- **Firoz** decides visual mismatches, owns the staging secrets, the Worker deploy and the first manual run.
- **Coding agents** own the suites' code. A crash or contract failure becomes a task spec in the next batch.
