---
id: ZG5
title: Invite detail and revoke
batch: W11
depends_on: [ZG4]
lane: web-roster
files_owned:
  - apps/trainer-web/src/pages/PendingInvitationPage.tsx
  - apps/trainer-web/src/components/invite/**
frames:
  - { frame: "144-trainer-web-invite-detail-web.png", viewport: "1440x900" }
  - { frame: "145-trainer-web-invite-revoke-web.png", viewport: "1440x900" }
model: sonnet
size: S
---

## Outcome
A pending invite shows its detail and can be revoked with a confirm.

## Context
- Covers master-list (v13) items G2. Everything the implementer needs from those rows is pasted here.
- Capture with Playwright at 1440x900 for web frames and the iPad sizes worked out from each iPad frame, signed in as the seeded trainer.
- First read the P1 audit for this bucket in `docs/qa/P1/` (ZA2, W5); fix only the differences it lists for these frames, and add any it missed to the PR description.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/trainer-web/src/pages/PendingInvitationPage.tsx` (306 lines): differs from the frames as listed in the P1 audit.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Each listed frame matches within the design-review threshold.
- [ ] No ISO dates, raw enums, % or streaks on screen.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Screens outside these frames.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- Add or extend a test beside `apps/trainer-web/src/pages/PendingInvitationPage.tsx` for each state shown.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZG5/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W11.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
