# QA nightly runbook

How the automated end-to-end QA (batch QA1) runs, how to run it yourself, and how to read the `qa-report` artifact. Decisions: D-QA1-3 (three QA accounts), D-QA1-5 (GitHub-hosted runners, APK built on the runner), D-QA1-6 (what runs when), D-QA1-7 (the nightly run writes to the QA accounts).

No secret value belongs in this file, a PR, a log or a chat. Names only.

## What runs, and when

| Suite | Tool | Task | Raw results |
|---|---|---|---|
| `mobile` | Maestro on an Android emulator, staging-variant app | QT3 | `qa-results/mobile/junit.xml`, screenshots, `qa-results/logs/logcat.log` |
| `web` | Playwright against `app-staging.thefitbud.com` | QT5 | `qa-results/web/junit.xml`, `results.json`, screenshots |
| `api` | Vitest against `api-staging.thefitbud.com` | QT6 | `qa-results/api/junit.xml`, `results.json` |
| `unit` | the repo's own unit run (`pnpm test`) as JUnit | QT7 | `qa-results/unit/junit.xml` |

- **Nightly at 02:00 IST** (`30 20 * * *` UTC) on `main`, and **on demand**: reset and seed the QA accounts, then all four suites. This run makes real changes on the QA accounts (resolves exceptions, reviews check-ins, logs workouts and meals, adds notes). The next reset restores them. It never touches Firoz's real-email accounts.
- **Pull requests that touch `apps/mobile/**` or `packages/ui-mobile/**`**: the Maestro `smoke` tag only, advisory (not a required check). PR runs never reset or seed.
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

The three QA accounts are `qa+trainer@`, `qa+ontrack@` and `qa+slipping@thefitbud.com`. The login code works only for `qa+…@thefitbud.com` addresses and only on staging; production refuses it.

## Run each suite locally

Run from the repo root. Staging suites need the staging secrets above, which agents do not have.

```bash
# unit (no secrets)
pnpm test

# api smoke against staging
pnpm --filter @fitbud/api exec vitest run -c vitest.staging.config.ts

# trainer web against staging
pnpm --filter @fitbud/trainer-web exec playwright test -c playwright.staging.config.ts

# mobile: boot the emulator, install the staging-variant APK, then
maestro test --format junit --test-output-dir qa-results/mobile apps/mobile/.maestro/flows
```

Each suite writes into `qa-results/<suite>/` as in the table above. Then build the report:

```bash
node scripts/qa/summarize.mjs --in qa-results --out qa-report \
  --frames apps/mobile/.maestro/README.md \
  --frames apps/trainer-web/playwright.staging.config.ts \
  --frame-dir docs/design/mockups/png --environment local
```

`--expect mobile,web,api,unit` is the default. A PR smoke run passes `--expect mobile`.

Run the builder's own tests with `node --test "scripts/qa/**/*.test.mjs"` (Node 22 needs the glob; a bare directory is rejected).

## Reset and seed the QA accounts on staging

Remote commands. Run by the nightly workflow (environment `staging-qa`) or by Firoz, never by an agent session.

```bash
pnpm --filter @fitbud/api exec tsx scripts/qa-reset.ts   # writes apps/api/.qa-seed/qa-reset.sql
pnpm --filter @fitbud/api exec tsx scripts/qa-seed.ts    # writes apps/api/.qa-seed/qa-seed.sql
cd apps/api
wrangler d1 execute fitbud-staging --env staging --remote --file .qa-seed/qa-reset.sql
wrangler d1 execute fitbud-staging --env staging --remote --file .qa-seed/qa-seed.sql
```

The exact generator invocation is in QT2's PR; the reset is scoped to the three QA user ids and aborts on any other id. Staging only, never `fitbud-prod`.

## Trigger the workflow by hand

```bash
gh workflow run qa.yml -f suites=all -f tag=full
gh run list --workflow qa.yml --limit 3
gh run watch <id>
```

The workflow file is `.github/workflows/qa.yml` (QT7, D-QA1-6). `suites` is `all|api|web|android`, `tag` is `smoke|full`.

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
3. **`suites[]`**, always four entries (`mobile`, `web`, `api`, `unit`):

   | Suite `status` | Meaning |
   |---|---|
   | `pass` | report parsed, at least one test ran and passed, none failed, no crash |
   | `fail` | a test failed, or the app crashed |
   | `error` | results exist but are unusable: truncated or malformed report, zero tests, everything skipped, or screenshots and logs with no report (runner died). Treat as a failure of the QA run itself. |
   | `not-run` | expected, and nothing at all was produced (`reason` says where it looked) |
   | `not-requested` | not part of this run (for example the web suite in a PR smoke run) |

   Each `failures[]` entry has `test`, `message` (first 500 characters, redacted), and when known `screenshot` and `log`.
