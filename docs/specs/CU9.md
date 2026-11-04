---
id: CU9
title: QA hygiene: ignore QA output dirs and fix QT8's short-secret over-redaction
batch: W3b
depends_on: [CU4]
lane: qa
files_owned:
  - .gitignore
  - scripts/qa/summarize.mjs  # makeRedactor only
  - scripts/qa/summarize.test.mjs
frames: []
model: sonnet
size: S
---

## Outcome
Local QA runs leave nothing for `git status` to show, and the QA report keeps secrets redacted without turning ordinary words in failure messages into `[redacted]`.

## Context
- Source: the W3 report's "Follow-ups raised on 3 Nov" (`docs/specs/batches/W3.md`, 3 Nov continuation) and QA1's "Follow-ups raised" (`docs/specs/batches/QA1.md`); W3b is approved by Firoz, 3 Nov 2026 (`docs/specs/batches/W3b.md`). (QT7b and the QT8 review item).
- `makeRedactor` (`scripts/qa/summarize.mjs:32-55`) redacts the value of every env var named `*TOKEN|SECRET|PASSWORD|KEY` with length ≥ 3, by plain substring. A short value (for example a 3-6 character test value) also matches inside ordinary words, garbling messages.
- Touching `scripts/qa/**` runs `qa-scripts` (now required, CU4/D-W3b-1), so this task proves the required check works.

## Gap list
- `.gitignore`: no `qa-results/`, `qa-report/`, `qa-upload/`.
- `scripts/qa/summarize.mjs:37`: `v.length >= 3` plus substring replace over-redacts.
- Written against `main` at dadaa13. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] `.gitignore` ignores `qa-results/`, `qa-report/` and `qa-upload/` at any depth.
- [ ] Credential-named values of 8+ characters are still replaced anywhere; shorter ones are replaced only on token boundaries (not inside a longer word), and `QA_TEST_OTP_CODE` (6 digits) stays redacted wherever it appears as a standalone number.
- [ ] Existing redaction tests pass unchanged; the email, Bearer, JWT and otp/code rules are untouched.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Other summarize.mjs behaviour; `qa.yml` (CU4).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `summarize.test.mjs`: a short credential value inside a longer word is left alone; the same value standalone is redacted; an 8+ value inside a word is redacted; the OTP stays redacted.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A boundary rule would let a real secret shape through.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
