---
id: ZD1
title: Client ⋯ menu: Client settings first, then the actions in the frame
batch: W8
depends_on: []
lane: settings
files_owned:
  - apps/trainer-web/src/components/*/[W]orkspaceHeader.tsx
  - apps/trainer-web/src/components/*/[W]orkspaceHeader.test.tsx
  - apps/trainer-web/src/App.tsx
  - apps/trainer-web/src/pages/client-settings/ClientSettingsPage.tsx
frames:
  - { frame: "208-trainer-web-client-menu-v3-web.png", viewport: "1440x900" }
  - { frame: "208b-ipad-client-menu-v3-ipad.png", viewport: "1024x768" }
model: sonnet
size: S
---

## Outcome
The client header menu opens Client settings first and lists the other actions in the order drawn, and the Client settings route exists.

## Context
- Covers master-list (v13) items W1b. Everything the implementer needs from those rows is pasted here.
- The header lives in the client-workspace components folder (the `[W]` in the globs matches one file). Menu keyboard and placement fixes landed in W7 ZC14.
- Route: `/clients/:relationshipId/settings` inside the client workspace routes in `App.tsx`; ZD1 adds a placeholder `ClientSettingsPage` that ZD2 fills.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `WorkspaceHeader.tsx:212` (client-workspace components folder): menu items are reminders, end coaching, etc.; no Client settings.
- `apps/trainer-web/src/App.tsx:76-88`: no `settings` child route under `/clients/:relationshipId`.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Menu order and labels match 208; iPad 208b.
- [ ] Client settings item navigates to the new route; ended clients still see it (read-only page, ZD3).
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Page content (ZD2–ZD4).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `WorkspaceHeader.test.tsx`: order and navigation.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZD1/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W8.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
