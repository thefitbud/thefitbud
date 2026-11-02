---
id: ZD6
title: Coaching setup footer: Save draft, Activate with confirmation, Save as vN+1
batch: W8
depends_on: [ZD5, ZA5]
lane: setup
files_owned:
  - apps/trainer-web/src/pages/ConfigureCoachingPage.tsx
  - apps/trainer-web/src/pages/ConfigureCoachingPage.test.tsx
  - apps/trainer-web/src/pages/configure/**
  - apps/trainer-web/e2e/configure-activate.spec.ts
frames:
  - { frame: "148-trainer-web-configure-v3-web.png", viewport: "1440x900" }
  - { frame: "149-trainer-web-configure-active-v3-web.png", viewport: "1440x900" }
model: opus
size: S
---

## Outcome
A trainer activates a first setup through one confirmation that lists what will start, and edits a live setup as vN+1 that applies from tomorrow.

## Context
- Covers master-list (v13) items AC2, D12/D12b, D17. Everything the implementer needs from those rows is pasted here.
- Remove `markConfigured`, its button and every `configured` branch if any survived ZA4.
- First setup: Save draft (autosave stays) + Activate coaching, disabled until D17 sections are complete, hint "Draft · n sections left: …". Activate opens the DS3 dialog (start date, workouts, meals, check-ins, tracking, reminders, steps target, plan published or "nothing scheduled until a plan is published"); one call to the atomic activate (ZA5).
- Editing active: first edit opens vN+1; footer Discard + "Save as vN+1" with a changes-only dialog; "new targets apply from tomorrow". Update the TW-11 checklist text if it names the old flow.
- Planned frame (not in the repo yet, Firoz designs it): DS3 Activate and Save as vN+1 dialogs (web 1440x900, 2 frames). Until the PNG is in `docs/design/mockups/png/`, the parts that need it stop and report; the rest runs.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/trainer-web/src/pages/ConfigureCoachingPage.tsx:554` and `:1414`: `markConfigured` still on `main`.
- `apps/trainer-web/src/pages/ConfigureCoachingPage.tsx:600-658`: activate expects a configured version.
- `apps/trainer-web/src/pages/ConfigureCoachingPage.tsx:679`: old two-step copy.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Footer states and dialogs as above; activate is one call; failure keeps the draft.
- [ ] Plan-aware success copy.
- [ ] e2e `configure-activate.spec.ts` covers first activation and a vN+1 save.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Coaching mode (ZD7).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `ConfigureCoachingPage.test.tsx`; the new e2e spec.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZD6/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.

## Stop conditions
- DS3 frames are not in the repo.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W8.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
