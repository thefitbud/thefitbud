---
id: ZB5
title: Strength read model API: top set per exercise and workouts per week
batch: W6
depends_on: [ZB1, ZA11]
lane: strength
files_owned:
  - apps/api/src/routes/strength.ts
  - apps/api/src/routes/strength.test.ts
  - apps/api/src/routes/strength.authz.test.ts
  - apps/api/src/domain/strength-read-model.ts
  - packages/contracts/src/strength.ts
  - packages/api-client/src/strength-augment.ts
frames: []
model: sonnet
size: S
---

## Outcome
The trainer's Progress > Workouts view (frame 160e) can ask for each exercise's best set over time, workouts per week, and how many sets could not be charted.

## Context
- Covers master-list (v13) items B1b. Everything the implementer needs from those rows is pasted here.
- Endpoint: `GET /strength/relationships/:relationshipId?range=4w|12w|all&from&to`. Response: `exercises: [{ exerciseId, name, points: [{ localDate, topLoadKg, reps }] }]`, `workoutsPerWeek: [{ weekStart, count }]`, `notCharted: { sets: n }` (kind `text`).
- Top set = highest `actual_load_kg` that day, ties by reps. Bodyweight-plus counts its added kg. Pure counts and kg, no percentages.
- Auth: the relationship's trainer or the trainee; ended relationships readable.

## Gap list
- `apps/api/src/routes/progress.ts:92`, `:157`, `:202`, `:391`: progress routes cover measurements and photos, not sets.
- Stub mount from ZA11 at `/strength` returns `not_implemented`.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] The endpoint returns the shape above, validated by the contract schema.
- [ ] Range filters by the trainee's local date.
- [ ] An unrelated trainer gets 403; unauthenticated 401.
- [ ] One D1 batch, query count asserted (≤ 3 statements).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Web chart (W8 ZD progress lane).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `strength.test.ts`: fixtures with kg, bodyweight_plus and text sets; ranges.
- `strength.authz.test.ts`: trainer, other trainer, trainee, none.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W6.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
