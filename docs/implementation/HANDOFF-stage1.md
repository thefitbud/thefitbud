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
| T08 | ✅ | FTS food search + Hindi aliases (`libraries.test.ts`), `GET /libraries/foods/:id` (redirects), `GET /libraries/foods/custom-logged`, trainee `me-foods`. Exercise FTS uses list path; query-count test not added. **Low-confidence redirects** listed below (PO sign-off). |
| T09 | ✅ | `GET /config`, flags, dev mail sink. |
| T10 | ⚠️ | Login/OTP/password paths implemented; dedicated limit/breached-password/auth-mode guard test file not exhaustive. |
| T11 | ✅ | Trainer profile + `/me`. |
| T12 | ⚠️ | Invite preview/reissue/revoke; accept+`otpProof` wired — full E2E accept test light. |
| T13 | ⚠️ | `requireWritableRelationship` on major write routes; onboarding submit not audited. |
| T14 | ✅ | Note `visibility` on create, `PATCH …/notes/:id`, P-NOTE via `trainer_note_shared` inbox (no push on `checkinId` notes). |
| T15 | ✅ | Batched generation + assign/diff. |
| T16 | ⚠️ | `canLog` table tests in core; sync parity tests partial. |
| T17 | ⚠️ | Read models implemented; per-route ≤10 query count tests not complete. |
| T18 | ⚠️ | Coach asks + cron; answer/notes route tests light. |
| T19 | ⚠️ | v2 clocks + cron `*/5`; full §3.6 backoff/W-FB matrix not fully asserted in API tests. |
| T20 | ⚠️ | `GET/PUT /me/meal-times`; trainer notify + window recompute partial. |
| T21 | ⚠️ | `GET /links/resolve` implemented; one test per kind not complete. |
| T22 | ⚠️ | WhatsApp client, budget, webhook unit tests; not live Meta. |
| T23 | ⚠️ | Template `scope` filters; acceptance tests partial. |
| T24 | ✅ | Full demo SQL personas + `demo-seed.test.ts` (login all, Rohan exception types in DB, adherence filters, paused responsiveness). |
| T25 | ✅ | `pnpm db:reset`. |
| T26 | ✅ | Contracts/core helpers; **`@fitbud/api-client` Stage 1 methods** via `stage1-augment.ts` (`login`, attention groups, activity feed, coach asks, me day/week, meal times, links, assign/diff, libraries, etc.) + tests. |
| T27 | ✅ | `@fitbud/tokens`. |
| T28 | ✅ | `@fitbud/brand`. |
| T29 | ✅ | ConfigProvider + mobile helpers. |
| T30 | ⚠️ | INSERT-first idempotency; `MEDIA_SIGNING_SECRET` local guard; auth/nudge rate limits on main paths. |
| T31 | ✅ | See §7 (tests + `db:reset`; login verified in `demo-seed.test.ts`). |
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

Copy `apps/api/.dev.vars.example`. Use `ENVIRONMENT=local`, `EMAIL_PROVIDER=dev_sink`, `AUTH_MODE=test`.

## 5. Commands

```bash
export PATH="/home/ubuntu/.nvm/versions/node/v22.23.3/bin:$PATH"
pnpm install
pnpm db:reset
pnpm api               # http://127.0.0.1:8787
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

- `pnpm db:reset` — OK (library v2 + demo seed).
- `GET /health` — OK against `wrangler dev` after reset.
- `POST /auth/login` — verified in **`demo-seed.test.ts`** for every account (memory DB + `AUTH_MODE=test`). If `wrangler dev` returns 500 on login, ensure `ENVIRONMENT=local` and `AUTH_MODE=test` in `.dev.vars` (see `.dev.vars.example`).
- `pnpm typecheck` / `pnpm lint` / `pnpm test` — green (counts in §8).

## 8. Test / lint / typecheck

| Package | Tests |
|---------|------:|
| API | 142 |
| core | 107 |
| contracts | 21 |
| api-client | 5 |
| trainer-web | 16 |
| mobile | 30 |
| tokens | 6 |

## 9. Known gaps (Stage 2 blockers to watch)

- **T10/T12/T13/T16–T23/T30**: see ⚠️ rows above — behaviour largely present; acceptance test depth varies.
- **A10**: No R2 media unless `LIBRARY_MEDIA_BASE_URL`.
- **Firebase** custom token not live-tested.
- **WhatsApp** not tested against Meta.
- **DO**: SQLite-backed DO migration note if deploying `RelationshipRealtimeRoom`.

## 10. Old seed 500

Per-row assignment generation exceeded D1 query limits; fixed with range SELECT + chunked `db.batch()` in `assignment-schedule.ts`.
