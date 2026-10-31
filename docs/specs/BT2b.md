---
id: BT2b
title: Mobile crash reporting with Sentry
batch: W4
depends_on: [X6]
lane: mobile-crash
files_owned:
  - apps/mobile/package.json
  - apps/mobile/app.config.js  # Sentry plugin entry only
  - apps/mobile/src/lib/sentry.ts
  - apps/mobile/src/lib/sentry.test.ts
  - apps/mobile/App.tsx  # init and wrap only
  - pnpm-lock.yaml  # shared with BT2 under the W4.md lockfile rule
frames: []
model: sonnet
size: S
---

## Outcome
Staging and production app builds report JS crashes and native crashes to Sentry with release and environment tags; dev builds and Expo web don't.

## Context
- v14 BT2 (mobile half, split, new ID BT2b). `@sentry/react-native` at the version Expo SDK 52 documents, with its config plugin.
- DSN comes from `EXPO_PUBLIC_SENTRY_DSN` per EAS profile (the mobile DSN is public by design). Source maps: `SENTRY_AUTH_TOKEN` as an EAS secret (Firoz, manual); **D-W4-7 (Open)**, recommendation: upload source maps for production builds only.
- Same scrubbing rules as BT2: no names, emails, notes, health values, tokens.

## Gap list
- `apps/mobile/App.tsx:13`: no Sentry init or `Sentry.wrap`.
- `apps/mobile/package.json`: no `@sentry/react-native`.

## Acceptance criteria
- [ ] Sentry inits only when `APP_VARIANT` is `staging` or `production` and a DSN is set.
- [ ] `beforeSend` and `beforeBreadcrumb` drop HTTP bodies, `Authorization`, emails, names, notes, and any health fields; `sendDefaultPii: false`.
- [ ] `release` and `dist` come from the app version and build number; `environment` from `APP_VARIANT`.
- [ ] The config plugin is added after the existing plugins; `npx expo config --type prebuild` succeeds.

## Out of scope
- Worker (BT2). Performance tracing (D-W4-6). Session replay.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/lib/sentry.test.ts` (new): scrubber cases; disabled in development and web.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI. Firoz triggers a test crash on a staging build (BT5 step 7).

## Stop conditions
- The task needs an `eas build` or the auth token; write config only and stop.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W4.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
