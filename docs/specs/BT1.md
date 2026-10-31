---
id: BT1
title: EAS production build and store submission config, with the release runbook
batch: W4
depends_on: [BT3b, BT2b]
lane: release
files_owned:
  - apps/mobile/eas.json  # build.production and submit only
  - docs/runbooks/store-release.md
frames: []
model: opusplan
size: M
---

## Outcome
`eas build --profile production` and `eas submit` are configured for TestFlight and the Play closed track, and `docs/runbooks/store-release.md` walks Firoz through the consoles, the privacy answers and the submission.

## Context
- v14 BT1 (M). Agents prepare config and the checklist; Firoz runs `eas build`, `eas submit` and the consoles. D-W4-2: closed beta (TestFlight internal + external, Play closed testing). D-W4-3: production variant `com.thefitbud.mobile`.
- `apps/mobile/eas.json` is created by X6 (W1) and edited by X7 (W2); this task adds `build.production` details and `submit.production`.
- Store privacy URL: `https://app.thefitbud.com/privacy` (BT3). Steps/HealthKit don't ship in the beta: no HealthKit or Health Connect declarations. No in-app payments (D-B4).
- Build numbers: D-W4-8 (decided by Firoz, 1 Nov 2026): `appVersionSource: "remote"` with `autoIncrement` on production.

## Gap list
- `apps/mobile/eas.json` (X6): no `submit` section; production profile has no auto-increment or channel.
- No release runbook in `docs/runbooks/`.

## Acceptance criteria
- [ ] `eas.json` production: `autoIncrement` per D-W4-8, env `APP_VARIANT=production`, `EXPO_PUBLIC_API_URL=https://api.thefitbud.com`; `submit.production.ios` with `ascAppId` and `appleTeamId` placeholders read from env (no real IDs in the file); `submit.production.android` with `track: "internal"` then promote to closed testing, `serviceAccountKeyPath` pointing to a path outside the repo.
- [ ] `store-release.md`: App Store Connect record, TestFlight groups, beta review info, App Privacy answers (data types collected, linked to user, not used for tracking); Play Console record, closed testing track, testers list, Data safety form, content rating, target audience; privacy URL; `eas build` and `eas submit` commands; what to check before external review.
- [ ] The runbook lists secrets by name only (`EXPO_TOKEN` if run in CI, `SENTRY_AUTH_TOKEN`) and says where each lives.

## Out of scope
- Running builds or submissions. Store screenshots and marketing text (Firoz). Production deploy (I6b).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `pnpm --filter mobile exec eas config --profile production --platform ios` is not runnable here; add a JSON schema check in the PR description instead. Run the standard checks.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot.

## Stop conditions
- The config would need a real App Store Connect app id, team id or key file in the repo.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W4.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
