---
id: QT8
title: QA run summary JSON, screenshot layout and the nightly runbook
batch: QA1
depends_on: []
lane: qa-report
files_owned:
  - scripts/qa/summarize.mjs  # new
  - scripts/qa/summarize.test.mjs  # new (node --test)
  - scripts/qa/report.schema.json  # new
  - scripts/qa/fixtures/**  # new sample JUnit/JSON inputs
  - docs/runbooks/qa-nightly.md  # new
frames: []
model: sonnet
size: S
---

## Outcome
Every QA run produces one artifact `qa-report` containing `summary.json` (machine-readable, schema-checked), `screenshots/<suite>/<name>.png`, the raw JUnit/JSON reports and logs, so the FitBud UI bot can download it from the workflow run and write Firoz a report. `docs/runbooks/qa-nightly.md` explains how to run everything locally and how to read the results.

## Context
- Inputs (from QT3, QT5, QT6): `qa-results/mobile/junit.xml` + Maestro `--test-output-dir` screenshots; `qa-results/web/junit.xml`, `results.json` and screenshots; `qa-results/api/junit.xml`, `results.json`; logs (`qa-results/logs/*.log`, logcat from QT7).
- **`summary.json` (schema `scripts/qa/report.schema.json`, version 1):** `{ schemaVersion: 1, runId, runUrl, gitSha, branch, trigger: "nightly"|"pr"|"manual", startedAt, finishedAt (ISO UTC), environment: "staging"|"local", status: "pass"|"fail"|"partial", suites: [{ name: "mobile"|"web"|"api"|"unit", status, total, passed, failed, skipped, durationMs, failures: [{ test, message (first 500 chars, secrets redacted), screenshot?, log? }] }], screenshots: [{ suite, name, path, frame? }], crashes: [{ suite, flow, kind: "redbox"|"load-error"|"anr"|"fatal", evidence }], latency: { p50Ms, p95Ms } }`. `frame` comes from the README mapping tables in QT3 and QT5.
- **Redaction:** the script replaces any value of the env vars `QA_TEST_OTP_CODE`, `FITBUD_QA_PASSWORD`, `EXPO_TOKEN` and anything matching an email outside `qa+…@thefitbud.com` with `[redacted]` in messages and logs it copies.
- `summarize.mjs` uses Node built-ins only (no new dependency); a tiny JUnit parser is fine. It exits 0 even when tests failed (the workflow's status comes from the suite steps), and 2 if inputs are malformed.
- **Runbook** `docs/runbooks/qa-nightly.md`: prerequisites (Android Studio emulator API 34, Maestro CLI, Node from `.nvmrc`, pnpm), the env vars by name, running each suite locally, applying the QA reset+seed to staging (the remote command is Firoz's or the workflow's), triggering the workflow by hand (`gh workflow run qa-nightly.yml`), downloading the artifact (`gh run download <id> -n qa-report`), reading `summary.json`, triage (crash → AB2-style bug; contract failure → API bug; flaky → re-run once), and who owns what after merge (the FitBud UI bot runs, compares screenshots to `docs/design/mockups/png`, reports to Firoz).
- Written against `main` at b646ffc. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- No report format; the existing `e2e` job uploads the raw Playwright report on failure only.

## Acceptance criteria
- [ ] `node scripts/qa/summarize.mjs --in qa-results --out qa-report` builds `qa-report/summary.json` and copies screenshots into `qa-report/screenshots/<suite>/`.
- [ ] Output validates against `report.schema.json` (checked in the test with a small hand-written validator, no new dependency).
- [ ] Fixtures cover: all pass; one failure per suite; a mobile crash detected from `assert-no-crash` failure text; a missing suite (→ `partial`); a secret in a failure message (→ redacted).
- [ ] The runbook has the sections listed above and contains no secret values.
- [ ] `node --test scripts/qa/` passes; `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Writing the Firoz-facing report (the UI bot does it). Posting anywhere. The workflow itself (QT7).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `scripts/qa/summarize.test.mjs` with the fixtures above.
- Checks to run: `node --test scripts/qa/`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: n/a.

## Stop conditions
- Parsing Maestro or Playwright output needs a new dependency.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `eas build`, `eas submit`), a secret value, production data or a deploy.
