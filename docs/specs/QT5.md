---
id: QT5
title: Playwright E2E for trainer web on staging
batch: QA1
depends_on: [QT1, QT2]
lane: web-staging
files_owned:
  - apps/trainer-web/playwright.staging.config.ts  # new
  - apps/trainer-web/e2e-staging/**  # new specs and helpers
frames: []
model: sonnet
size: M
---

## Outcome
The trainer-web journeys run against the deployed staging app (`https://app-staging.thefitbud.com`, API `api-staging`) as `qa+trainer@thefitbud.com`, with screenshots at each key screen and a JUnit + JSON report, without starting a local API.

## Context
- **Existing E2E (reuse, do not duplicate):** `apps/trainer-web/e2e/*.spec.ts` (trainer-flows, tw-b…tw-g, tr-02-invite, iPad) run on PRs in `.github/workflows/ci.yml` job `e2e` against a **local** seeded API: `apps/trainer-web/playwright.config.ts:10` uses `global-setup.ts`, which runs `db:reset` and `wrangler dev --local` and signs in with demo accounts. That suite stays the PR gate. QT5 is a separate config for staging: no global setup that touches a DB; sign-in through the real UI (email code with QT1, or password from QT2).
- **Reuse:** import selectors and page helpers from `apps/trainer-web/e2e/support/session.ts` where they are environment-neutral; do not edit that file (if a helper must change, stop).
- **Journeys** (same as QT3's trainer set): sign in by code and by password; Clients list (QA Aarav, QA Rohan); a client's status/overview; Home/Attention panel with QA Rohan's open exceptions; exception review (resolve one, trainer-initiated only; writes on QA accounts allowed, D-QA1-7); check-in review (mark reviewed); trainer notes; settings/More. Expected names and counts come from `apps/api/src/seed/qa/expectations.json`.
- Env: `STAGING_WEB_URL` (default `https://app-staging.thefitbud.com`), `QA_TRAINER_EMAIL`, `QA_OTP_CODE`, `QA_PASSWORD`. Missing secrets → the suite skips with a clear message, never fails silently green.
- Screenshots: `page.screenshot` at each key screen, named `web-<journey>__<step>.png`, plus Playwright's `screenshot: "only-on-failure"` and `trace: "retain-on-failure"`. Reporters: `list`, `junit` (`qa-results/web/junit.xml`), `json` (`qa-results/web/results.json`).
- Projects: Desktop Chrome 1440x900 only (frames are 1440 wide); iPad is covered by the local suite.
- Written against `main` at b646ffc. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- No E2E runs against a deployed environment; the local suite cannot catch staging config, CORS, cookie-domain or Firebase project issues.

## Acceptance criteria
- [ ] `pnpm --filter @fitbud/trainer-web exec playwright test -c playwright.staging.config.ts` runs every journey above; locally against staging it passes (run by Firoz or QT7, not claimed by the implementer, who has no staging secrets).
- [ ] `--list` shows all tests; with no secrets set, the suite reports "skipped: QA secrets not set".
- [ ] The default `playwright.config.ts` does not pick up `e2e-staging/**` (assert with `--list`).
- [ ] No secret, code, password or real email in any file.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; the existing `e2e` job is unchanged.

## Out of scope
- Changing the local suite or `ci.yml` (QT7). Mobile. Invites to real addresses.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/trainer-web/e2e-staging/*.spec.ts` as above.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `playwright test -c playwright.staging.config.ts --list`.

## Visual check
- Screenshots map to `01-trainer-web-signin.png`, `136-trainer-web-clients-web.png`, `02-trainer-web-home-panel-v3-web.png`, `163-trainer-web-checkin-review-web.png` and the client overview frames; the mapping goes in a comment block at the top of the config. Compared by the UI bot.

## Stop conditions
- Staging sign-in needs a change outside `files_owned` (e.g. cookie domain).
- `e2e/support/session.ts` must change.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `eas build`, `eas submit`), a secret value, production data or a deploy.
