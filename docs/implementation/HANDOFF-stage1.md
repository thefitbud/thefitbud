# Stage 1 (Foundation) — handoff

Branch: `cursor/stage1-foundation-a3da` → merge into `feat/update-ui`.

## 1. Changes by task

| Task | Status | Notes |
|------|--------|-------|
| T00 | ✅ | Inputs verified (sha256 in PLAN §0). Baseline recorded: lint 2 errors, 1 failing test. |
| T01 | ✅ | Lint + notifications date fix. |
| T02 | ✅ | Fixed 0014/0017/0019 + `0021_library_v2.sql`, journal through 0026. |
| T03 | ✅ | `test-support/memory-db.ts` + D1 shim; FTS5 requires Node ≥22.23 (`.nvmrc`). |
| T04 | ✅ | `migration-chain.test.ts`: migrations, library seed counts, FTS roti, FK check + demo SQL. |
| T05 | ✅ | `library.drizzle.ts` merged into `schema.ts`, mappers updated. |
| T06 | ✅ | `apps/api/seed/library/` committed; `.gitattributes` for generated SQL/JSON. |
| T07 | ✅ | `library-seed.ts`, wipe/post-wipe SQL; legacy `seed-dev.ts` removed. |
| T08 | ⚠️ | FTS food search, redirects helper, `me-foods`, trainer FTS rebuild. Exercise FTS parity / `custom-logged` / full nutrition fields incomplete. |
| T09 | ✅ | `GET /config`, flags, dev mail sink, `GET /dev/mail` (local). |
| T10 | ⚠️ | Login, OTP, password set/reset, rate limits; Firebase custom token unit-tested path exists; not all acceptance tests (breached list, timing class). |
| T11 | ✅ | `PUT /me/trainer-profile`, `GET /me` email + trainer profile. |
| T12 | ⚠️ | Invite URL, preview, reissue/revoke, email; accept+`otpProof` partially wired. |
| T13 | ⚠️ | End/reactivate routes; `assertRelationshipWritable` on some routes, not exhaustive. |
| T14 | ⚠️ | `me-coach-notes`; note share/P-NOTE merge incomplete. |
| T15 | ✅ | Batched generation; `POST …/assign`, `GET …/diff`. |
| T16 | ⚠️ | `canLog` + `logged_foods` path; sync parity incomplete. |
| T17 | ⚠️ | Week/day, attention `groupBy`, facets, responsiveness, nudge limits — partial depth. |
| T18 | ⚠️ | Coach asks CRUD + expiry cron; merge tests light. |
| T19 | ⚠️ | Reminder v2 clocks, cron `*/5`, prefs extensions; full §3.6 backoff/W-FB not complete. |
| T20 | ⚠️ | `GET/PUT /me/meal-times`; window recompute + trainer notify incomplete. |
| T21 | ⚠️ | `GET /links/resolve` basic kinds. |
| T22 | ⚠️ | WhatsApp client, templates, budget, webhook stub + lint test; Meta not live-tested. |
| T23 | ⚠️ | `scope` on templates / form lists. |
| T24 | ⚠️ | Demo seed: all accounts + password hash; **not** full 3–4 week history for every persona (see gaps). |
| T25 | ✅ | `pnpm db:reset` = migrate + library + demo (`tsx` scripts). |
| T26 | ⚠️ | Contracts/core helpers; `getConfig()` on api-client; most new routes not on client yet. |
| T27 | ✅ | `@fitbud/tokens` + semantic layer; web/mobile consume tokens. |
| T28 | ✅ | `@fitbud/brand` + `pnpm generate`; web favicons in `trainer-web/public`; mobile `app.json` paths. |
| T29 | ✅ | `ConfigProvider` (web), mobile config helpers + tests. |
| T30 | ⚠️ | Insert-first idempotency partial; `MEDIA_SIGNING_SECRET` local guard. |
| T31 | ✅ | Real run below. |
| T32 | ✅ | This document. |
| T33 | ✅ | Draft PR into `feat/update-ui`. |

## 2. Key endpoints (new/changed)

Public: `GET /config`, `POST /auth/login`, `/auth/otp/start`, `/auth/otp/verify`, `/auth/password/reset`, `/auth/password/set`, `GET /invitations/preview`, `GET /dev/mail` (local).

Trainer/trainee: lifecycle, coach-asks, me-day/week, activity feed, plan assign/diff, libraries FTS, notifications responsiveness, WhatsApp webhook (flagged).

