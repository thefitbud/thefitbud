---
id: ZE4
title: Today v3: meal and coach-note banners, check-in reviewed banner, reminders paused, next check-in
batch: W9
depends_on: [ZE3]
lane: today
files_owned:
  - apps/mobile/src/trainee/TodayTab.tsx
  - apps/mobile/src/trainee/today/**
  - apps/mobile/src/trainee/TodayTab.v3.test.tsx
  - apps/mobile/src/trainee/notifications/ForegroundBanner.tsx
  - apps/mobile/src/trainee/notifications/Surfaces.tsx
  - apps/mobile/src/trainee/pickTodayCheckin.ts
  - apps/mobile/src/trainee/pickTodayCheckin.test.ts
frames:
  - { frame: "29-trainee-inapp-meal-v3-ios.png", viewport: "393x852" }
  - { frame: "29b-trainee-inapp-note-v3-ios.png", viewport: "393x852" }
  - { frame: "113-notif-checkin-reviewed-banner-v3-ios.png", viewport: "393x852" }
  - { frame: "115-notif-paused-today-v3-ios.png", viewport: "393x852" }
  - { frame: "101-trainee-checkin-reviewed-ios.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
In-app banners sit correctly over v3 Today, the reviewed check-in and paused reminders show as designed, and after a review Today shows the next check-in on the weekly cadence.

## Context
- Covers master-list (v13) items T2a, T2b, F4c. Everything the implementer needs from those rows is pasted here.
- Capture on Expo web at 393x852 for iOS frames and 412x915 for Android frames; QA1's nightly Maestro run re-captures on the Android emulator after merge.
- F4c: after a check-in is reviewed, Today shows "Next check-in Wed 28 Oct" from the schedule, not the reviewed one.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/mobile/src/trainee/notifications/ForegroundBanner.tsx` (115 lines): banner layout predates v3.
- `apps/mobile/src/trainee/TodayTab.tsx:209`: `pickTodayCheckin` picks among today's items only; after review it does not return the next scheduled one.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Banners per 29/29b over v3; reviewed banner 113; paused card 115; next check-in per 101 after review.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Push notification content.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `pickTodayCheckin.test.ts`: next after review.
- `apps/mobile/src/trainee/TodayTab.v3.test.tsx`: banners.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZE4/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.
- Mobile: capture the Expo web render at the frame viewport; the UI bot re-captures on the Android emulator through the QA1 nightly run after merge.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W9.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
