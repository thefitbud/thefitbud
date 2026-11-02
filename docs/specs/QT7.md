---
id: QT7
title: CI wiring: QA workflow on PRs and nightly against staging
batch: QA1
depends_on: [QT3, QT5, QT6, QT8]
lane: ci
files_owned:
  - .github/workflows/qa.yml  # new; ci.yml is not changed
  - scripts/qa/build-android-apk.sh  # new: prebuild + gradle assembleRelease, staging variant
  - scripts/qa/run-maestro.sh  # new: emulator-side runner, logcat capture
frames: []
model: opus
size: M
---

## Outcome
A new workflow `qa.yml` runs the staging API smoke, the staging Playwright suite and the Maestro Android suite on a GitHub-hosted emulator **every night** against staging and **on demand**, and runs the Maestro smoke subset on PRs that touch the mobile app. Every run uploads one `qa-report` artifact (QT8). The existing `ci.yml` (`ci`, `e2e`, `banned-strings`) keeps doing unit, lint, typecheck and local Playwright on PRs, unchanged.

## Context
- **Decided (D-QA1-5): GitHub-hosted runners, not Maestro Cloud or EAS Workflows.** The repo is **public**, so standard GitHub-hosted runners cost nothing, and `ubuntu-latest` supports KVM, so the Android emulator runs hardware-accelerated (`reactivecircus/android-emulator-runner`, API 34, `x86_64`, `google_apis`, AVD cached). Maestro Cloud and EAS Workflows' Maestro both bill per device-minute or need a paid plan; EAS free-tier builds are limited and queue at low priority. Building the APK on the runner (`expo prebuild` + Gradle `assembleRelease` with `APP_VARIANT=staging`) avoids EAS build minutes entirely and needs no `EXPO_TOKEN`. Expected nightly wall time ≈ 35–50 min (APK ~15 min with Gradle cache, Maestro full ~20 min). Fallback if the emulator is too flaky (> 2 infra failures a week): run Maestro on EAS Workflows using a nightly preview build; that would need `EXPO_TOKEN` and is Firoz's call (Q2).
- **Jobs:**
  1. `changes` (copy the pattern in `.github/workflows/ci.yml`): `mobile=true` when `apps/mobile/**` or `packages/ui-mobile/**` changed.
  2. `api-smoke` (nightly, manual): `vitest run -c vitest.staging.config.ts` (QT6).
  3. `web-staging` (nightly, manual): `playwright test -c playwright.staging.config.ts` (QT5), Chromium only.
  4. `android` (nightly and manual: `full` tag; PRs with `mobile=true`: `smoke` tag): build APK (`scripts/qa/build-android-apk.sh`), boot emulator, install, `scripts/qa/run-maestro.sh` (QT3 flows, `--format junit`, logcat to `qa-results/logs/logcat.log`, screenshot dir). PR runs are **advisory** (not in the `main` ruleset) because they hit shared staging; they never run the reset.
  5. `seed-reset` (nightly only, first): applies QT2's `qa-reset.sql` then `qa-seed.sql` to `fitbud-staging` with `wrangler d1 execute fitbud-staging --env staging --remote --file …`. This is the **only remote write**, runs only on `schedule` or `workflow_dispatch` from `main`, in a GitHub **environment** `staging-qa` with a required reviewer optional (Q3), using `CLOUDFLARE_API_TOKEN` scoped to D1 edit on the staging database only.
  6. `report` (always): download all job artifacts into `qa-results/`, run `scripts/qa/summarize.mjs`, upload `qa-report` (retention 14 days) and write a short job summary.
- **Schedule:** `cron: "30 20 * * *"` (02:00 IST), `workflow_dispatch` with inputs `suites` (all|api|web|android) and `tag` (smoke|full).
- **Secrets by name only:** `QA_TEST_OTP_CODE`, `FITBUD_QA_PASSWORD`, `CLOUDFLARE_API_TOKEN` (staging D1 only), `CLOUDFLARE_ACCOUNT_ID`; `EXPO_TOKEN` only if Q2 picks EAS. PR jobs from forks get no secrets: they skip the staging steps with a message. No secret is echoed; `set +x` around commands that read them.
- **Permissions:** `contents: read` only. No PR comments, no pushes, no deploys. Actions pinned to a major version like `ci.yml`.
- Concurrency group `qa-staging` with `cancel-in-progress: false` so two runs never write staging at once.
- Written against `main` at b646ffc. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- `.github/workflows/ci.yml` has no staging or mobile jobs; there is no schedule and no report artifact on success.

## Acceptance criteria
- [ ] `qa.yml` passes `actionlint` (run locally, output in the PR).
- [ ] The `seed-reset` job cannot run on `pull_request` (asserted by its `if:`), and only on `refs/heads/main`.
- [ ] `build-android-apk.sh` builds `app-release.apk` for `com.thefitbud.mobile.staging` with no EAS login; the generated `android/` is not committed. Verified by the first workflow run after merge (not claimable in a cloud session without an Android SDK).
- [ ] A missing secret makes the matching job skip with a clear notice, never fail with a stack trace or print the value.
- [ ] Every run, pass or fail, uploads `qa-report` with `summary.json`.
- [ ] `ci.yml` is byte-identical.
- [ ] **First real run (Firoz or the UI bot via `workflow_dispatch`)** after the P0 manual steps: all four suites produce results. Not claimed by the implementer.

## Out of scope
- Making QA jobs required checks (Q4). iOS. Production. Notifying anyone (the UI bot reads artifacts).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `actionlint` and `shellcheck` on the new files, recorded in the PR.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: n/a.

## Stop conditions
- A release APK cannot be built without signing secrets (fall back to `assembleDebug` with the bundled JS and report).
- The emulator cannot boot on `ubuntu-latest` (record evidence; then Q2's fallback needs Firoz).
- Any step would need a production credential.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `eas build`, `eas submit`), a secret value, production data or a deploy.
