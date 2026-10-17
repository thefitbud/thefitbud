# Stage 1 (Foundation) — implementation plan

Scope: everything the later UI agents need for the screens in the **FitBud UI/UX Implementation Guide v1.2** (TW-01…34, TM-01…09, TR-01…26). That means the data model, the API, contracts, flags, tokens, the logo set, the library data and the demo seed. Stage 1 builds **no screens**; it only wires tokens, the logo and the `/config` client.

The ordered work list for the implementing agent is in [`STAGE1-TASKS.md`](./STAGE1-TASKS.md). This file is the reference: what each screen needs, what exists today and what Stage 1 adds.

Status of this document: planning only. Nothing in it has been implemented on this branch.

---

## 0. Inputs (not in the repo)

The implementing agent needs the attachments below, which the product owner supplied. They are **not** committed. Ask for them if they are missing, and check the hashes.

| Input | sha256 (archive as uploaded) | What it is used for |
|---|---|---|
| `fitbud-guide-v1.2.tar.gz` → `FitBud_UIUX_Implementation_Guide.md` (+ `img/`) | `2bd8405a8c48…6188` | The source for every screen, API-NEW/API-CHG item, notification and token below. Section numbers (§) in this plan refer to it. |
| `fitbud-library-v2.tar.gz` → `library/` | `78626756b33e…ae17` | `schema/MIGRATION_PLAN.md`, `schema/0021_library_v2.sql`, `schema/library.drizzle.ts`, `schema/fixed_migrations/{0014,0017,0019}.sql`, `seed/sql/01…06_*.sql`, `seed/manifest.json`, `seed/library-2026.10.2.json`, `review/ATTRIBUTION.md`, `pipeline/tests/test_migrations_d1like.py`, plus `library-and-backend-review.md` (the P0/P1 backend review). **Do not commit `sources/`.** |
| `fitbud-product-docs.tar.gz` → `sources/*.md` | `88ccbf7bcaa5…63d0` | Background: Project Details, Workflows and States, UX and Screen Architecture, Iteration A decisions. |
| `runnerup-honest-week-mark.svg` | `f989a3c7e35a…0611` | The temporary logo mark (four dots: three filled `#1A1248`, the last one an outlined `#FF587D` ring). |
| `handoff/logo/runnerup-honest-week-mark.png`, `handoff/round2_refinement.png` | — | Referenced in the brief, but **not present** in this environment. The SVG alone is enough to generate every asset, so treat the PNGs as visual references only. |

Seed manifest `2026.10.2`: 693 foods (INDB 313, USDA 380), 353 exercises, 10 templates, 2,333 servings, 2,948 food aliases, 242 exercise media rows, 947 exercise relations, 1 redirect. `content_sha256 = 732bc3ea…1ffa`.

---

## 1. Baseline findings (branch `feat/update-ui` at the time of planning)

