---
id: ZE3
title: Today v3: past day with Back to today, skeleton, and offline with logs waiting
batch: W9
depends_on: [ZE2]
lane: today
files_owned:
  - apps/mobile/src/trainee/TodayTab.tsx
  - apps/mobile/src/trainee/today/**
  - apps/mobile/src/trainee/TodayTab.v3.test.tsx
frames:
  - { frame: "04-trainee-today-ios-v3-past.png", viewport: "393x852" }
  - { frame: "04-trainee-today-android-v3-past.png", viewport: "393x852" }
  - { frame: "96-trainee-today-loading-v3-ios.png", viewport: "393x852" }
  - { frame: "104-trainee-today-offline-v3-android.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
Looking at a past day shows a banner with Back to today, loading shows a skeleton shaped like v3, and offline Today says how many logs are waiting to send.

## Context
- Covers master-list (v13) items T1c, T1d. Everything the implementer needs from those rows is pasted here.
- Today v3 (frames 04-*): kcal ring + macro bars + Workout / Meals / Steps chips; no %, no "left". Steps stays a chip (Firoz, 30 Oct) with the target from the server (default 8,000, ZB4/ZB9) and today's steps from `GET /me/steps/today`; until native steps sync (ZE10) the chip shows "Set up steps". New v3 pieces go in `apps/mobile/src/trainee/today/*.tsx`.
- Capture on Expo web at 393x852 for iOS frames and 412x915 for Android frames; QA1's nightly Maestro run re-captures on the Android emulator after merge.
- Offline copy: "1 log waiting to send" / "n logs waiting to send" from the sync queue count.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/mobile/src/trainee/TodayTab.tsx:346-347`: offline hint is "Saved on phone · showing last sync" with no queue count.
- No v3 skeleton.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Past banner and Back to today; skeleton per 96; offline per 104 with the queue count.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Banners (ZE4).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/trainee/TodayTab.v3.test.tsx`: past, loading, offline with 1 and 3 queued.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZE3/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.
- Mobile: capture the Expo web render at the frame viewport; the UI bot re-captures on the Android emulator through the QA1 nightly run after merge.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W9.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
