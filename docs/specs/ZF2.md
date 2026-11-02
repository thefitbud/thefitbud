---
id: ZF2
title: Needs you: all clear, offline cached, and couldn't load with Retry
batch: W10
depends_on: [ZF1]
lane: needsyou
files_owned:
  - apps/mobile/src/trainer/AttentionTab.tsx
  - apps/mobile/src/trainer/attention/**
frames:
  - { frame: "43-trainer-mobile-attention-empty-ios.png", viewport: "393x852" }
  - { frame: "44-trainer-mobile-attention-offline-ios.png", viewport: "393x852" }
  - { frame: "45-trainer-mobile-attention-error-ios.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
Needs you shows an all-clear state, a cached list with an offline line, and an error with Retry.

## Context
- Covers master-list (v13) items F1j, F1k. Everything the implementer needs from those rows is pasted here.
- Capture on Expo web at 393x852 (iOS frames) or 412x915 (Android frames) signed in as the seeded trainer; QA1's nightly Maestro run re-captures on the Android emulator after merge.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/mobile/src/trainer/AttentionTab.tsx:509`: error is a generic `ErrorBanner` with "Pull to try again", no Retry button.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Three states per frames; Retry refetches.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Cards (ZF1).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/trainer/attention/states.test.tsx`.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZF2/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.
- Mobile: capture the Expo web render at the frame viewport; the UI bot re-captures on the Android emulator through the QA1 nightly run after merge.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W10.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
