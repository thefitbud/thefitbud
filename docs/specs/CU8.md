---
id: CU8
title: Web sign-in legal footer offset stays right at any root font size
batch: W3b
depends_on: [CU4]
lane: web
files_owned:
  - apps/trainer-web/src/auth/AuthLayout.tsx
  - apps/trainer-web/src/styles.css  # .auth-formside only
  - apps/trainer-web/e2e/bt3f-signin-footer.spec.ts  # extend
frames:
  - { frame: "ds5-web-signin-footer.png", viewport: "1440x900" }
model: sonnet
size: S
---

## Outcome
The legal links on web sign-in stay where the DS5 frame puts them for users with a larger browser font size, not only at the 16px default.

## Context
- Source: the W3 report's "Follow-ups raised on 3 Nov" (`docs/specs/batches/W3.md`, 3 Nov continuation) and QA1's "Follow-ups raised" (`docs/specs/batches/QA1.md`); W3b is approved by Firoz, 3 Nov 2026 (`docs/specs/batches/W3b.md`).
- BT3f (#171, D-W3-15): the footer uses `marginBottom: "-55px"` to cancel `.auth-formside`'s `4.5rem` bottom padding; at a 16px root they differ by 17px, at 24px by 53px.
- Fix in rem on `.auth-formside` (or one shared custom property), or assert the nav's distance from the document bottom; either way the two values must derive from one source.

## Gap list
- `apps/trainer-web/src/auth/AuthLayout.tsx:91`: px offset against `apps/trainer-web/src/styles.css:1657` rem padding.
- Written against `main` at dadaa13. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] At the default root size the legal row is on the same pixel rows as `ds5-web-signin-footer.png` (as after BT3f).
- [ ] At 20px and 24px root sizes the nav's distance from the bottom scales with the root (no fixed px drift).
- [ ] `bt3f-signin-footer.spec.ts` checks both.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Layout or copy changes elsewhere on sign-in. Mobile.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/trainer-web/e2e/bt3f-signin-footer.spec.ts`: add cases that set the root font size to 16/20/24px and asserts the nav's bottom offset equals the padding-derived value.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Capture at 1440x900 against `ds5-web-signin-footer.png` into `docs/qa/CU8/`.

## Stop conditions
- The fix moves the footer off the frame at the default size.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
