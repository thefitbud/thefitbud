---
id: ZF1
title: Needs you cards: client names, "since" from the oldest open item, Mark answered with a 5 s Undo
batch: W10
depends_on: []
lane: needsyou
files_owned:
  - apps/mobile/src/trainer/AttentionTab.tsx
  - apps/mobile/src/trainer/attentionCards.ts
  - apps/mobile/src/trainer/attentionCards.test.ts
frames:
  - { frame: "05-trainer-mobile-needs-you-v3-ios.png", viewport: "393x852" }
  - { frame: "05-trainer-mobile-needs-you-v3-reviewed-toast-ios.png", viewport: "393x852" }
  - { frame: "05-trainer-mobile-needs-you-v3-swipe-ios.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
Each Needs you card names the client, shows "since" as the age of the oldest open item (same rule as web), and Mark answered can be undone for 5 seconds.

## Context
- Covers master-list (v13) items F1h. Everything the implementer needs from those rows is pasted here.
- Capture on Expo web at 393x852 (iOS frames) or 412x915 (Android frames) signed in as the seeded trainer; QA1's nightly Maestro run re-captures on the Android emulator after merge.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/mobile/src/trainer/AttentionTab.tsx:643`: Mark answered commits at once, no Undo.
- `apps/mobile/src/trainer/attentionCards.ts`: "since" uses the newest item.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Names on Asked and Check-ins cards; since = oldest; Undo toast per reviewed-toast frame; swipe per swipe frame.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Empty/offline/error (ZF2).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `attentionCards.test.ts`: since rule, undo window.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZF1/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.
- Mobile: capture the Expo web render at the frame viewport; the UI bot re-captures on the Android emulator through the QA1 nightly run after merge.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W10.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
