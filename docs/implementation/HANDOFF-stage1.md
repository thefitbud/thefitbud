# Stage 1 (Foundation) — handoff

Branch: `cursor/stage1-foundation-a3da` → merge into `feat/update-ui`.

## 1. Changes by task

| Task | Status | Notes |
|------|--------|-------|
| T00 | ✅ | Inputs verified (sha256 in PLAN §0). |
| T01 | ✅ | Lint + notifications date fix. |
| T02 | ✅ | Fixed 0014/0017/0019 + `0021_library_v2.sql`, journal through 0026. |
| T03 | ✅ | Shared `memory-db.ts` + D1 shim; Node ≥22.23 (`.nvmrc`). |
| T04 | ✅ | `migration-chain.test.ts`. |
| T05 | ✅ | Library schema merged into `schema.ts`. |
| T06 | ✅ | `apps/api/seed/library/` committed. |
| T07 | ✅ | `library-seed.ts`, wipe/post-wipe SQL; legacy `seed-dev.ts` removed. |
| T08 | ✅ | FTS food search + Hindi aliases (`libraries.test.ts`), redirects, trainee `me-foods`. **Low-confidence redirects** listed below (PO sign-off). |
| T09 | ✅ | `GET /config`, flags, dev mail sink. |
| T10 | ✅ | Password/OTP/rate-limit/lockout/breached-password/`AUTH_NOT_CONFIGURED` — `auth-login.test.ts`. D1-safe `bumpRateLimit` (no delete+insert). |
| T11 | ✅ | Trainer profile + `/me`. |
| T12 | ✅ | Invite accept OTP/expired/revoked — `invitations-accept.test.ts`. |
| T13 | ✅ | `requireWritableRelationship` on writes incl. onboarding draft/submit (`onboarding-writable.test.ts`, `sync-writable.test.ts`). |
| T14 | ✅ | Note `visibility`, PATCH, P-NOTE inbox (`trainer_note_shared`). |
| T15 | ✅ | Batched generation + assign/diff. |
| T16 | ✅ | `canLog` table in `packages/core/src/late-logging.test.ts`; late/deviation behaviour in `meals.test.ts` / exceptions. Sync push defers to same domain handlers (no separate parity file). |
| T17 | ✅ | Attention groups + week read model ≤10 queries — `read-models.test.ts`. |
| T18 | ✅ | Coach asks merge/answer — `coach-asks.test.ts` + gate6/cron coverage elsewhere. |
| T19 | ✅ | v2 engine: workout nudge **+75 min after** preferred (fallback 18:00), clamped before 22:00; meal +40 min + snooze; EOD `min(lastMeal+60, 21:30)`; tests incl. Dubai TZ + ignorer day-5 pause (`reminder-backoff.ts`). |
| T20 | ✅ | `PUT /me/meal-times` → `trainer_meal_times_changed` (15 min merge), assignment `localTime` recompute (`meal-times-update.ts`); `me-meal-times.test.ts`. |
| T21 | ✅ | All link kinds covered in `links.test.ts` (client/ask/exception/reactivate/plan/today/note + meal/workout/checkin not_found). |
| T22 | ✅ | `whatsapp-cloud.test.ts`, `whatsapp-templates.lint.test.ts`, budget/webhook routes (no live Meta). |
| T23 | ✅ | Template `scope` filters — `templates.test.ts` + `src/templates.test.ts`. |
| T24 | ✅ | Demo SQL + `demo-seed.test.ts`. |
| T25 | ✅ | `pnpm db:reset` runs `ensure-dev-vars` then migrate/seed. |
| T26 | ✅ | Contracts/core; `@fitbud/api-client` Stage 1 via `stage1-augment.ts`. |
| T27 | ✅ | `@fitbud/tokens`. |
| T28 | ✅ | `@fitbud/brand`. |
| T29 | ✅ | ConfigProvider + mobile helpers. |
| T30 | ✅ | INSERT-first idempotency (`idempotency.test.ts`); `MEDIA_SIGNING_SECRET` local guard; auth IP rate limits (`auth-login.test.ts`). |
| T31 | ✅ | See §7 (incl. real `wrangler dev` login curls). |
| T32 | ✅ | This document. |
| T33 | ✅ | Draft PR. |

