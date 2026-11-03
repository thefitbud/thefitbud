---
id: ZH7
title: Trainer web Sessions: week calendar (6 am–9 pm, calls dashed)
batch: W12
depends_on: [ZH2]
lane: web
files_owned:
  - apps/trainer-web/src/App.tsx
  - apps/trainer-web/src/layout/AppShell.tsx
  - apps/trainer-web/src/pages/sessions/SessionsPage.tsx
  - apps/trainer-web/src/pages/sessions/calendar/**
  - apps/trainer-web/src/pages/sessions/SessionsPage.test.tsx
frames:
  - { frame: "200-trainer-web-calendar-v3-web.png", viewport: "1440x900" }
model: sonnet
size: M
---

## Outcome
A trainer opens Sessions on web or iPad and sees their week: in-person sessions and check-in calls, with add, edit and cancel.

## Context
- Covers master-list (v13) items S3a. Everything the implementer needs from those rows is pasted here.
- Capture on the trainer web dev server at the frame viewport signed in as the seeded trainer (Playwright, QA1).
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.
- D-W12-8 in `docs/specs/batches/W12.md`: Sessions is its own nav item; the week runs Monday–Sunday, 6 am–9 pm; calls are drawn dashed teal; sessions solid.
- Data: ZH2's `GET /sessions?from&to`; create and edit use a side form with kind, date, start, duration, clients (one for a call), location or meeting link, note.
- iPad uses the same page at 1024x768 (layout per frame 200 scaled; no separate iPad frame).

## Gap list
- No Sessions route in `apps/trainer-web/src/App.tsx`; no nav item in `apps/trainer-web/src/layout/AppShell.tsx`.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Route `/sessions` with the week view per frame 200, previous/next week and Today.
- [ ] Add, edit and cancel work and refresh the week; meeting links open in a new tab.
- [ ] Ended clients are not offered in the client picker.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Online-only view (ZH8).
- Schedule-a-call prompts (ZH9).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `SessionsPage.test.tsx`: week range, dashed calls, add/edit/cancel.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZH7/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W12.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
