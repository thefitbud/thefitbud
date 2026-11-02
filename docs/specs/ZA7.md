---
id: ZA7
title: Demo seed: remove the hard-coded Asia/Kolkata literals in history.ts and test close−30 min
batch: W5
depends_on: []
lane: seed
files_owned:
  - apps/api/src/seed/demo/history.ts
  - apps/api/src/seed/demo/seed-tz-variant.test.ts
  - apps/api/src/seed/demo/seed-overlay-tz.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
Every seeded time in the demo history follows the persona's own timezone, so a trainee in Dubai or any other zone sees their logs and check-ins at sensible local times.

## Context
- Covers master-list (v13) items QS7. Everything the implementer needs from those rows is pasted here.
- `personaTimezone(email)` already exists (`apps/api/src/seed/demo/history.ts:679`, with the Deepak → Dubai rule tested in `seed-timestamps.test.ts:252-253`). The remaining literals bypass it.
- Close−30 min: v13 asked for a test that an item seeded 30 minutes before its window closes is still open in local time for a non-IST persona.

## Gap list
- `apps/api/src/seed/demo/history.ts:797`, `:964`, `:1007`, `:1014`, `:1023-1025`, `:1040-1050`, `:1060`, `:1078-1086`, `:1114`: `localDayStartIso(..., "Asia/Kolkata")` literals (16 in the file).
- `apps/api/src/seed/demo/generator/personas.ts` holds 19 `Asia/Kolkata` values as persona data; those are data, not literals to remove.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] `rg -n '"Asia/Kolkata"' apps/api/src/seed/demo/history.ts` returns only the default inside the timezone helper.
- [ ] With every persona's timezone set to `America/New_York` in the TZ-variant test, the seed's per-persona local times (meal logs, check-in windows, notes) are identical local clock times to the IST run.
- [ ] An item seeded at window close −30 min is open (not overdue) at the reference instant for an IST and a non-IST persona.
- [ ] Seed output for the default personas is byte-identical before and after (snapshot), except rows whose persona is not IST.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Other seed bugs (ZA8).
- Persona data changes.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/seed/demo/seed-tz-variant.test.ts`: the variant above.
- `apps/api/src/seed/demo/seed-overlay-tz.test.ts`: close−30 min for two zones.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W5.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
