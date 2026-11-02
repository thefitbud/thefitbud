---
id: ZA3
title: Trainee Today and Diet: civil dates and Diet kcal that add up to the meals
batch: W5
depends_on: []
lane: mobile-polish
files_owned:
  - apps/mobile/src/trainee/DietTab.tsx
  - apps/mobile/src/trainee/TodayTab.tsx
  - apps/mobile/src/trainee/nutrition.ts
  - apps/mobile/src/trainee/nutrition.test.ts
  - apps/mobile/src/trainee/b0l-dates.test.ts
frames:
  - { frame: "04-trainee-today-ios-v3-partial.png", viewport: "393x852" }
  - { frame: "07-trainee-diet-ios.png", viewport: "393x852" }
  - { frame: "86-trainee-diet-offline-ios.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
A trainee never sees an ISO date on Today or Diet, and the kcal on the Diet day summary equals the sum of the kcal shown on the meal rows.

## Context
- Covers master-list (v13) items B0L (mobile parts: ISO dates on Today/Diet, Diet kcal vs meals). Everything the implementer needs from those rows is pasted here.
- Product rule: dates like "Wed 21 Oct", never ISO. The helpers exist: `formatCivilDate` (`packages/core`), `weekdayShort` and `dayOfMonth` (already used at `apps/mobile/src/trainee/DietTab.tsx:323-324`).
- The kcal mismatch: each meal row shows `mealKcalFromDayTotals(meal, dayTotals.totals.perMeal)`, falling back to the prescription kcal for meals not logged, while the day summary ring shows `kcalRing.logged` from the nutrition ring totals. When a meal is logged as "something different" or partially, the row and the ring use different sources, so they disagree.
- Rule chosen (D-W5-6): the row shows logged kcal when the meal is logged and the planned kcal (muted, "planned") when it is not; the ring's logged number is the sum of logged rows only. Both come from one helper in `nutrition.ts`.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/mobile/src/trainee/DietTab.tsx:397-402`: row kcal falls back to `nutrientsFromMealPrescription(meal).kcal` for logged meals with no per-meal total, so a logged row can show planned kcal.
- `apps/mobile/src/trainee/DietTab.tsx:716-723`: the summary uses `kcalRing.logged` from a separate source, not the rows.
- `apps/mobile/src/trainee/DietTab.tsx:726` and `apps/mobile/src/trainee/TodayTab.tsx:608`: meal count lines; re-check every date string rendered on both tabs (offline hint `apps/mobile/src/trainee/TodayTab.tsx:346-347`, past-day header, check-in line) for `localDate` text.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] A shared helper `dayKcalSummary(assignments, dayTotals)` in `nutrition.ts` returns `{ rows: [{ id, kcal, kind: 'logged'|'planned' }], loggedTotal, plannedTotal }`; DietTab rows and ring both use it.
- [ ] On the demo seed for Rohan and Aarav, the Diet summary logged kcal equals the sum of the logged rows (unit test with the seed fixture).
- [ ] No string matching `\d{4}-\d{2}-\d{2}` is rendered by TodayTab or DietTab in any state (empty, partial, done, past, offline).
- [ ] Offline Diet (frame 86) shows the same numbers as online for cached data.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Today v3 layout (W9 ZE1–ZE3).
- Diet log buttons (W9 ZE4).
- Trainer-side kcal.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/trainee/nutrition.test.ts`: `dayKcalSummary` for logged, partial, something-different and unlogged meals.
- `apps/mobile/src/trainee/b0l-dates.test.ts`: renders TodayTab and DietTab with fixtures for each state and asserts no ISO date text.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZA3/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.
- Mobile: capture the Expo web render at the frame viewport; the UI bot re-captures on the Android emulator through the QA1 nightly run after merge.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W5.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
