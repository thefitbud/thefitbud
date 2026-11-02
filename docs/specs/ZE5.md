---
id: ZE5
title: Diet: Eaten as planned and Something different buttons back; offline adds planned kcal and reconciles
batch: W9
depends_on: []
lane: diet
files_owned:
  - apps/mobile/src/trainee/DietTab.tsx
  - apps/mobile/src/trainee/mealActions.ts
  - apps/mobile/src/trainee/mealActions.test.ts
frames:
  - { frame: "07-trainee-diet-ios.png", viewport: "393x852" }
  - { frame: "86-trainee-diet-offline-ios.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
Each meal again offers Eaten as planned and Something different, and logging offline adds the planned kcal at once and corrects it after sync.

## Context
- Covers master-list (v13) items F4d. Everything the implementer needs from those rows is pasted here.
- Capture on Expo web at 393x852 for iOS frames and 412x915 for Android frames; QA1's nightly Maestro run re-captures on the Android emulator after merge.
- ZA3 (W5) unified the kcal source; keep using `dayKcalSummary`.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/mobile/src/trainee/DietTab.tsx:508-567`: buttons render only in some states ("Eaten as planned" saved text vs button).
- `apps/mobile/src/trainee/mealActions.ts`: no optimistic kcal for offline logs.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Both buttons on every unlogged meal per 07; offline per 86 adds planned kcal immediately; after sync the ring equals server totals.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Food search.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `mealActions.test.ts`: optimistic add and reconcile.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZE5/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.
- Mobile: capture the Expo web render at the frame viewport; the UI bot re-captures on the Android emulator through the QA1 nightly run after merge.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W9.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
