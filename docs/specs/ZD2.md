---
id: ZD2
title: Client settings overview and Edit basic details drawer
batch: W8
depends_on: [ZD1, ZB8]
lane: settings
files_owned:
  - apps/trainer-web/src/pages/client-settings/**
frames:
  - { frame: "209-trainer-web-client-settings-v3-web.png", viewport: "1440x900" }
  - { frame: "209b-ipad-client-settings-v3-ipad.png", viewport: "1024x768" }
  - { frame: "210-trainer-web-client-basic-edit-v3-web.png", viewport: "1440x900" }
model: sonnet
size: S
---

## Outcome
The trainer sees one page with a client's basic details, subscription, payments and relationship, and can edit the basic details in a drawer.

## Context
- Covers master-list (v13) items W1c, W1d. Everything the implementer needs from those rows is pasted here.
- Tracking only (resolved 30 Oct): amount ₹, subscription type, coaching mode, start and due dates, Paid/Unpaid, method Cash/UPI/Bank. Never build collect, pay, invoice, gateway or session-count parts that appear in the frames.
- API: ZB8 (`/client-settings/...`) via the `client-settings` client augment. Phone is shown as stored; never logged.
- CSS in `pages/client-settings/client-settings.css`, imported by the page.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- No client settings page exists; subscription is edited inside Coaching setup (`apps/trainer-web/src/pages/ConfigureCoachingPage.tsx:166-219`).
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Overview shows the four sections per 209 (and 209b at 1024), dates like "Wed 21 Oct", amounts like "₹4,000", enums through `labelFor`.
- [ ] Edit basic details drawer (210) validates and saves; focus trapped; Escape closes.
- [ ] No session or package counts anywhere.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Subscription edit and payments (ZD3, ZD4).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/trainer-web/src/pages/client-settings/ClientSettingsPage.test.tsx`: sections, drawer save and validation.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZD2/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W8.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