### Library redirects awaiting PO sign-off (T08 / T07)

Archived legacy foods in `07_post_wipe_dev.sql` with `reason='dev_wipe_low_confidence'`: Dal Tadka, Dal Fry, Paneer Bhurji, Oats (savory), Vegetable Sabzi, Tofu Stir-fry → targets documented in STAGE1-TASKS T07 table. Phulka → chapati unchanged.

## 2. Key endpoints (new/changed)

See PLAN §3.4 and OpenAPI `GET /docs` when API is running.

## 3. Flags (defaults)

| Flag | Default | Override |
|------|---------|----------|
| `wa_otp` | false | `FLAG_WA_OTP` / `feature_flags` |
| `wa_automation` | false | `FLAG_WA_AUTOMATION` |
| `steps_enabled` | false | `FLAG_STEPS_ENABLED` |

## 4. Env (examples only)

Copy `apps/api/.dev.vars.example` → `apps/api/.dev.vars` (gitignored). **`pnpm db:reset`** and **`pnpm setup:local`** create `.dev.vars` from the example when missing.

Use `ENVIRONMENT=local`, `EMAIL_PROVIDER=dev_sink`, `AUTH_MODE=test` for local password login.

Wrong config: `POST /auth/login` returns **503 `AUTH_NOT_CONFIGURED`** (not 500) when `AUTH_MODE=test` without `ENVIRONMENT=local`. Unexpected errors in local dev return **500 `LOCAL_DEV_ERROR`** with `err.message` for debugging.

## 5. Commands

```bash
export PATH="/home/ubuntu/.nvm/versions/node/v22.23.3/bin:$PATH"
pnpm install
pnpm setup:local    # optional; db:reset also ensures .dev.vars
pnpm db:reset
pnpm api               # http://127.0.0.1:8787 — restart after db:reset if already running
apps/api/scripts/verify-local-login.sh
pnpm typecheck && pnpm lint && pnpm test
```

## 6. Demo accounts

Password (dev only): **`FitBud-demo-2026`**

| Email | Role | State / flow |
|-------|------|----------------|
| rahul.coach@demo.fitbud.test | trainer | Main coach, Asia/Kolkata, clients #3–#13 |
| priya.coach@demo.fitbud.test | trainer | Second coach; #14–#15 |
| anita.invite@demo.fitbud.test | invite | Pending invite — token: `fitbud-demo-anita-invite-pending` |
| vikram.onboarding@demo.fitbud.test | trainee | Onboarding incomplete |
| sneha.review@demo.fitbud.test | trainee | Awaiting review |
| aarav.ontrack@demo.fitbud.test | trainee | On track, 4-week history, plan v2 |
| rohan.slipping@demo.fitbud.test | trainee | All Needs Attention types, renewal overdue |
| meera.ack@demo.fitbud.test | trainee | Ack + late log, locked resolved item |
| farhan.paused@demo.fitbud.test | trainee | Reminders paused (responsiveness label) |
| ishita.pushoff@demo.fitbud.test | trainee | Notifications off, merged coach ask |
| kavya.ended@demo.fitbud.test | trainee | Ended, reactivatable |
| nikhil.reactivate@demo.fitbud.test | trainee | Pending reactivation |
| deepak.dubai@demo.fitbud.test | trainee | Asia/Dubai + custom meal times |
| lakshmi.foods@demo.fitbud.test | trainee | `logged_foods` deviations (Priya) |
| karan.dual@demo.fitbud.test | dual | Trainee under Priya; trainer with 0 clients |

## 7. T31 run results (2026-10-17)

