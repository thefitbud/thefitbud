---
id: ZB9
title: Steps API: trainee daily upsert and read, trainer read, per-client target
batch: W6
depends_on: [ZB4, ZA11]
lane: steps
files_owned:
  - apps/api/src/routes/me-steps.ts
  - apps/api/src/routes/steps.ts
  - apps/api/src/routes/steps.test.ts
  - apps/api/src/routes/steps.authz.test.ts
  - packages/contracts/src/steps.ts
  - packages/api-client/src/steps-augment.ts
frames: []
model: sonnet
size: S
---

## Outcome
The trainee app can save each day's step total and show today's steps against the target; the trainer can read a client's daily steps and change the target.

## Context
- Covers master-list (v13) items B4b. Everything the implementer needs from those rows is pasted here.
- Trainee: `PUT /me/steps/days/:localDate` `{ steps, source }` (upsert, last write wins if `synced_at` is newer), `GET /me/steps/today` → `{ steps, target, localDate }`. Trainer: `GET /steps/relationships/:id?range=…`, `PUT /steps/relationships/:id/target` (1,000–50,000).
- Dates are the trainee's local date; reject dates more than 1 day in the future in the trainee's zone or older than 30 days.
- Ended: trainee writes rejected 409, trainer target edit rejected 409, reads work.

## Gap list
- `apps/api/src/routes/me-steps.ts:19-28` returns a disabled settings stub.
- `apps/api/src/routes/steps.ts` is the ZA11 stub.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Endpoints and rules above; contract schemas validated.
- [ ] `me-steps.ts` keeps its existing settings response shape for old builds and adds the new paths.
- [ ] Auth cases pass; query count ≤ 2 per call.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- HealthKit / Health Connect (W9 ZE13).
- UI (W9, W8).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `steps.test.ts`: upsert, today, ranges, bounds, ended 409.
- `steps.authz.test.ts`.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W6.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
