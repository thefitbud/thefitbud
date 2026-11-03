---
id: CU5
title: reportError sanitises at the reporter boundary
batch: W3b
depends_on: [CU3, CU4]
lane: mobile
files_owned:
  - apps/mobile/src/lib/reportError.ts
  - apps/mobile/src/lib/reportError.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
When a crash reporter is installed (Sentry, BT2b in W4), it receives a sanitised error: name, code, status and zod issue paths, with no token, refresh token, code, password or email anywhere, including inside messages and paths.

## Context
- Source: the W3 report's "Follow-ups raised on 3 Nov" (`docs/specs/batches/W3.md`, 3 Nov continuation) and QA1's "Follow-ups raised" (`docs/specs/batches/QA1.md`); W3b is approved by Firoz, 3 Nov 2026 (`docs/specs/batches/W3b.md`).
- AGENTS.md: never log tokens, refresh tokens, codes, passwords or email addresses, including inside paths. Today the dev branch logs a safe summary, but the release path forwards the raw `err` to the installed reporter.
- BT2b (W4) installs the Sentry reporter; this makes the seam safe before it lands. No Sentry dependency here.

## Gap list
- `apps/mobile/src/lib/reportError.ts:80`: `reporter?.(where, err)` passes the raw error.
- Written against `main` at dadaa13. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] The reporter receives a sanitised object (or an `Error` with a sanitised message): emails, 6-digit codes, bearer/JWT-shaped strings and known secret field values replaced; `ApiClientError` code/status and zod issue paths kept.
- [ ] Dev logging unchanged in content apart from the same sanitising.
- [ ] The reporter signature stays compatible for BT2b (document it in the file).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Installing Sentry (BT2b). Changing which call sites report.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `reportError.test.ts`: an installed fake reporter never sees an email, code, JWT, `Bearer` value or password present in the input error's message, cause or zod path; codes and paths survive.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- Sanitising needs a dependency.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
