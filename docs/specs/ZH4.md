---
id: ZH4
title: Session and call reminders: push 45 min before sessions and 15 min before calls
batch: W12
depends_on: [ZH3]
lane: api
files_owned:
  - apps/api/src/jobs/session-reminders.ts
  - apps/api/src/jobs/session-reminders.test.ts
  - apps/api/src/domain/session-reminder-copy.ts
  - apps/api/src/index.ts
frames: []
model: sonnet
size: S
---

## Outcome
The trainer gets a push 45 minutes before an in-person session and 15 minutes before a check-in call, which opens that entry (frame 205).

## Context
- Covers master-list (v13) items S1d. Everything the implementer needs from those rows is pasted here.
- D-W12-6 in `docs/specs/batches/W12.md`: trainer only (frame 205 is the trainer's reminder); trainee reminders are not in this batch.
- Use the existing cron (`*/5 * * * *` in `apps/api/wrangler.toml`) and `scheduled_jobs` with a dedupe key `session-reminder:<entryId>:<startsAt>` so an edit re-schedules and a cancel stops it; at most once per entry and start time, like `domain/reminders.at-most-once.test.ts`.
- Delivery goes through the existing Expo push path (`jobs/reminders.ts`, `domain/inbox-notify.ts`); respects the trainer's notification settings; no WhatsApp send.
- Copy (in `session-reminder-copy.ts`, shared with ZH19's mobile rendering): session "{title} at {time} · {n} clients"; call "Call with {firstName} at {time}"; deep link `fitbud://trainer/sessions/{entryId}`.
- Hook the job into the `scheduled()` handler in `apps/api/src/index.ts` (one call).

## Gap list
- No session reminder job.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Reminder due times: session −45 min, call −15 min; edit moves it; cancel removes it; never sent twice.
- [ ] Push payload carries the deep link and no personal data beyond the first name.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Mobile notification rendering and routing (ZH19).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `session-reminders.test.ts`: timing, edit, cancel, at-most-once, settings off.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W12.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
