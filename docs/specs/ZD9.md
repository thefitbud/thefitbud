---
id: ZD9
title: Client Check-ins tab: summary, status chips with counts, ended and iPad
batch: W8
depends_on: []
lane: checkins
files_owned:
  - apps/trainer-web/src/pages/ClientCheckinsPage.tsx
  - apps/trainer-web/src/pages/ClientCheckinsPage.test.tsx
  - apps/trainer-web/src/pages/client-checkins.css
frames:
  - { frame: "162-trainer-web-client-checkins-v3-web.png", viewport: "1440x900" }
  - { frame: "162b-trainer-web-client-checkins-empty-v3-web.png", viewport: "1440x900" }
  - { frame: "162c-trainer-web-client-checkins-ended-v3-web.png", viewport: "1440x900" }
  - { frame: "192b-ipad-client-checkins-v3-ipad.png", viewport: "1024x768" }
model: sonnet
size: S
---

## Outcome
A client's Check-ins tab shows a summary and All / To review / Overdue / Reviewed / Missed chips with counts, offers a WhatsApp draft on overdue rows, and reads correctly when ended and on iPad.

## Context
- Covers master-list (v13) items W4a, W4b. Everything the implementer needs from those rows is pasted here.
- Overdue row: wa.me prefill only. Ended: no Overdue chip or rows.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/trainer-web/src/pages/ClientCheckinsPage.tsx:249`: a plain table, no chips or summary.
- `apps/trainer-web/src/pages/ClientCheckinsPage.tsx:166`: ended handled only by hiding the scheduler.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Chips with counts filter the list; summary per 162; empty per 162b; ended per 162c; iPad per 192b.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Check-in review page.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `ClientCheckinsPage.test.tsx`: chips, ended, overdue draft.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZD9/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W8.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
