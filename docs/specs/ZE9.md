---
id: ZE9
title: Steps: read daily totals from HealthKit and Health Connect and sync them
batch: W9
depends_on: [ZB9]
lane: steps
files_owned:
  - apps/mobile/package.json
  - apps/mobile/app.config.js
  - pnpm-lock.yaml
  - apps/mobile/src/trainee/steps/**
  - apps/mobile/src/lib/health/**
frames: []
model: opus
size: M
---

## Outcome
With permission, the app reads today's and recent days' step totals from Apple Health or Health Connect and saves them to the server, feeding the Steps chip.

## Context
- Covers master-list (v13) items T5a. Everything the implementer needs from those rows is pasted here.
- Needs the dev build (not Expo Go). Libraries (Q-W9-1): `@kingstinct/react-native-healthkit` (iOS) and `react-native-health-connect` + `expo-health-connect` plugin (Android), versions compatible with Expo SDK 52 (`apps/mobile/package.json`).
- Daily totals only (no samples stored); sync last 7 days on foreground and once per app start; `PUT /me/steps/days/:localDate` (ZB9).
- iOS `NSHealthShareUsageDescription` and Android Health Connect permissions declared in `app.config.js`; the Play Health Connect declaration is Firoz's step.
- Device check is Firoz's (manual list P2): run on the Android dev build.

## Gap list
- `apps/mobile/src/trainee/steps/StepsCard.tsx`: returns null ("Hidden until Health Connect / HealthKit is wired").
- No health library in `apps/mobile/package.json`.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] `useStepsSync()` requests permission once, reads 7 days, upserts, handles denial (chip shows "Set up steps").
- [ ] Unit tests mock both libraries; web build unaffected (platform guards).
- [ ] `app.config.js` declares the permissions; `eas build` is not run by the agent.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Setup screens (ZE10).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/lib/health/stepsSync.test.ts`: permission states, upsert batching, timezone day boundaries.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- No Expo SDK 52 compatible library version exists; report options.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W9.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