- `pnpm db:reset` — OK (prints `ensure-dev-vars`, library v2 + demo seed).
- `GET /health` — `200` `{"data":{"status":"ok","service":"fitbud-api"}}`.
- **`POST /auth/login` on real `wrangler dev`** (after reset + fresh `pnpm dev`), password `FitBud-demo-2026`:

**Rahul (trainer)** — HTTP 200:
```json
{"data":{"token":"test.eyJ1aWQiOiJkZW1vLXJhaHVsLmNvYWNoQGRlbW8uZml0YnVkLnRlc3QiLCJlbWFpbCI6InJhaHVsLmNvYWNoQGRlbW8uZml0YnVkLnRlc3QifQ","tokenKind":"test_id_token","userId":"21dde613-caf2-407c-8be2-81e26cf727e2"}}
```

**Rohan (slipping)** — HTTP 200:
```json
{"data":{"token":"test.eyJ1aWQiOiJkZW1vLXJvaGFuLnNsaXBwaW5nQGRlbW8uZml0YnVkLnRlc3QiLCJlbWFpbCI6InJvaGFuLnNsaXBwaW5nQGRlbW8uZml0YnVkLnRlc3QifQ","tokenKind":"test_id_token","userId":"ff2323de-b458-44e3-a5bd-e72f546d69e9"}}
```

**Meera (ack)** — HTTP 200:
```json
{"data":{"token":"test.eyJ1aWQiOiJkZW1vLW1lZXJhLmFja0BkZW1vLmZpdGJ1ZC50ZXN0IiwiZW1haWwiOiJtZWVyYS5hY2tAZGVtby5maXRidWQudGVzdCJ9","tokenKind":"test_id_token","userId":"bc6c9470-8f77-49c7-9f9d-5541205877cd"}}
```

**Note:** If login returns D1 `internal error` after `db:reset`, restart `pnpm api` so wrangler reloads the local D1 file.

- `pnpm typecheck` / `pnpm lint` / `pnpm test` — green (counts in §8).

## 8. Test / lint / typecheck

| Package | Tests |
|---------|------:|
| API | 190 |
| core | 107 |
| contracts | 21 |
| api-client | 5 |
| trainer-web | 16 |
| mobile | 30 |
| tokens | 6 |

## 9. Gaps resolved (trainer-web / mobile)

| Gap (UI doc) | Api-client method / API |
|--------------|-------------------------|
| TW-23 `listPlanTemplates` filters | `listPlanTemplates({ scope, templateType, q })` → `GET /templates?...` |
| TW-08 invitation lifecycle | `reissueInvitation(id)`, `revokeInvitation(id)` |
| TW-08 reactivation cancel | `cancelReactivation(relationshipId)` → `POST /relationships/:rid/reactivate/cancel` |
| TW-25 check-in templates tab | `listCheckinFormTemplates({ scope, cursor, limit })` → `GET /checkins/form-templates` |
| TW-33 deep links | `resolveLink(kind, id)` → `GET /links/resolve` (already on client) |
| TW-29 trainer categories | `GET/PUT /notifications/preferences` field `trainerCategories`; api-client uses `notificationPreferencesSchema` |
| TW-09a `traineeTimezone` | `GET /workspaces/relationships/:rid` → `traineeTimezone` (no client change) |
| TR-05 `preferredWorkoutTime` | `PUT /notifications/preferences` → wired in `domain/reminders.ts` workout anchor |

## 10. Known gaps (Stage 2 blockers to watch)
- **A10**: No R2 media unless `LIBRARY_MEDIA_BASE_URL`.
- **Firebase** custom token not live-tested.
- **WhatsApp** not tested against Meta.
- **DO**: SQLite-backed DO migration note if deploying `RelationshipRealtimeRoom`.

## 11. Old seed 500

Per-row assignment generation exceeded D1 query limits; fixed with range SELECT + chunked `db.batch()` in `assignment-schedule.ts`.