4. **`screenshots[]`**: `{ suite, name, path, frame }`. `frame` is the file in `docs/design/mockups/png` to compare with, taken from the mapping tables in `apps/mobile/.maestro/README.md` and `apps/trainer-web/playwright.staging.config.ts`. `null` means no mapping: say so, do not guess a frame.
5. **`latency`**: p50 and p95 of the api suite's per-test durations in ms, or `null`.
6. **`warnings`**: unmapped screenshots, mapped frames that do not exist.

Redaction: the builder replaces, with `[redacted]`, the value of `QA_TEST_OTP_CODE` and of any environment variable whose name ends in `TOKEN`, `SECRET`, `PASSWORD` or `KEY` (so `FITBUD_QA_PASSWORD`, `EXPO_TOKEN` and `CLOUDFLARE_API_TOKEN` are covered), `NAME=<20+ characters>` assignments, well-known key shapes (`sk_live_…`, `ghp_…`), bearer tokens, JWTs, a 6-digit code written next to "otp" or "code", and any email other than `qa+…@thefitbud.com`. It does this in messages and in every report and log it copies. Redaction is literal: a secret split across a newline survives as two halves in the raw log copy.

**Screenshots are not redacted.** They are copied byte for byte, and the `qa-report` artifact of a public repository is publicly downloadable. Assume anything visible on screen is public.

**The QA OTP code is treated as non-secret (D-QA1-14, Firoz, 3 Nov 2026).** It is not rotated on a schedule. It is safe to treat this way only because QT1 confines it: it works only when `ENVIRONMENT=staging`, only for `qa+…@thefitbud.com`, only for the `login` purpose, and production refuses every request if either QA secret is set. It reaches three accounts holding generated seed data that are wiped nightly — never production, and never Firoz's real-email accounts, which the allowlist excludes.

Even so, QT3 takes no screenshot of a filled code field, so the code should not appear in an artifact at all. If you ever see one, it is not an emergency — but tell whoever owns QT3, because the flow has drifted from D-QA1-14.

**Revisit D-QA1-14 before the next public run if** staging starts carrying real data, or the allowlist widens beyond the QA accounts. The reasoning above stops holding at that point.

Exit codes of `summarize.mjs`: `0` always when it could read the inputs, even if tests failed (the workflow's own status comes from the suite steps); `2` when a report is malformed or the arguments are wrong. On `2` it still writes `summary.json` with that suite as `error`, so the upload step must run with `if: always()`.

## Triage

| What you see | What it is | Next step |
|---|---|---|
| `crashes` not empty | An app crash (AB2-style: a native view rejected a prop). | Open `evidence`, then the flow's `screenshot` and `logs/logcat.log`. Write an AB2-style bug task. |
| An `api` failure about status code or body shape | A contract failure. | API bug task, with the failing request from the message. |
| A `web` or `mobile` failure, no crash | Broken flow or a real regression. | Re-run once (below). If it fails again, bug task. |
| Same test fails then passes on re-run | Flaky. | Note it. Fix the flow in a normal task if it repeats. |
| `error` or `not-run` suite | The QA run itself broke (emulator did not boot, APK build failed, report cut off). | Read the job log of that suite. Infrastructure flakiness on the hosted emulator is accepted (D-QA1-8); re-run. Repeats need a QT task. |
| `partial` | A suite never ran. | Same as above. Never treat `partial` as a pass. |
| Screenshot differs from its `frame` | Visual mismatch. | List both images for Firoz. He decides: bug, or frame out of date. |

Re-run once: `gh run rerun <id> --failed`, or trigger by hand as above. A re-run on `main` writes to the QA accounts again, which the next reset restores.

## Who owns what after merge

- **The FitBud UI bot** runs the morning routine (IST): fetches the latest `qa.yml` run's `qa-report`, reads `summary.json`, compares screenshots with their frames, and reports to Firoz: pass/fail per suite, crashes first, contract failures, visual mismatches with both images, proposed bug tasks. It files and posts nothing without Firoz's approval.
- **Firoz** decides visual mismatches, owns the staging secrets, the Worker deploy and the first manual run.
- **Coding agents** own the suites' code. A crash or contract failure becomes a task spec in the next batch.
