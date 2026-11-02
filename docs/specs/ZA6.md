---
id: ZA6
title: No raw enum labels: guard tests on web and mobile, and fix the remaining call sites
batch: W5
depends_on: [ZA5]
lane: activate
files_owned:
  - packages/core/src/labels.ts
  - packages/core/src/labels.test.ts
  - apps/trainer-web/src/lib/rawEnumGuard.test.tsx
  - apps/mobile/src/lib/rawEnumGuard.test.ts
  - apps/trainer-web/src/pages/**/*.tsx
  - apps/trainer-web/src/components/**/*.tsx
  - apps/mobile/src/trainer/**
  - apps/mobile/src/screens/**
  - apps/mobile/src/trainee/settings/**
frames: []
model: sonnet
size: S
---

## Outcome
No screen on trainer web or mobile shows a raw enum value such as `per_100g` or `client_logged_later`, and a test fails if one comes back.

## Context
- Covers master-list (v13) items B0L (28 raw enum labels: onboarding outcome, payment frequency, nutrition basis, activity type). Everything the implementer needs from those rows is pasted here.
- The four families Firoz listed already have namespaces in `packages/core/src/labels.ts`: `payment_frequency` (:317), `nutrition_basis` (:323), `workspace_activity_type` (:327), `onboarding_review_outcome` (:332). Most call sites use `labelFor`; the leftovers are places that print the value directly or pass it into a string.
- Approach: a guard test renders each listed page/screen with fixtures that hold every enum value, collects visible text, and fails on any token that equals a key in `LABELS` and contains `_` (or is a known single-word raw value). Fix each hit with `labelFor`.
- The "Effective since" ISO date is already fixed on `main` (`apps/trainer-web/src/pages/ClientOverviewPage.tsx:643-649`, `apps/trainer-web/src/pages/ClientPlanPage.tsx:635-637` use `formatCivilDate`), so it is dropped from B0L.

## Gap list
- `apps/trainer-web/src/pages/templates/LibrariesPanel.tsx:89`: a local `basisLabel()` maps nutrition basis outside `labelFor`; replace it with `labelFor('nutrition_basis')` so there is one source.
- `apps/trainer-web/src/pages/CheckinReviewPage.tsx:109` (stored review outcome) and `apps/trainer-web/src/pages/OnboardingReviewPage.tsx` outcome lines: confirm both use `labelFor`.
- `apps/mobile/src/trainer/reviewSheetNav.ts:154-156`: outcome phrases drop unknown values; confirm every contract outcome has a phrase so none is silently hidden.
- QA counted 28 raw labels before some fixes; the guard is the source of truth for what is left.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] `rawEnumGuard.test.tsx` (web) renders Overview, Plan, Activity, Check-ins, Check-in review, Onboarding review, Configure, Libraries and Templates with all enum values and finds no raw value.
- [ ] `rawEnumGuard.test.ts` (mobile) does the same for trainer Attention, Clients, Client status, Check-in review, Review sheet and trainee settings screens.
- [ ] Every namespace in `LABELS` has a label for every value of its contract enum (`labels.test.ts` compares against the zod enums in `@fitbud/contracts`).
- [ ] The PR lists every call site fixed (expected about 28 at the last QA, fewer now).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Trainee Today and Diet (ZA3 owns those files).
- Copy changes beyond replacing a raw value with its label.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- The two guard tests above.
- `packages/core/src/labels.test.ts`: coverage against contract enums.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A raw value is rendered from a file outside `files_owned` (e.g. `apps/mobile/src/trainee/DietTab.tsx`); list it for ZA3 or W9.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W5.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