| Area | Finding | Consequence for Stage 1 |
|---|---|---|
| Typecheck | `pnpm typecheck` passes. | Keep it green. |
| Lint | `pnpm lint` **fails**: 2 × `no-explicit-any` in `apps/api/src/routes/gate6-workflow.test.ts` (lines 73 and 77). | Fix in the first task. |
| Tests | `pnpm test`: one API test **fails**: `notifications.test.ts` › "applies meal and workout clocks…". It hard-codes `localDate = "2026-10-10"` and publishes the plan "immediately", so `effectiveFrom` is today and generation clips the past date away (0 rows, then `items[0]` is undefined). Every other suite passes (API 130/131, core 99, contracts 21, mobile 29, web 14, api-client 4). | It's a time bomb; rewrite it relative to "now" while reworking reminders. |
| Migrations | `0014`, `0017` and `0019` contain `BEGIN TRANSACTION`/`COMMIT` and `PRAGMA foreign_keys`. A D1-style run (one transaction per file, FKs on) **fails at 0014**. With the fixed files from the library bundle, 0000–0020 + 0021 + the full v2 seed apply with **0 FK violations**. Re-verified on this branch's files with `test_migrations_d1like.py`. | Replace those three files in place, as MIGRATION_PLAN §0 allows for never-applied environments. |
| Migration metadata | `apps/api/drizzle/meta/` holds only `_journal.json` (no snapshots). | **Do not run `drizzle-kit generate`**; it would diff against nothing. Hand-write the SQL, add journal entries and mirror the changes in `schema.ts`. |
| Test DB | All 20 API test files have their own `createMemoryDb()` that `exec`s a hand-picked, **non-numeric** list of migrations into **sql.js**. sql.js has **no FTS5** (`no such module: fts5`), so 0021 can't load there. Drizzle selects every column in `schema.ts`, so any test DB missing a new column breaks. | Replace these with one shared helper on `node:sqlite` with a small D1 shim (see T03). `node:sqlite` has FTS5 on Node **22.23** (SQLite 3.51) but **not** on Node 22.14 (`/exec-daemon/node` on the VM). Pin Node ≥ 22.13 and verify FTS5 in the helper. |
| Library | Migrations 0011 and 0016 seed 40 legacy foods (`f1000001-…`), 80 servings (`b1000001-…`) and 36 exercises (`e1000001-…`). 0017 seeds 3 global templates (`a1000001-…-01/02/03`). | Wiped in local/dev only by the library seed command (T07). Migrations stay untouched. |
| v2 seed vs. MIGRATION_PLAN | After applying the v2 seed on top of 0000–0021: 693 active v2 foods, **7 legacy foods archived** (Phulka, Dal Tadka, Dal Fry, Paneer Bhurji, Oats (savory), Vegetable Sabzi, Tofu Stir-fry), **only 1 redirect** (Phulka → chapati `…0001`), 80 legacy servings still present (66 on active foods), all 36 legacy exercise ids active, 13 global templates (10 v2 + 3 legacy). MIGRATION_PLAN.md says 2 redirects and that the low-confidence items reuse their ids; **the 2026.10.2 seed doesn't do that.** | The wipe task adds redirects for the 6 archived foods without one and for the legacy servings (T07). Product owner to confirm the low-confidence targets. |
| Assignment generation | `insertWorkoutAssignments` and `insertMealAssignments` (`domain/assignment-schedule.ts`) run **2 SELECTs + 1 INSERT per placement**, one at a time. A month of daily meals × 4–5 slots is hundreds of queries in one request. D1 allows **50 queries per invocation on Free** (1,000 on Paid), and each statement is capped at **100 bound parameters**. Generation also **clips to the plan version's `effectiveFrom`**, so the old seed could never backfill history through the API. | Most likely cause of the seed's 500 (guide backlog #11). It is **not yet reproduced**: reproduce first (T15), then batch the work. The demo seed writes history directly in SQL (T24). |
| Auth | `users` has **no email or phone column**; identity is `firebase_uid` only. `AUTH_MODE=test` accepts unsigned `test.<base64url({uid,email})>` tokens. Firebase verification isn't wired. The backend review flags that non-firebase mode fails open. | Add a `user_identities` table for login identifiers and passwords (T09). Refuse `AUTH_MODE=test` unless `ENVIRONMENT=local`. |
| Relationships | `coaching_relationships.status ∈ {active, ended}`. **No endpoint ends a relationship.** No reactivation exists. There is no "paused" relationship status, and the guide's removal list bans a "Paused" client badge (§1.5). | "Paused" in the brief means **reminders paused** (P-PAUSE back-off, or the trainee turning reminders off). See decision A3. |
| Enums | Apart from `ownership` there are **no SQL CHECK constraints** on enum columns; enums exist only in TypeScript and zod. | New enum values (deviation kind `logged_foods`, new notification types, exception statuses) need no table rebuild, but `schema.ts`, the contracts and the mappers must all change together. |
| Notes | Trainer notes are served by `GET/POST /checkins/relationships/:rid/notes` (`routes/checkins.ts`). | Extend them in place (visibility, subject); don't create a second notes store. |
| Tokens | `packages/ui-mobile/src/theme.ts` and `apps/trainer-web/src/styles.css` each hard-code the brand palette (`#1A1248`, `#FF587D`, …). There is no semantic layer, no shared source, and mobile has no fonts. `apps/mobile/app.json` has no icon or splash image. `apps/trainer-web/index.html` has no favicon. | Create `packages/tokens` and `packages/brand` (T27–T28). |

---

## 2. Decisions and assumptions (for the product owner to confirm)

| # | Decision | Why |
|---|---|---|
| A1 | **Brand colours:** use the brief's `#1A1249` (Deep Navy) and `#FF5B7D` (Coral) as the token values. The guide and current code use `#1A1248` and `#FF587D`; that one-digit difference is invisible. Keep the logo SVG exactly as supplied (`#1A1248` / `#FF587D`) until the real logo replaces it. Chalk `#FAF7F2` is new, used for the splash and marketing surfaces only. | The brief is the newer instruction. The difference is recorded in the tokens README. |
| A2 | Coral is an **accent only** (logo, celebration, onboarding hero). It is never a status colour. Statuses use the semantic layer from §1.6.1. | Guide §1.6.1. |
| A3 | **"Paused" = reminders paused**, not a relationship status. Its sources are back-off (5 ignores, then a 7-day pause, P-PAUSE), the trainee turning reminders off, or push failure. TW-31 shows it as "Reminders paused". End and reactivate follow §3.8 (D21). | The guide's removal list bans a client "Paused" badge (§1.5). The brief says "per the guide". |
| A4 | **Passwords live in D1** (`user_identities.password_hash`, PBKDF2-SHA-256, 100,000 iterations, the Workers WebCrypto maximum, 16-byte salt). The guide says Firebase stores them. Without Firebase credentials that can't be built or tested, so Stage 1 keeps the hash server-side behind a `PasswordStore` interface. A `firebase` implementation can replace it later. | Locally runnable and testable. No production credentials. |
| A5 | **Token minting.** `POST /auth/login` and `POST /auth/otp/verify` return `{ token, tokenKind }`. With `AUTH_MODE=test`, `tokenKind = "test_id_token"`: the existing `test.<…>` format, which web exchanges with `POST /auth/session` and mobile uses as a bearer token. With `AUTH_MODE=firebase`, `tokenKind = "firebase_custom_token"`: an RS256 custom token signed with `FIREBASE_SERVICE_ACCOUNT_JSON`. Implement it and unit-test it with a generated key; it isn't exercised live. | Matches §3.1a ("API mints Firebase custom token") without needing secrets. |
| A6 | **Dev email sink.** `EMAIL_PROVIDER=dev_sink` (the default in `.dev.vars.example`) writes every system email to a `dev_mail_outbox` table. It also prints a one-line `[DEV MAIL] to=… subject=…` to the wrangler console; the subject carries the code, e.g. "Your FitBud code: 482913". `GET /dev/mail?to=` lists the outbox. The sink and the endpoint return 404 or refuse to send unless `ENVIRONMENT=local`. No real provider is configured. `EMAIL_PROVIDER=resend|ses` are left as typed stubs that throw `not_configured`. | The brief asks for codes testers can read. Codes in a dev-only sink are the explicit exception to "no secrets in logs". |
| A7 | **Flags** are rows in D1 (`feature_flags`), with env-var overrides (`FLAG_WA_OTP`, `FLAG_WA_AUTOMATION`, `FLAG_STEPS_ENABLED`) for tests. Defaults: all `false`. `GET /config` is public and cacheable for 1 h. | §1.6.11 says "KV or D1 config". D1 avoids a new binding. |
| A8 | **No message is ever sent on a person's behalf** (D31). The only FitBud-sent WhatsApp is the system templates (W-OTP, W-FB, W-CHK, W-PLAN, W-RENEW) behind the flags. Every trainer→trainee or trainee→trainer WhatsApp is a `wa.me` link with prefilled text, built by a pure helper in `packages/core`. | Brief and §3.5. |
| A9 | The **demo seed writes SQL directly** (deterministic ids, fixed reference date), not through the HTTP API. | History must be backdated 3–4 weeks. The API clips generation to `effectiveFrom` and stamps "now" on every write. |
| A10 | Library media: Stage 1 does **not** upload the 242 Everkinetic PNGs to R2. `exercise_library_media` rows exist. The API returns `media: []` unless `LIBRARY_MEDIA_BASE_URL` is set and the object exists, and the UI must render a no-image placeholder. | The brief makes media optional. Recorded as a known gap. |

---

## 3. Shared building blocks

The screen tables in §4 refer to these.

### 3.1 Database changes (all new migrations are hand-written SQL plus `schema.ts` and `_journal.json`)

| Migration | Contents |
|---|---|
| `0014`, `0017`, `0019` (replace in place) | The fixed versions from `library/schema/fixed_migrations/`. They drop BEGIN/COMMIT and `PRAGMA foreign_keys`, and add `PRAGMA defer_foreign_keys = true;`. No other SQL change. |
| `0021_library_v2.sql` | Verbatim from the bundle: provenance, lookups, the extended food and exercise columns, aliases, nutrients, instructions, relations, media, and the FTS5 tables `food_search_fts` and `exercise_search_fts`. |
| `0022_auth_config.sql` | `user_identities` (user_id PK→users, email, email_norm UNIQUE, mobile_e164 UNIQUE, password_hash, password_updated_at, failed_login_count, locked_until, created_at, updated_at). `auth_otps` (id, identifier_hash, code_hash, purpose `login|reset|invite`, expires_at, attempts, channels_sent JSON, consumed_at, invalidated_at, created_at, ip_hash). `auth_rate_limits` (bucket_key PK, window_start, count). `feature_flags` (key PK, enabled, updated_at, updated_by). `dev_mail_outbox` (id, to_address, template, subject, text_body, html_body, created_at). |
| `0023_lifecycle_notes_asks.sql` | `coaching_relationships` + `ended_at` (exists), `ended_by_user_id`, `end_reason`, `reactivated_at`. `reactivation_requests` (id, relationship_id, trainer_user_id, status `pending|confirmed|cancelled|expired`, intake_update_requested, expires_at = +14 d, created_at, resolved_at). `trainer_notes` + `visibility` (`private|client`, default `private`), `subject_type` (`relationship|checkin|exception|meal|workout|coach_ask`), `subject_id`, `shared_at`, `unshared_at`, `seen_at`. `coach_asks` (id, relationship_id, trainee_user_id, item_type `meal_assignment|workout_assignment|exercise_execution|checkin|plan_version`, item_id, topic, asked_at, last_asked_at, ask_count, status `open|answered|expired`, answered_at, answered_by, trainer_note_id). It has **no message-text column**. `trainer_profiles` + `whatsapp_e164`. `client_invitations` + `reissued_from_id`, `revoked_at`, `email_sent_at`. `exceptions` + `resolution_outcome`, `resolution_note`, `closed_reason` (`coaching_ended`), `source_logged_late_at`. |
| `0024_logging_mealtimes.sql` | `meal_time_overrides` (relationship_id, slot_key, day_pattern `all|weekdays|weekends`, time HH:MM, updated_at; PK on the first three). `meal_compliance` + `items_json` (logged foods), `kcal_scaled`, `protein_scaled`, `carbs_scaled`, `fat_scaled`, `logged_late` (0/1), `logged_after_resolve` (0/1), `client_logged_at`. `trainee_custom_foods` (id, trainee_user_id, relationship_id, name, kcal/protein/carbs/fat scaled per serving, serving_label, created_at; trainer-visible via `GET /libraries/foods/custom-logged`). `workout_executions` + `logged_late`, `client_logged_at`. |
| `0025_preferences_reminders.sql` | `notification_preferences` + `channel_preference` (`app|app_and_whatsapp`), `whatsapp_opt_in_granted`, `whatsapp_opt_in_at`, `whatsapp_opt_in_source`, `whatsapp_opt_in_text_version`, `preferred_workout_time`, `locale`, `trainer_categories_json`. `reminder_states` (trainee_user_id PK, consecutive_ignores, mode `normal|self_logger|soft_ignorer|paused|push_failed`, paused_until, last_evaluated_at, updated_at). `notifications` + `opened_at`, `priority`, `merge_group`, `payload_json` (ids only), `expires_at`. `notification_deliveries.channel` gains `whatsapp` (TS enum only). |
| `0026_whatsapp.sql` | `whatsapp_templates` (§4.6 columns), `whatsapp_messages` (id, template_key, to_hash, wamid, status, error_code, relationship_id, trainee_user_id, created_at, updated_at), `whatsapp_ledger` (§4.5 columns; paise integers), `whatsapp_webhook_events` (id = Meta event id, received_at, kind; dedupe), `whatsapp_opt_outs` (user_id, at, source `stop_keyword|settings`). Seed the 5 template rows with status `draft`. |

### 3.2 Contracts (`packages/contracts/src/*`)

New files: `auth.ts` (login, otp start/verify, password reset/set), `config.ts` (`configResponseSchema`), `coach-ask.ts`, `note.ts` (or extend the notes section of `checkin.ts`, which currently holds `trainerNote*`), `activity-feed.ts`, `links.ts`, `meal-times.ts`, `trainee-food.ts`, `whatsapp.ts` (template keys, ledger row, budget mode), `week.ts` (week and day read models).
Changed: `identity.ts` (`me` gains `timezone` and `trainerProfile` fields), `relationship.ts` (end/reactivate payloads, `traineeTimezone`, trainer `whatsappE164`), `meal.ts` (deviation kind `logged_foods` with `items[]`, `loggedLate`, `locked` error shape, per-meal and per-day kcal), `exception.ts` (`groupBy=relationship` response, resolve `{note?, outcome?}`, `sourceSummary`, `ageMinutes`), `notification.ts` (13 new types, preferences fields, responsiveness), `plan.ts` (`schedule` map, meal slot `type/label/time`, the combined assign request with dry-run, diff), `directory.ts` (`renewal` filter, facet counts, `status=ended`), `workspace.ts` (`traineeTimezone`, `hasCustomMealTimes`, `timeDiffLabel` input), `template.ts` (`scope=bases|mine` with `ownership`), `nutrition.ts` (library food `aliases`, `dietTags`, `servings[]` with `isDefault`).

### 3.3 Core helpers (`packages/core/src/*`)

`format.ts` (`formatTimeDiff(trainerTz, traineeTz, now)` → "5 h 30 m behind you" / "same time"; kcal and macro formatting), `labels.ts` (derived-state labels, with **no % scores or risk labels**), `support.ts` (support email, `wa.me` builder with prefilled text, D19/D31), `macros.ts` (per-meal and per-day kcal from scaled snapshots), `config.ts` (flag keys and defaults), `reminder.ts` (v2 policy, pure and timezone-aware; see §3.6 of the guide), `late-logging.ts` (the D23/D34 decision function).

### 3.4 Endpoint inventory

**Exists today (re-used, sometimes extended):** `POST/DELETE /auth/session`, `GET /me`, `GET/PUT /me/trainee-profile`, `/invitations` (POST, GET, GET `:id`, POST `accept`), `/relationships` (GET, GET `:rid`, GET/PUT `:rid/subscription`), `GET /subscriptions/attention`, `/onboarding/*` (forms/current, relationships draft/submit/review, form-templates CRUD/fork/versions), `/configurations/relationships/:rid` (GET, draft, configure, activate, versions, copy), `/plans/*` (relationships list/effective/create/from-template, plan get, version get/put/preview/publish, versions create, consistency, consistency-acknowledgement), `/templates/*` (list/create/from-plan-version/get/fork/put/delete), `/libraries/{exercises,foods}` (list/create/put/delete), `GET /clients`, `/workouts/*` (generate, list, adherence, assignment get/start/skip, execution pause/resume/sets complete/skip/complete/get), `/meals/*` (generate, list, compliance, assignment get, confirm/deviate/skip), `/checkins/*` (form-templates, schedule, schedule-next, ensure-due, list, notes GET/POST, inbox, get, review-context, draft, submit, review), `/exceptions/*` (attention, evaluate, list, interventions GET/POST, get, acknowledge, resolve), `/progress/*`, `/history/relationships/:rid`, `/workspaces/relationships/:rid` (+ `/activity`), `/files/*`, `/sync/push|pull`, `/notifications/*` (device-tokens, preferences, list, reminders/evaluate, read, reminder-rules, nudges), `/realtime/*`, `/health`, `/openapi.json`, `/docs`.

**Added in Stage 1:**
- Auth and identity: `GET /config`, `POST /auth/login`, `POST /auth/otp/start`, `POST /auth/otp/verify`, `POST /auth/password/reset`, `POST /auth/password/set`, `PUT /me/trainer-profile`, `GET /dev/mail` (local only).
- Invitations: `GET /invitations/preview?token=`, `POST /invitations/:id/reissue`, `POST /invitations/:id/revoke`.
- Relationships: `POST /relationships/:rid/end`, `POST /relationships/:rid/reactivate`, `POST /relationships/:rid/reactivate/confirm`, `POST /relationships/:rid/reactivate/cancel`.
- Coach asks: `GET /coach-asks`, `POST /coach-asks`, `POST /coach-asks/:id/answer`, `POST /coach-asks/:id/notes`.
- Trainee self-service: `GET /me/coach-notes?since=`, `POST /me/coach-notes/:id/seen`, `GET/PUT /me/meal-times`, `GET /me/foods/search`, `GET /me/foods/recent`, `GET /me/foods/index?since=`, `GET /me/day/:date`, `GET /me/week?start=`.
- Trainer read models: `GET /workspaces/relationships/:rid/week?start=`, `GET /activity/feed`, `GET /notifications/relationships/:rid/responsiveness?days=14`, `GET /notifications/reengagement-candidates`, `GET /libraries/foods/custom-logged?rid=`.
- Plans: `POST /plans/:planId/versions/:vid/assign` (with `dryRun`), `GET /plans/:planId/versions/:vid/diff`.
- Links and notes: `GET /links/resolve?kind=&id=`, `PATCH /checkins/relationships/:rid/notes/:noteId` (share/unshare).
- WhatsApp: `GET/POST /webhooks/whatsapp`.

**Changed in Stage 1:**
- `GET /exceptions/attention` gains `groupBy=relationship`, severity and `ageMinutes`. `GET /exceptions/:id` embeds `sourceSummary`. `POST /exceptions/:id/resolve` accepts `{note?, outcome?}`.
- `POST /notifications/relationships/:rid/nudges` gets limits: 3 per trainer per hour, and 1 per item per 4 h.
- `GET /clients` gains `renewal`, `status=ended` and facet counts.
- `GET /workspaces/relationships/:rid` header gains `traineeTimezone`, `hasCustomMealTimes` and the trainer's WhatsApp.
- `POST /meals/assignments/:id/{confirm,deviate,skip}` and the workout `start/complete/skip` endpoints apply the late-logging rule. Meal deviation gains `logged_foods`.
- `GET/PUT /notifications/preferences` gain the new fields.
- `POST /invitations` returns `inviteUrl` and gains `sendEmail`. `POST /invitations/accept` takes `{token, displayName, mobileE164?, password, otpProof}`.
- `GET /me` gains `timezone` and the trainer profile.
- `GET /libraries/foods|exercises` move to FTS5 search with aliases and redirect resolution. `GET /templates` gains `scope=bases|mine`.
- `GET /history/...` gains the new kinds: `note_shared`, `note_unshared`, `relationship_ended`, `relationship_reactivated` and `meal_times_changed`.
- `/sync/push` applies the same late-logging rule.

---

## 4. Screen-by-screen needs

Legend: **E** = exists and is usable as is. **X** = exists, Stage 1 extends it. **N** = new in Stage 1. Every screen must also handle the shared states from §1.6.5: loading, empty, error with retry, offline, forbidden and not-found. Only extra states are listed here.

### 4.1 Trainer web

| Screen | Endpoints | Contracts | DB | Screen-specific states | Stage 1 work |
|---|---|---|---|---|---|
| TW-01 Sign in | E `POST/DELETE /auth/session`, E `GET /me`; N `POST /auth/login`, `/auth/otp/start`, `/auth/otp/verify`, `/auth/password/reset`, `/auth/password/set`; N `GET /config` | N `auth.ts`, `config.ts` | N `user_identities`, `auth_otps`, `auth_rate_limits` | wrong credentials (generic), locked 15 min, code sent (email only), code expired or used, resend cooldown 60 s, WhatsApp "Coming soon" (flag off) | N: the full auth flow, dev mail sink, demo trainer passwords |
| TW-02 First-run onboarding | E `GET /me`; N `PUT /me/trainer-profile` {displayName, whatsappE164, timezone}; X `GET /templates?scope=bases` | X `identity.ts` | X `trainer_profiles.whatsapp_e164`, `users.timezone` | first run vs returning | N endpoint; X `/me` |
| TW-03 App shell | E `GET /me`; N `GET /config`; E `GET /notifications` (bell) | N `config.ts` | — | offline banner, role mismatch | N tokens, logo, config client |
| TW-04 Home triage | X `GET /exceptions/attention?groupBy=relationship` (severity, ageMinutes), E `GET /subscriptions/attention`, E `GET /checkins/inbox`, E `GET /relationships`, E `GET /invitations`, N `GET /coach-asks?status=open`, N `GET /notifications/reengagement-candidates` | X `exception.ts`, N `coach-ask.ts` | N `coach_asks` | all clear, critical first, acknowledged-not-resolved, groups per client (D32) | X/N |
| TW-05 Exception drawer | X `GET /exceptions/:id` (+`sourceSummary`), E acknowledge, X resolve `{note?, outcome?}`, E interventions, X nudge (limits), N `GET /notifications/relationships/:rid/responsiveness` | X `exception.ts`, `notification.ts` | X `exceptions` + resolution columns | acknowledged, resolved, client logged later (`meal_logged_later`), closed because coaching ended, nudge rate-limited | X |
| TW-06 Client roster | X `GET /clients` (+`renewal`, `status=ended`, facets) | X `directory.ts` | — | ended section, invite pending rows, no results | X |
| TW-07 Add client | X `POST /invitations` (+`inviteUrl`, `sendEmail` → E-INV in dev sink), E `GET /onboarding/form-templates` | X `relationship.ts` | X `client_invitations` | duplicate pending invite, WhatsApp `wa.me` link (no flag) | X |
| TW-08 Pending invitation | E `GET /invitations/:id`; N reissue, revoke | X `relationship.ts` | X `reissued_from_id`, `revoked_at` | expired, revoked, accepted | N |
| TW-09a Workspace header | X `GET /workspaces/relationships/:rid` (+`traineeTimezone`, `hasCustomMealTimes`, renewal, onboarding status) | X `workspace.ts`; core `formatTimeDiff` | — | timezone badge when offsets differ, custom meal-times chip, ended (read-only) | X |
| TW-09 Overview | X workspace read; N week read model; N responsiveness; X notes (client-visible vs private) | X `workspace.ts`, N `week.ts` | — | weekly consistency count (**no streaks, no %**) | N/X |
| TW-10 Onboarding review | E `GET /onboarding/relationships/:rid`, E review | E | — | intake not submitted, submitted, reviewed | E (demo data only) |
| TW-11 Configure | E configurations, E subscription, E reminder rules; WhatsApp reminder toggle reads `GET /config` | E/X `notification.ts` | — | WhatsApp reminders "Coming soon" | X |
| TW-12 Plan tab | E plans list, effective, from-template, versions, publish, preview, consistency; N `GET …/versions/:vid/diff` | X `plan.ts` | — | draft, scheduled, effective, superseded (versioned plans) | N diff |
| TW-13 Workout builder | E version get/put/preview/publish; X `GET /libraries/exercises?q&muscleGroup&equipment&difficulty` (FTS5, v2 fields, media placeholder) | X `plan.ts` (`schedule` map), `template.ts` | 0021 | no media (placeholder), archived exercise in an old plan | X |
| TW-14 Nutrition builder | E version get/put; X `GET /libraries/foods?q` (FTS5, aliases incl. Hindi/Telugu, servings, kcal) | X `nutrition.ts`, `plan.ts` (meal slot type/label/time) | 0021 | redirected food id resolved transparently | X |
| TW-15 Diet change scope | N assign `dietChangeScope: today_onward|today_only` (existing `plan_assignment_policies`) | X `plan.ts` | E | only nutrition changed | N (via assign) |
| TW-16 Assign plan | N `POST /plans/:planId/versions/:vid/assign {window, effectiveFrom, effectiveTo?, dietChangeScope?, notifyClient, dryRun}`; E generate endpoints (fixed) | X `plan.ts` | E | dry-run preview of replaced rows, "Couldn't create this week's schedule · Retry" on failure (never a silent 500) | N + fix of the generation 500 |
| TW-17 Activity | E `GET /workspaces/relationships/:rid/activity` (derived states incl. **logged late**, **changed** with logged foods and kcal); E nudge | X `workspace.ts`, `meal.ts` | X `meal_compliance` | the four adherence states, logged late, locked ("Closed by coach") | X |
| TW-18 Progress | E progress endpoints | E | — | no data | E |
| TW-19 Client check-ins | E list, schedule, schedule-next | E | — | timezone badge on schedule | E |
| TW-20 Check-in review | E get, review-context, review, notes (X visibility; **notes created with a review are not pushed**, D20) | X notes | X `trainer_notes` | pending, submitted, reviewed | X |
| TW-21 History | X `GET /history/relationships/:rid` (+ new kinds) | X `history.ts` | — | — | X |
| TW-22 Check-ins inbox | E `GET /checkins/inbox` (the guide flags a P0 bug in this view; the UI agent will verify against demo data) | E | — | due, overdue, submitted, reviewed | E (+demo data) |
| TW-23 Templates hub | X `GET /templates?templateType&scope=bases|mine&q`, E onboarding and check-in form templates, X libraries | X `template.ts` | v2 templates (10 FitBud bases) | bases read-only, fork to Mine | X |
| TW-24 Onboarding form builder | E onboarding form templates/versions | E | — | — | E |
| TW-25 Check-in form builder | E `/checkins/form-templates` (GET, POST, get, fork, versions) | E | — | — | E |
| TW-26 Libraries | X library list (cursor paging, FTS5), E create/update/archive (+ FTS row rebuild on trainer writes) | X `nutrition.ts`, `template.ts` | 0021 | attribution footer (ATTRIBUTION.md text) | X |
| TW-27 Template use/fork | E fork, from-template | E | — | — | E |
| TW-28 Settings | E `GET /me`, N `PUT /me/trainer-profile`, E `DELETE /auth/session`, N `POST /auth/password/set` | X | — | — | N |
| TW-29 Trainer notifications | X `GET/PUT /notifications/preferences` (+`trainerCategories`) | X `notification.ts` | X prefs | — | X |
| TW-30 End/reactivate | N `POST /relationships/:rid/end`, `/reactivate`, `/reactivate/cancel`; trainee `/reactivate/confirm`; X workspace read (ended) | X `relationship.ts` | N `reactivation_requests`; X relationships | ended (read-only), reactivation pending (14 days), expired | N |
| TW-31 Responsiveness | N `GET /notifications/relationships/:rid/responsiveness?days=14` → one of 6 labels plus counts | X `notification.ts` | N `reminder_states`; X notifications (`opened_at`) | Not enough data, Reminders paused, Notifications off | N |
| TW-32 Asked-coach items | N `GET /coach-asks?status=open`, `POST /coach-asks/:id/answer {note?}`, `POST /coach-asks/:id/notes` | N `coach-ask.ts` | N `coach_asks` | merged repeat asks (24 h), expired (7 d) | N |
| TW-33 System states | N `GET /links/resolve` (for deep links), E 404 envelope | N `links.ts` | — | not found, unavailable (with reason), offline | N |
| TW-34 Note composer | X `POST /checkins/relationships/:rid/notes {body, visibility, subjectType, subjectId}`, N `PATCH …/notes/:id` (share/unshare) → P-NOTE push on share | X notes | X `trainer_notes` | private vs visible to the client, seen by the client | X |

### 4.2 Trainer mobile

| Screen | Endpoints | Stage 1 work |
|---|---|---|
| TM-01 Attention | X attention (`groupBy`), N coach asks, E check-in inbox | as TW-04 |
| TM-02 Clients | X `GET /clients` | as TW-06 |
| TM-03 Client status | X workspace read, N week read model, N responsiveness | as TW-09/31 |
| TM-04 Exception review | as TW-05 | X |
| TM-05 Check-ins | E inbox | E |
| TM-06 Check-in review (lite) | E review, X notes | X |
| TM-07 More | E `GET /me`, N trainer profile, X preferences, N `GET /config` | N/X |
| TM-08 Role select | E `GET /me` (`permittedRoles`) | E (demo: one dual-role account) |
| TM-09 Activity feed | N `GET /activity/feed?cursor&limit=30&types&rid&since` → `{events:[{id,rid,traineeDisplayName,type,subtype,occurredAt,traineeLocalTime,summary,kcal?,link}],nextCursor}` | N |

### 4.3 Trainee mobile

| Screen | Endpoints | Contracts | DB | Screen-specific states | Stage 1 work |
|---|---|---|---|---|---|
| TR-01 Sign in | N auth endpoints (as TW-01), N `GET /config` | N `auth.ts` | as TW-01 | same as TW-01 | N |
| TR-02 Invite acceptance | N `GET /invitations/preview?token=` (trainer display name only), N `POST /auth/otp/start {purpose:'invite'}`, X `POST /invitations/accept {token, displayName, mobileE164?, password, otpProof}` | X `relationship.ts`, N `auth.ts` | X | expired, revoked, already accepted, code wrong | X/N |
| TR-03 Intake | E onboarding forms; E trainee profile | E | — | — | E |
| TR-04 Waiting | E relationship and onboarding status | E | — | — | E |
| TR-05 Reminder setup | X preferences (`channelPreference`, `whatsappOptIn`, `preferredWorkoutTime`, `traineeTimezone`, `locale`), E device tokens | X `notification.ts` | X prefs, `users.timezone` | WhatsApp "Coming soon" (flag off) | X |
| TR-06 Today | E today's assignments, E effective plan, E check-ins, N `GET /me/day/:date` (+`loggable` flags, totals), N `GET /me/week?start=` (weekly consistency, **no streaks**), E unread count, N `GET /me/coach-notes` | N `week.ts` | — | rest day, nothing assigned, ended | N |
| TR-07 Diet | X meal list, confirm/deviate/skip (late-log rule, kcal per meal and per day); E files | X `meal.ts` | X `meal_compliance` | logged, changed, skipped, logged late, locked ("Closed by coach"), optional item "Not logged" (read-only after its day), superseded ("Replaced by plan update") | X |
| TR-08 Something different | X `POST /meals/assignments/:id/deviate {kind:'logged_foods', items:[{foodId|customFoodId, servingId, quantity}]}`; N trainee food search | X `meal.ts`, N `trainee-food.ts` | X `items_json`, N `trainee_custom_foods` | food not found → custom food | X/N |
| TR-09 Assigned meal plan | E effective plan (meal slots with type/label/time, kcal) | X `plan.ts` | — | — | X |
| TR-10 Workout overview | E workout endpoints (late-log rule) | X `workout.ts` | X | locked, logged late | X |
| TR-11 Active workout | E execution endpoints | E | — | — | E |
| TR-12 Workout summary | E execution get | E | — | no gamification | E |
| TR-13 Progress | E progress | E | — | — | E |
| TR-14 Check-in | E ensure-due, draft, submit, get (pinned form version) | E | — | pending, submitted, reviewed | E (+demo) |
| TR-15 Notifications inbox | X `GET /notifications` (new types), E read | X `notification.ts` | X | — | X |
| TR-16 Reminder settings | X preferences | X | X | WhatsApp "Coming soon" | X |
| TR-17 Quiet hours | E `quietHoursStart/End` (default 22:00–07:00 when null) | E | — | — | X default |
| TR-18 Ask coach on WhatsApp | N `POST /coach-asks {relationshipId, itemType, itemId, topic}` (outbox-capable, idempotent), X relationship read with the trainer's WhatsApp; `wa.me` built client-side with `packages/core/support.ts` | N `coach-ask.ts` | N `coach_asks` | no trainer WhatsApp number → no button | N |
| TR-19 Offline/sync | X `/sync/push` (late-log rule; `409 locked`), E `/sync/pull` | X `sync.ts` | — | conflict, locked | X |
| TR-20 More | E `GET /me`, N `POST /auth/password/set`, X preferences (timezone), N `GET /config` | X | — | — | X |
| TR-21 Widget / Live Activity | none (native) | — | — | — | — |
| TR-22 Ended / reactivation | X relationship read (ended plus a pending reactivation request), N `POST /relationships/:rid/reactivate/confirm`; notifications `reactivation_requested`, `relationship_ended` | X `relationship.ts` | N `reactivation_requests` | ended (read-only), reactivation offered, expired | N |
| TR-23 Deep-link router | N `GET /links/resolve?kind=&id=` → `{role, route, available, reason?}` (kinds: meal, workout, checkin, exception, ask, plan, client, today, note, reactivate) | N `links.ts` | — | unavailable (ended, superseded, not yours) | N |
| TR-24 My meal times | N `GET/PUT /me/meal-times` (05:00–22:00, in order, ≥ 60 min apart) → history `meal_times_changed`, T-MEALTIME trainer notification (merged 15 min), reminders rescheduled | N `meal-times.ts` | N `meal_time_overrides` | invalid order or gap, plan change drops removed slots | N |
| TR-25 Steps | none; `GET /config` `steps_enabled=false` | X `config.ts` | — | hidden while the flag is off | N flag only |
| TR-26 Food search | N `GET /me/foods/search?q=&limit=20` (FTS5, read-only, global plus the own trainer's foods), `GET /me/foods/recent`, `GET /me/foods/index?since=` (offline delta) | N `trainee-food.ts` | 0021 | no results → custom food | N |

### 4.4 Non-screen backend (feeds several screens)

| Item | Where it shows up | Stage 1 work |
|---|---|---|
| Reminder engine v2 (§3.6): unlogged-only, caps, quiet hours 22:00–07:00, hard stop 22:00, back-off, trainee timezone | TR-05/06/15/16/17, TW-31 | Rewrite `packages/core/src/reminder.ts` and `apps/api/src/domain/reminders.ts` and `jobs/reminders.ts` |
| Notification types and pushes: P-MEAL, P-WO, P-EOD, P-CHK, P-CHK-LATE, P-NUDGE, P-PLAN, P-CHK-REV, I-ANS, P-PAUSE, P-NOTE, P-REACT, P-END, plus the trainer types (§4.1, §4.3) | TR-15, TW-03 bell | Extend the enums, add producers |
| WhatsApp Cloud API client, template registry, budget ledger and webhook (§4.2, §4.5, §4.6) behind `wa_otp` and `wa_automation` | none visible (flags off) | New modules, fully tested with a mock |
| Late logging (§3.7, D23/D34) | TR-07/08/10, TW-05/17, sync | Shared decision function, `409 LOCKED` |
| Relationship-writable guard (`assertRelationshipWritable`) | every trainee write | New helper, applied everywhere |
| Library search, redirects and trainee search | TW-13/14/26, TR-08/26 | FTS5 queries, redirect resolution |
| Demo seed | every screen | New command |