See OpenAPI: `GET /docs` when API is running.

## 3. Flags (defaults)

| Flag | Default | Override |
|------|---------|----------|
| `wa_otp` | false | `FLAG_WA_OTP=true` in `.dev.vars` or `UPDATE feature_flags` |
| `wa_automation` | false | `FLAG_WA_AUTOMATION` |
| `steps_enabled` | false | `FLAG_STEPS_ENABLED` |

## 4. Env (examples only)

Copy `apps/api/.dev.vars.example`. Key vars: `ENVIRONMENT=local`, `EMAIL_PROVIDER=dev_sink`, `AUTH_MODE=test`, `APP_HOST=http://localhost:5173`, fake `WA_*` placeholders.

## 5. Commands

```bash
export PATH="/home/ubuntu/.nvm/versions/node/v22.23.3/bin:$PATH"  # FTS5
pnpm install
pnpm db:reset          # migrate + library v2 + demo
pnpm api               # http://127.0.0.1:8787
pnpm typecheck && pnpm lint && pnpm test
```

OTP: `POST /auth/otp/start` then `GET /dev/mail?to=<email>`.

Library only: `pnpm db:seed:library`. Demo only: `pnpm seed:demo`.

Brand assets: `pnpm --filter @fitbud/brand generate`.

## 6. Demo accounts

Password (dev only): **`FitBud-demo-2026`**

| Email | Role | State |
|-------|------|-------|
| rahul.coach@demo.fitbud.test | trainer | Main coach |
| priya.coach@demo.fitbud.test | trainer | Second coach |
| anita.invite@demo.fitbud.test | invite | Pending invite |
| vikram.onboarding@demo.fitbud.test | trainee | Onboarding draft |
| sneha.review@demo.fitbud.test | trainee | Awaiting review |
| aarav.ontrack@demo.fitbud.test | trainee | On track |
| rohan.slipping@demo.fitbud.test | trainee | Needs attention mix |
| meera.ack@demo.fitbud.test | trainee | Ack + late log |
| farhan.paused@demo.fitbud.test | trainee | Reminders paused |
| ishita.pushoff@demo.fitbud.test | trainee | Push off + coach ask |
| kavya.ended@demo.fitbud.test | trainee | Ended |
| nikhil.reactivate@demo.fitbud.test | trainee | Reactivation pending |
| deepak.dubai@demo.fitbud.test | trainee | Dubai TZ + meal times |
| lakshmi.foods@demo.fitbud.test | trainee | Food deviations |
| karan.dual@demo.fitbud.test | dual | Trainer + trainee |

## 7. T31 run results (2026-10-17, local)

```
GET /health → {"data":{"status":"ok","service":"fitbud-api"}}
GET /config → flags all false, supportEmail tech@thefitbud.com
POST /auth/login (rahul…) → 200 test_id_token
POST /auth/otp/start → {"sent":true,"channels":["email"]}
GET /dev/mail → subject "Your FitBud code: 846636"
GET /libraries/foods?q=roti (trainer) → chapati/roti in items
```

## 8. Test / lint / typecheck

- `pnpm typecheck` — pass (monorepo)
- `pnpm lint` — pass
- `pnpm test` — pass: API **138**, core **107**, contracts **21**, api-client **4**, trainer-web **16**, mobile **30**, tokens **6**

## 9. Known gaps

- **A10**: No R2 media; `media: []` unless `LIBRARY_MEDIA_BASE_URL`.
- **Firebase** custom token not exercised against live Firebase.
- **WhatsApp** not tested against Meta; flags default off.
- **Library redirects**: low-confidence wipe targets in `07_post_wipe_dev.sql` need PO confirmation.
- **T24**: Demo history does not yet cover every persona/state with 3–4 weeks of assignments/logs.
- **T26**: Api-client missing typed methods for most new routes.
- **T19**: Full reminder backoff / W-FB budget path incomplete.
- **DO**: `RelationshipRealtimeRoom` SQLite migration note if ever deployed.
- **A1**: Token deep navy/coral vs logo SVG one-digit hex difference documented in `@fitbud/tokens`.

## 10. Old seed 500

Root cause: per-row assignment generation exceeded D1 per-invocation query limits; fixed by range SELECT + chunked `db.batch()` inserts (`assignment-schedule.ts`).
