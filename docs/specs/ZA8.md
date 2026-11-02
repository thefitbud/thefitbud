---
id: ZA8
title: Demo seed: timestamp invariants for relationships, check-ins, measurements, plans and subscriptions
batch: W5
depends_on: [ZA7]
lane: seed
files_owned:
  - apps/api/src/seed/demo/history.ts
  - apps/api/src/seed/demo/build.ts
  - apps/api/src/seed/demo/generator/activity.ts
  - apps/api/src/seed/demo/seed-timestamps.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
Seeded history is internally consistent: nothing is logged before a relationship starts, no record is updated before it is submitted or created, and plans and subscriptions are created before they take effect.

## Context
- Covers master-list (v13) items A2, C3, C6, R1, X5, X7 (seed: subscription_versions). Everything the implementer needs from those rows is pasted here.
- `seed-timestamps.test.ts` (QS5/QS6) already asserts created ≤ updated (:152), overdue detection after close (:170), Kavya's ended exception closed at the end (:115) and accounts before first fact (:220). ZA8 adds the missing invariants and fixes what they catch.
- v13's seed X7 is a different task from the W2 mobile link task X7 on `main`; the ZA prefix avoids the clash.

## Gap list
- A2: `apps/api/src/seed/demo/history.ts:129` writes relationships; workout/meal activity on the start day can be earlier than `started_at`.
- C3: `apps/api/src/seed/demo/history.ts:406` and `:964-1029` write check-ins with `updated_at = now` but some `submitted_at` later than `updated_at`.
- C6: `apps/api/src/seed/demo/history.ts:1040-1050` Rohan's waist measurements are observed before the check-in window that links them.
- R1: `apps/api/src/seed/demo/history.ts:1307` back-dates `started_at` and `created_at` together, but rows that skip the `continue` at `:1305` keep `created_at` from the builder; check both paths.
- X5: `apps/api/src/seed/demo/history.ts:247-248` `published_at` of v1 is `startedAt` while `created_at` can be later after `:1318`.
- X7: `apps/api/src/seed/demo/history.ts:249` subscription `created_at = startedAt`, 30 min before the relationship row's `created_at`.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] New `seed-timestamps.test.ts` cases, each failing on `main` and passing after: activity ≥ relationship `started_at`; check-in `submitted_at` ≤ `updated_at`; measurement linked to a check-in observed inside that check-in's window; relationship `created_at` ≤ `started_at`; plan version `created_at` ≤ `published_at` ≤ `effective_from`; subscription `created_at` ≥ relationship `created_at`.
- [ ] `demo-seed.test.ts` still passes (counts, FKs, determinism within its 30 s limit at `:712`).
- [ ] A new invariant that already passes on `main` is kept as a guard and marked so in the PR; only failing ones need a fix.
- [ ] No persona-visible story changes (same meals, check-ins and exceptions per persona).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Timezone literals (ZA7).
- Library data (ZA9).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/seed/demo/seed-timestamps.test.ts`: the six invariants above, each named after its v13 ID.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W5.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
