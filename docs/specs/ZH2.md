---
id: ZH2
title: Sessions and check-in calls API: create, list by range, edit, cancel
batch: W12
depends_on: [ZH1]
lane: api
files_owned:
  - apps/api/src/routes/sessions.ts
  - apps/api/src/routes/sessions.test.ts
  - apps/api/src/routes/sessions.authz.test.ts
  - apps/api/src/domain/sessions.ts
  - apps/api/src/domain/sessions.test.ts
  - packages/contracts/src/sessions.ts
  - packages/api-client/src/sessions-augment.ts
  - apps/api/src/index.ts
  - packages/contracts/src/index.ts
  - packages/api-client/src/index.ts
frames: []
model: opus
size: M
---

## Outcome
A trainer can create, list, edit and cancel in-person sessions and check-in calls for their clients, with an optional external meeting link on calls.

## Context
- Covers master-list (v13) items S1b. Everything the implementer needs from those rows is pasted here.
- D-W12-4 (external meeting links only, no in-app calling) and D-W12-5 (online-only coaches) in `docs/specs/batches/W12.md`.
- Endpoints: `GET /sessions?from&to` (trainer's entries in a range, clients attached, attendance summary), `POST /sessions` (`kind`, times, client ids, location or `meetingUrl`, note), `PATCH /sessions/:id`, `POST /sessions/:id/cancel`. Trainee: `GET /me/sessions?from&to` (their own entries, read-only).
- Online-only coaches (coaching mode on the subscription, W6 ZB3/ZB8): `kind = session` is rejected with `422 online_only_calls_only`.
- Ended relationships are read-only: no new entries for ended clients; existing entries stay readable.
- `meetingUrl` must be `https://`; it is shown as a link, never opened in-app.
- This task adds the `sessions` module to the three shared index files once (mounted at `/sessions` and `/me/sessions`); later W12 API tasks are in the same lane, so they may touch them too.

## Gap list
- No `/sessions` routes; `apps/api/src/index.ts` mounts none.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] CRUD and range listing as above, with contract, client method, route test and authz test (trainer only on own clients; trainee read-only on own).
- [ ] Online-only coach cannot create a session; ended client cannot be added.
- [ ] Times round-trip in UTC; `local_date` uses the trainer's timezone.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Attendance (ZH3), reminders (ZH4).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `sessions.test.ts`, `sessions.authz.test.ts`, `domain/sessions.test.ts`.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W12.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
