# FitBud demo seed — Phase 1 design (SEED_DESIGN.md)

Source: `/workspace/thefitbud-run` @ `36de932` (detached, read-only). Specs: `/workspace/fitbud-spec/docs/spec` (TW-01..34, TM-01..09, TR-01..26 = 70 screen files) and `/workspace/fitbud-md` (MD1/MD2 + mockups).
Status: Phase 1 (design only). No repo files were changed.

---

## 1. Current seed mechanics

### 1.1 Files
| File | Role |
|---|---|
| `package.json` (root) | `db:reset` → `pnpm --filter @fitbud/api db:reset`; `seed:demo`, `db:seed:library` likewise delegate. |
| `apps/api/package.json` | `predb:reset` builds packages (`@fitbud/core`, `@fitbud/contracts`); `db:reset` = `tsx scripts/db-reset.ts`; `seed:demo` = `tsx scripts/seed-demo.ts`; `db:seed:library` = `tsx scripts/library-seed.ts`; `db:migrate:local` = `wrangler d1 migrations apply fitbud --local --persist-to .wrangler/state`. |
| `apps/api/scripts/db-reset.ts` | ensure `.dev.vars` → `rmSync(.wrangler/state/v3/d1)` (path-guarded) → `pnpm db:migrate:local` → `pnpm db:seed:library` → `pnpm seed:demo`. All via `runCommandSync`. |
| `apps/api/scripts/lib/run-command.ts` | `spawnSync` wrapper; `shell: process.platform === "win32"` — this is what makes `pnpm`/`tsx` resolve on Windows PowerShell (`.cmd` shims). Exits on non-zero. |
| `apps/api/scripts/library-seed.ts` | Runs `seed/library/00_wipe_legacy_dev.sql`, `sql/01_lookups … 06_seed_version.sql`, `07_post_wipe_dev.sql`, then `05_search.sql` again (FTS rebuild) via `wrangler d1 execute fitbud --local --file`. |
| `apps/api/scripts/seed-demo.ts` | Refuses `--remote`. `referenceInstant = process.env.NOW ?? new Date().toISOString()`. Hashes `FitBud-demo-2026`, opens local D1 sqlite read-only via `node:sqlite` (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`) to resolve library rows (`loadDemoLibraryIndex`), calls `buildDemoSeedSql`, writes `.wrangler/demo-seed.sql`, applies it with one `wrangler d1 execute --file`. |
| `apps/api/src/seed/demo/spec.ts` | `DEMO_ACCOUNTS` (19 rows) + password. |
| `apps/api/src/seed/demo/ids.ts` | `demoUuid(...parts)` = sha256(`fitbud-demo-v1|parts…`) → v4-shaped UUID; `sqlQuote`, `localDayStartIso(date,time,tz)`, `addDaysFromLocalDate`. |
| `apps/api/src/seed/demo/build.ts` | `buildDemoSeedSql`: header, `PRAGMA defer_foreign_keys = true`, `wipeAppData()` (DELETE from ~50 app tables, keeps global library + global templates/forms), inserts users/roles/profiles/identities (phones `+91900000000NN` in account order skipping invite), Karan gets an extra trainer role+profile, then `buildDemoHistorySql`. Bio (age/DOB/gender) table `DEMO_TRAINEE_BIO`. Deepak tz = `Asia/Dubai`, others `Asia/Kolkata`. |
| `apps/api/src/seed/demo/personas.ts` | Library slug lists (10 foods, 11 exercises), `buildStandardPlanContent` (one Upper/Lower 4-day plan + 4 meals for everyone), fixed IDs `MEAL_PRESCRIPTION_IDS`, `WORKOUT_DAY_IDS`, `DEMO_CHECKIN_FORM_VERSION_ID = c1000001-0000-4000-8000-000000000011` (global check-in form v1, migration 0029). |
| `apps/api/src/seed/demo/history.ts` | Relationships (default start = ref−27 d; Rohan ref−40 d), onboarding stack, config, one plan + one subscription, ~4 weeks of assignments + compliance/executions (`shouldLogMeal/Workout`), weekly check-ins, persona overlays (exceptions, reminder_states, notifications, coach_asks, reactivation, Dubai meal overrides, custom foods, trainer notes, invitations). `DEMO_PENDING_INVITE_TOKEN = "fitbud-demo-anita-invite-pending"`. |
| `apps/api/src/seed/demo/demo-seed.test.ts` | 670-line vitest that builds seed SQL into sql.js and asserts persona states — the new generator must keep (or deliberately update) these assertions. |
| `apps/api/src/index.ts` (HEAD commit) | Worker reads optional `NOW` env (`.dev.vars`) → `globalThis.FITBUD_NOW`, so the API clock can be frozen to the seed's reference instant (MD1 capture froze Sun 18 Oct 2026). |

Weaknesses of the current seed (why we replace it): every client shares one plan, ~4 weeks of history only, no plan versions/history, generic check-in answers, single subscription version, few resolved exceptions, no WhatsApp ask history depth, 15 trainee clients only, trainer templates thin.

### 1.2 The 19 demo accounts (must stay stable)
Password for all: `FitBud-demo-2026`. IDs are `demoUuid("user", email)`; relationship IDs `demoUuid("relationship", trainerLocal, traineeLocal)`; profile `demoUuid("profile", email)`; role `demoUuid("role", email, role)`. Computed values (verified with node against ids.ts algorithm):

| # | Email | Role | State | Display name | user id | relationship id |
|---|---|---|---|---|---|---|
| 1 | rahul.coach@demo.fitbud.test | trainer | main_trainer | Rahul Verma | 21dde613-caf2-407c-8be2-81e26cf727e2 | — |
| 2 | priya.coach@demo.fitbud.test | trainer | second_trainer | Priya Malhotra | 4d2877eb-5aa6-4cbc-b0e9-25f7761ea82d | — |
| 3 | nova.coach@demo.fitbud.test | trainer | first_run | (empty) | f993d758-7166-4793-8c2f-6220289baf07 | — |
| 4 | anita.invite@demo.fitbud.test | invite | invite_pending | Anita Desai | — (invitation row) | — |
| 5 | vikram.onboarding@demo.fitbud.test | trainee | onboarding_incomplete | Vikram Rao | 3be52bf0-bc9d-4d8a-b623-dd5651f2229b | 2fe7a6d8-4c61-443d-9614-18b4210186ee |
| 6 | sneha.review@demo.fitbud.test | trainee | awaiting_review | Sneha Kulkarni | 644abdbe-0135-49d0-8ad9-a691816abfbb | 6a68b615-c47c-4bfc-a7f8-550becf7878a |
| 7 | aarav.ontrack@demo.fitbud.test | trainee | active_on_track | Aarav Shah | 07fa3bcf-8bca-4352-8ad6-49967bf9736b | 30e514e1-e3f4-4dac-ae4b-5f45e72c3df6 |
| 8 | rohan.slipping@demo.fitbud.test | trainee | slipping | Rohan Mehta | ff2323de-b458-44e3-a5bd-e72f546d69e9 | c422296e-ed7b-4196-a2b4-647096af3002 |
| 9 | meera.ack@demo.fitbud.test | trainee | acknowledged | Meera Iyer | bc6c9470-8f77-49c7-9f9d-5541205877cd | 40248941-017c-48ea-b3df-7cc877c3533b |
| 10 | farhan.paused@demo.fitbud.test | trainee | reminders_paused | Farhan Qureshi | 385d538a-19f6-4d5a-963a-108ef39cd020 | 778a793a-d04e-44bc-b7aa-187f70573275 |
| 11 | ishita.pushoff@demo.fitbud.test | trainee | notifications_off | Ishita Banerjee | 7d554e34-9751-4f0e-bf7e-6891332f4d0b | 0a72ab36-f042-46dc-bceb-67725d78b46a |
| 12 | kavya.ended@demo.fitbud.test | trainee | ended | Kavya Menon | 7afd8991-5cdd-4eb0-8953-861c567305f4 | b9f01670-8acc-45f6-adab-d7728bca88a6 |
| 13 | nikhil.reactivate@demo.fitbud.test | trainee | reactivation_pending | Nikhil Kapoor | c37ace12-1d22-47e3-b883-6a3ff31a3acd | 8919b5c0-73fa-495a-958e-e9333a41f4e7 |
| 14 | deepak.dubai@demo.fitbud.test | trainee | dubai_meal_times | Deepak Nair | 9035c4ad-52ad-4446-8734-c2519e84e5dc | f2a64fdb-96ad-46f3-a95e-99151b4a25f1 |
| 15 | arjun.attention@demo.fitbud.test | trainee | attention_hole | Arjun Kapoor | e5a3f4d1-7572-4440-b732-a68facf17012 | 88fa70b1-6e69-498c-8211-0dcb2a021556 |
| 16 | neha.attention@demo.fitbud.test | trainee | attention_hole | Neha Reddy | 697f43db-3b6e-41e8-aba3-f8c5caab5aaa | 6f4220d5-db4b-40f6-8b38-6411a25db656 |
| 17 | tanvi.attention@demo.fitbud.test | trainee | attention_hole | Priya Sharma | bf2ac327-ebda-4e7f-8a25-94ec5571bdb7 | dae105f6-918a-4fbf-a205-04ac210e5824 |
| 18 | lakshmi.foods@demo.fitbud.test | trainee | food_deviations | Lakshmi Iyer | 20d34f29-93b1-4ac9-87dc-69f984ebdfe9 | 66bb4846-308b-4bb1-9e3f-c41f234cbbdf |
| 19 | karan.dual@demo.fitbud.test | trainee | dual_role | Karan Mehra | f617d15b-8e28-44bf-8651-6812ccf60e5e | 2f866122-3aea-4017-87bf-43c0555feb2f |

Other stable IDs: invitations `demoUuid("invite","anita-pending"|"anita-expired"|"anita-revoked"|"kavya-priya")`; Anita pending token `fitbud-demo-anita-invite-pending` (hash = sha256 hex). Karan's trainer profile `demoUuid("profile-trainer", email)`. Phones: `+9190000000NN` where NN = account order 01..18 skipping the invite row (rahul=01, priya=02, nova consumes 03 but stores no phone, vikram=04 … karan=18 — keep the same counter). Nova has no display name (TW-02 first-run).

**Stability rule for the new generator:** keep `NAMESPACE = "fitbud-demo-v1"` and all existing id recipes above; new personas use new emails `firstname.tag@demo.fitbud.test` and the same recipes. New child-entity IDs use `demoUuid(entity, relLocalKey, localDate, slot)` so reruns are byte-identical for the same `NOW`.

### 1.3 Hook point for the generator (Windows-safe)
- Keep the chain in `db-reset.ts` unchanged: it already shells `pnpm seed:demo` through `runCommandSync` (`shell:true` on win32). **Hook = `buildDemoHistorySql()` call inside `buildDemoSeedSql` (`src/seed/demo/build.ts`)** — replace it with `generateDemoWorld({ referenceDate, referenceInstant, libraryIndex, seed })` from a new module `src/seed/demo/generator/index.ts`. The generator is pure TS (no fs, no child processes, no shell syntax), so it is OS-agnostic and testable in vitest/sql.js.
- `seed-demo.ts` stays the only I/O layer: it reads `NOW` and optional `SEED` (default `"fitbud-demo-v1"`) from `process.env`, writes SQL files to `.wrangler/`, then applies them with `spawnSync("pnpm", [... "wrangler","d1","execute","fitbud","--local","--persist-to",".wrangler/state","--file", f], spawnOptions())` — argument arrays, never a concatenated command line, so PowerShell quoting is never involved. Use `path.join` for every path.
- PowerShell usage: `pnpm db:reset` (or `$env:NOW="2026-10-18T04:30:00.000Z"; pnpm db:reset`). Document also adding `NOW=` to `.dev.vars` so the Worker clock matches.
- Library index: extend `loadDemoLibraryIndex` to resolve all template foods/exercises by **slug** (IDs are already deterministic from the library bundle, but resolving by slug guards against a bundle bump). Fail loudly if any slug is missing.
- Because the SQL will grow (~60–90k rows), split into multiple files (see §6.6) applied in sequence; `wrangler d1 execute --file` handles each file as a batch.

## 2. Schema-to-screen data map

Derived by applying all 30 migrations (`apps/api/drizzle/0000…0029`) to sqlite and reading `pragma table_info/foreign_key_list/index_list`; enums from `apps/api/src/db/schema.ts` (Drizzle text enums are **not** DB CHECKs — the API validates, so the generator must self-validate) and `packages/contracts`. Notation: `col?` = nullable, `*PK`, `a→t` = FK. All timestamps are ISO-8601 UTC strings; `local_date` is the trainee's civil date `YYYY-MM-DD`; nutrient `_scaled` ints use `NUTRIENT_SCALE` from `@fitbud/contracts`.

**Hard constraints the generator must respect**
- `onboarding_form_versions` and `checkin_form_versions` have **insert-only triggers** (UPDATE aborts). Never UPDATE them; DELETE is allowed. Current `wipeAppData()` does *not* delete trainer-owned form templates/versions — add `DELETE FROM checkin_form_versions WHERE scope='trainer'; DELETE FROM checkin_form_templates WHERE ownership='trainer';` (same for onboarding) before deleting users. Do not insert a second global check-in version.
- Runtime exception evaluator (`apps/api/src/domain/exceptions.ts`, rule `mvp.v2`) looks back **3 days** (`DETECTION_LOOKBACK_DAYS`) and will auto-create/activate/resolve exceptions on API start, capped at **10 open per relationship**; it skips sources that already have any open **or resolved** exception (`exceptionKey` = type+source). ⇒ For every unlogged/skipped/deviated source in the last 3 local days the seed must either log it or pre-insert an exception for it, otherwise the API invents random-ID rows at first request (the Batch-0 "108 overdue meals" bug). Keep ≤10 open per client.
- Adherence (`deriveAdherenceState`, 14-day window `ADHERENCE_WINDOW_DAYS`): any open critical/attention exception ⇒ `needs_attention`; no qualifying observation in 14 d ⇒ `no_recent_data`; not active ⇒ `not_available`; else `on_track`.
- Renewal state from `renews_on` vs trainer-local today (7-day upcoming window).
- `checkins` UNIQUE(rel, local_date); `meal_compliance`/`workout_executions` UNIQUE(assignment); assignment UNIQUE(rel, plan_version, day/prescription, date). One active relationship per trainee.
- Never write a timestamp after `NOW` (`clampIsoToNow`), except future assignments/check-in windows/renewals/expiries.

### 2.1 App tables
#### auth_otps
cols: id*PK, identifier_hash, code_hash, purpose, expires_at, attempts, channels_sent, consumed_at?, invalidated_at?, created_at, ip_hash?
UNIQUE: (id)
CHECK: `purpose` IN ('login', 'reset', 'invite')
Enums/notes: purpose login|reset|invite
Screens: leave empty

#### auth_rate_limits
cols: bucket_key*PK, window_start, count
UNIQUE: (bucket_key)
Screens: leave empty

#### change_log
cols: id*PK, sequence, entity_type, record_id, change_kind, server_version?, coaching_relationship_id, trainee_user_id, changed_at
FK: trainee_user_id→users; coaching_relationship_id→coaching_relationships
UNIQUE: (sequence) (id)
Enums/notes: sync feed; entity_type …; change_kind upsert|tombstone
Screens: TR-19 (generator: leave empty; app rebuilds on pull)

#### checkin_form_templates
cols: id*PK, ownership, trainer_user_id?, name, description?, created_at, updated_at
FK: trainer_user_id→users
UNIQUE: (id)
CHECK: (ownership='global' AND trainer_user_id IS NULL) OR (ownership='trainer' AND trainer_user_id IS NOT NULL)
Enums/notes: ownership global|trainer
Screens: TW-23 Check-ins tab, TW-25

#### checkin_form_versions
cols: id*PK, template_id, key, version, scope, trainer_user_id?, schema_json, created_at
FK: trainer_user_id→users; template_id→checkin_form_templates
UNIQUE: (trainer_user_id,key,version) (key,version) (template_id,version) (id)
Enums/notes: schema_json fields (short_text,long_text,single_choice,multiple_choice,number,yes_no,measurement,photo_intent{front|side|back|any},scale_1_5); INSERT-ONLY trigger; global v1 id c1000001-…-011
Screens: TW-25, TR-14, TW-20

#### checkin_reviews
cols: id*PK, checkin_id, coaching_relationship_id, trainer_user_id, outcome, notes?, created_at, updated_at
FK: trainer_user_id→users; coaching_relationship_id→coaching_relationships; checkin_id→checkins
UNIQUE: (checkin_id) (id)
Enums/notes: outcome acknowledged|needs_follow_up|adjust_coaching; UNIQUE(checkin)
Screens: TW-20, TW-19, TR-14 (reviewed), notification checkin_reviewed

#### checkin_schedules
cols: id*PK, coaching_configuration_id, coaching_relationship_id, cadence, due_window_hours, created_at, updated_at, preferred_checkin_form_version_id?
FK: coaching_relationship_id→coaching_relationships; coaching_configuration_id→coaching_configurations; preferred_checkin_form_version_id→checkin_form_versions
UNIQUE: (coaching_configuration_id) (id)
Enums/notes: cadence weekly|biweekly|monthly (7/14/28 d); due_window_hours; preferred_checkin_form_version_id
Screens: TW-11, TW-19, TR-14

#### checkins
cols: id*PK, coaching_relationship_id, checkin_schedule_id?, local_date, window_starts_at, window_ends_at, record_status, record_version, definition_version, answers_json?, submitted_at?, created_at, updated_at, checkin_form_version_id
FK: checkin_schedule_id→checkin_schedules; coaching_relationship_id→coaching_relationships
UNIQUE: (coaching_relationship_id,local_date) (id)
Enums/notes: record_status draft|submitted (view: scheduled|due|submitted|reviewed|overdue); UNIQUE(rel,local_date); answers_json {wellbeing, notes, bodyWeightKg, photoIntent, fieldAnswers{}}; pinned checkin_form_version_id
Screens: TR-14, TW-19, TW-20, TW-22, TM-05, TM-06, TW-04

#### client_invitations
cols: id*PK, trainer_user_id, recipient_email, recipient_display_name?, recipient_whatsapp_e164?, token_hash, status, expires_at, accepted_user_id?, onboarding_form_template_version_id, created_at, updated_at, reissued_from_id?, revoked_at?, email_sent_at?
FK: onboarding_form_template_version_id→onboarding_form_versions; accepted_user_id→users; trainer_user_id→users; reissued_from_id→client_invitations
UNIQUE: (token_hash) (id)
Enums/notes: status: pending|accepted|expired|revoked; token_hash UNIQUE; reissued_from_id
Screens: TW-04 Getting started, TW-06 (Invited), TW-07, TW-08, TR-02

#### coach_asks
cols: id*PK, relationship_id, trainee_user_id, item_type, item_id, topic, asked_at, last_asked_at, ask_count, status, answered_at?, answered_by?, trainer_note_id?
FK: trainer_note_id→trainer_notes; answered_by→users; trainee_user_id→users; relationship_id→coaching_relationships
UNIQUE: (id)
CHECK: `item_type` IN ('meal_assignment', 'workout_assignment', 'exercise_execution', 'checkin', 'plan_version') | `status` IN ('open', 'answered', 'expired')
Enums/notes: item_type meal_assignment|workout_assignment|exercise_execution|checkin|plan_version; topic (e.g. portion_size, substitute, pain, form, timing); status open|answered|expired; ask_count
Screens: TR-18, TW-32, TW-04 Asked you, TM-01

#### coaching_configurations
cols: id*PK, coaching_relationship_id, status, record_version, notes?, configured_at?, activated_at?, created_at, updated_at, version_number, goal_short?, goal_description?
FK: coaching_relationship_id→coaching_relationships
UNIQUE: (coaching_relationship_id) (coaching_relationship_id) (coaching_relationship_id,version_number) (id)
Enums/notes: status draft|configured|active|superseded; version_number; goal_short/goal_description
Screens: TW-11, TW-09a goal chip, TW-06 goal filter

#### coaching_relationships
cols: id*PK, trainer_user_id, trainee_user_id, status, invitation_id?, started_at, ended_at?, created_at, updated_at, ended_by_user_id?, end_reason?, reactivated_at?
FK: invitation_id→client_invitations; trainee_user_id→users; trainer_user_id→users; ended_by_user_id→users
UNIQUE: (trainer_user_id,trainee_user_id) (id)
Enums/notes: status: active|ended; UNIQUE(trainer,trainee); end_reason, reactivated_at. Derived onboardingStatus: invited→onboarding_pending→onboarding_submitted→coaching_ready→active→ended
Screens: every trainer screen; TW-06 filters, TW-30, TR-22

#### dev_mail_outbox
cols: id*PK, to_address, template, subject, text_body, html_body?, created_at
UNIQUE: (id)
Screens: leave empty

#### device_tokens
cols: id*PK, user_id, platform, provider, token, installation_id, status, last_seen_at, created_at, updated_at
FK: user_id→users
UNIQUE: (user_id,installation_id) (token) (id)
Enums/notes: platform ios|android|web; provider fcm; status active|revoked
Screens: TW-29/TR-16 permission states, TW-31

#### exception_actions
cols: id*PK, exception_id, trainer_user_id, action, note?, created_at
FK: trainer_user_id→users; exception_id→exceptions
UNIQUE: (id)
Enums/notes: action acknowledge|resolve; note
Screens: TW-05 timeline, TW-21

#### exceptions
cols: id*PK, coaching_relationship_id, type, status, rule_version, source_entity_type, source_entity_id, summary, details_json?, detected_at, activated_at?, acknowledged_at?, resolved_at?, created_at, updated_at, severity, resolution_outcome?, resolution_note?, closed_reason?, source_logged_late_at?
FK: coaching_relationship_id→coaching_relationships
UNIQUE: (id)
Enums/notes: type missed_workout|skipped_workout|overdue_meal|skipped_meal|meal_deviation|meal_logged_later|overdue_checkin; severity critical|attention; status detected|active|acknowledged|resolved; source_entity_type workout_assignment|meal_assignment|checkin; rule_version 'mvp.v2'; resolution_outcome/note, closed_reason, source_logged_late_at
Screens: TW-04, TW-05, TM-01, TM-04, TW-09, TW-06 adherence, TW-21

#### exercise_executions
cols: id*PK, workout_execution_id, exercise_id, name, order, status, created_at, updated_at
FK: workout_execution_id→workout_executions
UNIQUE: (id)
Enums/notes: status pending|completed|skipped
Screens: TR-11, TW-17 workout detail

#### feature_flags
cols: key*PK, enabled, updated_at, updated_by?
UNIQUE: (key)
Screens: leave as migrations

#### idempotency_records
cols: id*PK, actor_user_id, operation, key_hash, request_fingerprint, response_status, response_body, created_at, expires_at
UNIQUE: (actor_user_id,operation,key_hash) (id)
Screens: leave empty

#### interventions
cols: id*PK, coaching_relationship_id, trainer_user_id, exception_id?, checkin_id?, kind, summary, resulting_plan_version_id?, created_at, updated_at
FK: resulting_plan_version_id→plan_versions; checkin_id→checkins; exception_id→exceptions; trainer_user_id→users; coaching_relationship_id→coaching_relationships
UNIQUE: (id)
Enums/notes: kind note|acknowledge|resolve|plan_adjustment|schedule_checkin; resulting_plan_version_id
Screens: TW-05, TW-20, TW-21

#### meal_assignments
cols: id*PK, coaching_relationship_id, plan_id, plan_version_id, meal_prescription_id, meal_name, meal_prescription_json, local_date, window_starts_at, window_ends_at, photo_required, created_at, updated_at, schedule_status, superseded_at?, superseded_by_plan_version_id?
FK: plan_version_id→plan_versions; plan_id→plans; coaching_relationship_id→coaching_relationships
UNIQUE: (coaching_relationship_id,plan_version_id,meal_prescription_id,local_date) (id)
Enums/notes: schedule_status; window_starts/ends_at; photo_required; meal_prescription_json snapshot
Screens: TR-06, TR-07, TW-17, TM-03

#### meal_compliance
cols: id*PK, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, outcome, record_version, logged_at, deviation_kind?, notes?, photo_required, photo_intent_json?, created_at, updated_at, media_asset_id?, items_json?, kcal_scaled?, protein_scaled?, carbs_scaled?, fat_scaled?, logged_late, logged_after_resolve, client_logged_at?
FK: trainee_user_id→users; plan_version_id→plan_versions; coaching_relationship_id→coaching_relationships; assignment_id→meal_assignments
UNIQUE: (assignment_id) (id)
Enums/notes: outcome confirmed|modified|skipped; deviation_kind portion_adjustment|substitute|restaurant|repeat_recent|manual|other|logged_foods; items_json; kcal/protein/carbs/fat _scaled; logged_late; logged_after_resolve; UNIQUE(assignment)
Screens: TR-07, TR-08, TR-26, TW-17, TM-09, TW-05 evidence

#### meal_time_overrides
cols: relationship_id*PK, slot_key*PK, day_pattern*PK, time, updated_at
FK: relationship_id→coaching_relationships
UNIQUE: (relationship_id,slot_key,day_pattern)
CHECK: `day_pattern` IN ('all', 'weekdays', 'weekends')
Enums/notes: PK(rel,slot_key,day_pattern all|weekdays|weekends); time HH:MM
Screens: TR-24, TW-11 meal times

#### measurements
cols: id*PK, coaching_relationship_id, trainee_user_id, type, value, unit, observed_at, source, checkin_id?, media_asset_id?, record_version, created_at, updated_at
FK: media_asset_id→media_assets; checkin_id→checkins; trainee_user_id→users; coaching_relationship_id→coaching_relationships
UNIQUE: (id)
Enums/notes: type body_weight_kg|waist_cm|hip_cm|chest_cm|other; source trainee_entry|checkin|trainer_entry
Screens: TW-18, TR-13, TW-20 deltas, TW-09 progress summary

#### media_assets
cols: id*PK, coaching_relationship_id, uploader_user_id, media_type, status, object_key, content_type, byte_size?, original_filename?, domain_entity_type?, domain_entity_id?, record_version, created_at, updated_at, uploaded_at?
FK: uploader_user_id→users; coaching_relationship_id→coaching_relationships
UNIQUE: (object_key) (id)
Enums/notes: media_type progress_photo|meal_photo|checkin_photo|avatar; status pending_upload|ready|failed; domain_entity_type meal_compliance|progress_entry|measurement|checkin; object_key UNIQUE
Screens: TW-18 photos, TW-20, TR-13, TR-07 thumbnails

#### notification_deliveries
cols: id*PK, notification_id, device_token_id?, channel, provider_status, provider_message_id?, failure_category?, attempt_number, accepted_at?, created_at, updated_at
FK: device_token_id→device_tokens; notification_id→notifications
UNIQUE: (id)
Enums/notes: channel push; provider_status queued|accepted|failed|skipped
Screens: TW-31

#### notification_preferences
cols: user_id*PK, push_enabled, workout_reminder, meal_reminder, checkin_reminder, quiet_hours_start?, quiet_hours_end?, created_at, updated_at, subscription_renewal_reminder, channel_preference, whatsapp_opt_in_granted, whatsapp_opt_in_at?, whatsapp_opt_in_source?, whatsapp_opt_in_text_version?, preferred_workout_time?, locale?, trainer_categories_json, daily_summary_reminder
FK: user_id→users
UNIQUE: (user_id)
Enums/notes: push_enabled, 4+1 category booleans, quiet hours, channel_preference app|app_and_whatsapp, whatsapp_opt_in_*, preferred_workout_time, locale, trainer_categories_json
Screens: TR-05, TR-16, TR-17, TW-29, TW-31, TW-05 quiet-hours copy

#### notifications
cols: id*PK, recipient_user_id, coaching_relationship_id?, notification_type, domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at?, opened_at?, priority?, merge_group?, payload_json?, expires_at?
FK: coaching_relationship_id→coaching_relationships; recipient_user_id→users
UNIQUE: (dedupe_key) (id)
Enums/notes: notification_type (20 types incl. trainer_*); state pending|queued|delivered|read|failed|suppressed|deferred; dedupe_key UNIQUE; domain_entity_type workout_assignment|meal_assignment|checkin|coaching_relationship
Screens: TR-15, TW-03 bell, TW-31 responsiveness, TR-21

#### nutrition_expectations
cols: id*PK, coaching_configuration_id, meals_per_day, confirmation_window_hours, photo_requirement, created_at, updated_at
FK: coaching_configuration_id→coaching_configurations
UNIQUE: (coaching_configuration_id) (id)
Enums/notes: meals_per_day, confirmation_window_hours, photo_requirement none|selected_meals|all_meals
Screens: TW-11, TR-07 photo prompts

#### onboarding_form_responses
cols: id*PK, coaching_relationship_id, onboarding_form_version_id, trainee_user_id, status, answers_json, version, submitted_at?, created_at, updated_at
FK: trainee_user_id→users; onboarding_form_version_id→onboarding_form_versions; coaching_relationship_id→coaching_relationships
UNIQUE: (coaching_relationship_id) (id)
Enums/notes: status draft|submitted; UNIQUE(relationship)
Screens: TR-03, TW-10, TW-04 Getting started

#### onboarding_form_templates
cols: id*PK, ownership, trainer_user_id?, name, description?, created_at, updated_at
FK: trainer_user_id→users
UNIQUE: (id)
CHECK: (ownership='global' AND trainer_user_id IS NULL) OR (ownership='trainer' AND trainer_user_id IS NOT NULL)
Enums/notes: ownership global|trainer (CHECK: global ⇒ trainer_user_id NULL)
Screens: TW-23 Onboarding tab, TW-24, TW-07 form picker

#### onboarding_form_versions
cols: id*PK, template_id, key, version, scope, trainer_user_id?, schema_json, created_at
FK: trainer_user_id→users; template_id→onboarding_form_templates
UNIQUE: (trainer_user_id,key,version) (key,version) (template_id,version) (id)
Enums/notes: scope global|trainer; schema_json fields (short_text,long_text,single_choice,multiple_choice,number,yes_no + legacy text/textarea/select; section, highlight); INSERT-ONLY trigger
Screens: TW-24, TR-03

#### onboarding_reviews
cols: id*PK, coaching_relationship_id, onboarding_form_response_id, trainer_user_id, outcome, created_at
FK: trainer_user_id→users; onboarding_form_response_id→onboarding_form_responses; coaching_relationship_id→coaching_relationships
UNIQUE: (onboarding_form_response_id) (id)
Enums/notes: outcome: coaching_ready
Screens: TW-10 (Marked ready), TR-04

#### plan_assignment_policies
cols: plan_version_id*PK, diet_adjustment_scope?, diet_scope_local_date?, future_meal_plan_version_id?, consistency_ack_fingerprint?
FK: future_meal_plan_version_id→plan_versions; plan_version_id→plan_versions
UNIQUE: (plan_version_id)
Enums/notes: diet_adjustment_scope today_onward|today_only; consistency_ack_fingerprint
Screens: TW-15, TW-12 consistency ack

#### plan_templates
cols: id*PK, ownership, trainer_user_id?, title, template_type, content_json, record_version, created_at, updated_at
FK: trainer_user_id→users
UNIQUE: (id)
CHECK: (ownership='global' AND trainer_user_id IS NULL) OR (ownership='trainer' AND trainer_user_id IS NOT NULL)
Enums/notes: ownership global|trainer; template_type workout|nutrition|combined; content_json PlanContent
Screens: TW-23, TW-27, TW-12 start from template

#### plan_versions
cols: id*PK, plan_id, version_number, status, record_version, content_json, creation_source, published_at?, effective_from?, effective_to?, created_at, updated_at, source_template_id?
FK: plan_id→plans
UNIQUE: (plan_id,version_number) (id)
Enums/notes: status draft|published|scheduled|effective|superseded; creation_source blank|previous_version|template|adjustment; content_json = PlanContent {workoutDays[], mealPrescriptions[]}; effective_from/to
Screens: TW-12 versions list, TW-13, TW-14, TW-16, TW-09 plan card, TR-09, TR-10

#### plans
cols: id*PK, coaching_relationship_id, title, created_at, updated_at
FK: coaching_relationship_id→coaching_relationships
UNIQUE: (id)
Enums/notes: one per relationship (title)
Screens: TW-12

#### progress_entries
cols: id*PK, coaching_relationship_id, trainee_user_id, entry_type, title?, body?, observed_at, media_asset_id?, record_version, created_at, updated_at
FK: media_asset_id→media_assets; trainee_user_id→users; coaching_relationship_id→coaching_relationships
UNIQUE: (id)
Enums/notes: entry_type progress_photo|note|milestone
Screens: TW-18, TR-13

#### reactivation_requests
cols: id*PK, relationship_id, trainer_user_id, status, intake_update_requested, expires_at, created_at, resolved_at?
FK: trainer_user_id→users; relationship_id→coaching_relationships
UNIQUE: (id)
CHECK: `status` IN ('pending', 'confirmed', 'cancelled', 'expired')
Enums/notes: status pending|confirmed|cancelled|expired; expires_at (14 d)
Screens: TW-30, TR-22

#### reminder_rules
cols: id*PK, coaching_relationship_id, reminder_type, enabled, created_at, updated_at
FK: coaching_relationship_id→coaching_relationships
UNIQUE: (coaching_relationship_id,reminder_type) (id)
Enums/notes: reminder_type workout|meal|checkin|subscription_renewal _reminder; enabled
Screens: TW-11 reminders, TW-31

#### reminder_states
cols: trainee_user_id*PK, consecutive_ignores, mode, paused_until?, last_evaluated_at?, updated_at
FK: trainee_user_id→users
UNIQUE: (trainee_user_id)
Enums/notes: consecutive_ignores, mode normal|paused (backoff), paused_until
Screens: TW-31, TR-06 paused banner, TW-04 Re-engage

#### scheduled_jobs
cols: id*PK, job_type, dedupe_key, due_at, state, domain_entity_type?, domain_entity_id?, attempt_count, last_error_category?, created_at, updated_at
UNIQUE: (dedupe_key) (id)
Enums/notes: state pending|processing|completed|failed
Screens: (none; leave empty)

#### set_executions
cols: id*PK, exercise_execution_id, set_target_id, order, status, prescribed_reps?, prescribed_load_label?, actual_reps?, actual_load_label?, completed_at?, created_at, updated_at
FK: exercise_execution_id→exercise_executions
UNIQUE: (id)
Enums/notes: status pending|completed|modified|skipped; prescribed vs actual reps/load_label
Screens: TR-11, TR-12, TW-17, TW-18 strength trend

#### subscription_versions
cols: id*PK, coaching_relationship_id, version_number, plan_name, payment_frequency, starts_on, renews_on, created_at
FK: coaching_relationship_id→coaching_relationships
UNIQUE: (coaching_relationship_id,version_number) (id)
Enums/notes: payment_frequency weekly|monthly|quarterly|yearly; plan_name; starts_on/renews_on → renewalState current|upcoming(≤7d)|due(0)|expired(<0)
Screens: TW-04 Renewals, TW-09/09a renewal chip, TW-11, TR-20

#### sync_mutations
cols: id*PK, mutation_id, actor_user_id, idempotency_key, operation, entity_type, record_id?, result_status, server_version?, result_body, created_at
FK: actor_user_id→users
UNIQUE: (actor_user_id,idempotency_key) (actor_user_id,mutation_id) (id)
Enums/notes: result_status applied|already_applied|rejected|conflicted
Screens: TR-19 (seed 1 conflicted row for one persona)

#### tracking_requirements
cols: id*PK, coaching_configuration_id, require_body_weight, require_progress_photos, require_session_rpe, created_at, updated_at
FK: coaching_configuration_id→coaching_configurations
UNIQUE: (coaching_configuration_id) (id)
Enums/notes: require_body_weight, require_progress_photos, require_session_rpe
Screens: TW-11, TR-12 RPE, TR-14

#### trainee_custom_foods
cols: id*PK, trainee_user_id, relationship_id, name, kcal_scaled, protein_scaled?, carbs_scaled?, fat_scaled?, serving_label, created_at
FK: relationship_id→coaching_relationships; trainee_user_id→users
UNIQUE: (id)
Enums/notes: kcal/macros scaled; serving_label
Screens: TR-26, TR-08

#### trainee_profiles
cols: id*PK, user_id, display_name, created_at, updated_at, date_of_birth?, gender?
FK: user_id→users
UNIQUE: (user_id) (id)
Enums/notes: date_of_birth, gender
Screens: TW-09a header (age/gender), TR-20

#### trainer_notes
cols: id*PK, coaching_relationship_id, trainer_user_id, checkin_id?, body, created_at, updated_at, visibility, subject_type?, subject_id?, shared_at?, unshared_at?, seen_at?
FK: checkin_id→checkins; trainer_user_id→users; coaching_relationship_id→coaching_relationships
UNIQUE: (id)
Enums/notes: visibility private|client; subject_type/id; shared_at/unshared_at/seen_at
Screens: TW-34, TW-20, TW-21, TR-06 coach note card, TR-21 lock-screen coach

#### trainer_profiles
cols: id*PK, user_id, display_name, created_at, updated_at, whatsapp_e164?
FK: user_id→users
UNIQUE: (user_id) (id)
Enums/notes: display_name '' ⇒ first-run; whatsapp_e164
Screens: TW-02, TW-28, TR-18 (trainer number)

#### user_identities
cols: user_id*PK, email?, email_norm?, mobile_e164?, password_hash?, password_updated_at?, failed_login_count, locked_until?, created_at, updated_at
FK: user_id→users
UNIQUE: (mobile_e164) (email_norm) (user_id)
Enums/notes: email_norm, mobile_e164 UNIQUE; password_hash PBKDF2
Screens: TW-01, TR-01 (password + OTP)

#### user_roles
cols: id*PK, user_id, role, created_at
FK: user_id→users
UNIQUE: (user_id,role) (id)
Enums/notes: role: trainer|trainee; UNIQUE(user_id,role)
Screens: TW-01 role gate, TM-08 role select (Karan)

#### users
cols: id*PK, firebase_uid, account_state, timezone, created_at, updated_at
UNIQUE: (firebase_uid) (id)
Enums/notes: account_state: active|disabled; timezone IANA (Asia/Kolkata default; Deepak Asia/Dubai; one new persona Europe/London)
Screens: all (auth); TW-01, TR-01, TM-08

#### web_sessions
cols: id*PK, user_id, token_hash, expires_at, revoked_at?, created_at, last_seen_at
FK: user_id→users
UNIQUE: (token_hash) (id)
Screens: leave empty

#### whatsapp_ledger
cols: id*PK, month_key, template_key, message_id?, est_cost_paise, cost_paise?, status, created_at
FK: message_id→whatsapp_messages
UNIQUE: (id)
Screens: leave empty

#### whatsapp_messages
cols: id*PK, template_key, to_hash, wamid?, status, error_code?, relationship_id?, trainee_user_id?, created_at, updated_at
FK: trainee_user_id→users; relationship_id→coaching_relationships
UNIQUE: (id)
Enums/notes: status; template_key
Screens: (flag off) leave empty

#### whatsapp_opt_outs
cols: user_id*PK, at, source
FK: user_id→users
UNIQUE: (user_id)
Screens: optional 1 row (opt-out persona)

#### whatsapp_templates
cols: key*PK, name, category, language, status, version, body_json, updated_at
UNIQUE: (key)
Enums/notes: 5 drafts (W-OTP, W-FB, W-CHK, W-PLAN, W-RENEW) from migrations — do not touch

#### whatsapp_webhook_events
cols: id*PK, received_at, kind
UNIQUE: (id)
Screens: leave empty

#### workout_assignments
cols: id*PK, coaching_relationship_id, plan_id, plan_version_id, workout_day_id, workout_day_name, workout_day_json, local_date, window_starts_at, window_ends_at, created_at, updated_at, schedule_status, superseded_at?, superseded_by_plan_version_id?
FK: plan_version_id→plan_versions; plan_id→plans; coaching_relationship_id→coaching_relationships
UNIQUE: (coaching_relationship_id,plan_version_id,workout_day_id,local_date) (id)
Enums/notes: schedule_status scheduled|superseded; UNIQUE(rel,version,day,date); workout_day_json snapshot
Screens: TR-06, TR-10, TW-17, TM-03 week strip, TR-21

#### workout_executions
cols: id*PK, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, status, record_version, started_at, paused_at?, completed_at?, session_rpe?, require_session_rpe, created_at, updated_at, logged_late, client_logged_at?
FK: trainee_user_id→users; plan_version_id→plan_versions; coaching_relationship_id→coaching_relationships; assignment_id→workout_assignments
UNIQUE: (assignment_id) (id)
Enums/notes: status started|paused|completed|modified|skipped; session_rpe; logged_late; UNIQUE(assignment)
Screens: TR-10/11/12, TW-17, TM-09, TW-21

#### workout_expectations
cols: id*PK, coaching_configuration_id, sessions_per_week, completion_window_hours, created_at, updated_at
FK: coaching_configuration_id→coaching_configurations
UNIQUE: (coaching_configuration_id) (id)
Enums/notes: sessions_per_week, completion_window_hours
Screens: TW-11, TW-12 consistency warnings

### 2.2 Library tables (read-only, loaded by `db:seed:library`; reference by id/slug)
equipment, exercise_categories, exercise_library_aliases, exercise_library_equipment, exercise_library_instructions, exercise_library_items, exercise_library_media, exercise_library_muscles, exercise_library_relations, food_library_aliases, food_library_items, food_library_nutrients, food_library_recipe_ingredients, food_library_servings, library_id_redirects, library_seed_versions, library_sources, logging_types, movement_patterns, muscles, nutrients, serving_units. Key: `food_library_items` (slug, energy_kcal/protein/carbs/fat `_scaled` per basis, `default_serving_id`, diet_tags_json, meal_types_json), `food_library_servings`, `exercise_library_items` (slug, name, category_code, movement_pattern_code, logging_type_code, equipment_json, difficulty).

### 2.3 Screen → data states the seed must demonstrate
UI-only states (skeleton, offline, network error, validation, rate-limit toasts) need no data and are omitted except where data drives them. "Who" = persona that carries it (see §4). Rahul (main trainer) must show every trainer state at once.

| Screen | Data states to demonstrate (seeded) | Who |
|---|---|---|
| TW-01 / TR-01 Sign in | trainer, trainee-only (web message), dual role, first-run trainer | Rahul, Sneha, Karan, Nova |
| TW-02 First run | trainer with empty display name | Nova |
| TW-03 Shell | non-zero badge counts (attention, check-ins, asks) | Rahul |
| TW-04 Home | Needs attention **>8 clients** (so "View all (N)") mixing critical+attention with ages 0–9 d and "+N more"; Asked-you ≥3 open (incl. pain topic); Check-ins to review 5–8; Renewals upcoming/due/expired (≥1 each); Reviewed-still-open (acknowledged) 3–5; Getting started (pending invite + submitted intake + draft intake); Re-engage (2–3 clients silent 2–3 d with ignored reminders) | Rahul's book |
| TW-05 / TM-04 Exception drawer | detected/active critical, active attention, acknowledged (with action+note), resolved (outcome+note, "Resolved by you · date"), ended-relationship read-only, logged-late-after-detection (`source_logged_late_at`), nudge already sent (notification activity_nudge today), client in quiet hours now | various |
| TW-06 / TM-02 Roster | 21 Rahul relationships + pending invite (22 rows; with `limit=10` or the mobile page size this exercises "Load more"); every every lifecycle (invited, onboarding_pending, onboarding_submitted, coaching_ready, active, ended); every adherence (on_track, needs_attention, no_recent_data, not_available); ≥8 distinct goals | Rahul |
| TW-07 Add client | duplicate pending invite email; email of an ended client (reactivate prompt); email of a client active with another coach | Anita, Kavya, Lakshmi (Priya) |
| TW-08 Invite detail | pending, expired, revoked, accepted (redirect), reissued chain | Anita ×3, Kavya-Priya |
| TW-09 / TW-09a Overview + header | full active client (plan, renewal, 1 open exception, next check-in, 5 recent activity, progress summary); coaching_ready no plan ("No plan yet"); not-ready guided card; ended banner; 404 (other trainer's client) | Aarav, new coaching_ready persona, Vikram/Sneha, Kavya, Lakshmi |
| TW-10 Onboarding review | submitted awaiting review (sections + highlighted "Worth noting"); draft only ("Last saved 2 h ago"); already reviewed ("Marked ready 13 Oct") | Sneha, Vikram, everyone else |
| TW-11 Configure | none (404 → defaults), draft, configured-not-activated, active v1 + superseded history (v2 after goal change), each cadence weekly/biweekly/monthly, each photo requirement, reminders on/off, ended read-only | various |
| TW-12 Plan tab | no plan; effective v1 only; multi-version history (superseded v1, v2 effective, v3 scheduled future, v4 draft); consistency warning acked fingerprint | Aarav/Rohan/Meera |
| TW-13 / TW-14 Builders | draft with full workout + nutrition content from templates; meal missing time (publish blocked) in one draft | Rohan draft, Neha draft |
| TW-15 Diet scope | effective nutrition plan with some of today's meals logged, some not | any active client mid-day |
| TW-16 Assign | future scheduled version superseding from a date (`superseded` assignments with `superseded_by_plan_version_id`) | Meera |
| TW-17 Activity | weeks of meals (confirmed/modified/skipped/unlogged, late, photo), workouts (completed/modified/skipped/missed/partial), check-ins; empty-range; "No schedule yet" | all active; coaching_ready persona |
| TW-18 / TR-13 Progress | 12–26 weigh-ins with noise + trend; waist/hip/chest; photos (front/side/back, ready + 1 failed); milestones/notes; one point only; none | long-tenure, new active, coaching_ready |
| TW-19 Client check-ins | scheduled (future), due today, overdue, draft started, submitted, reviewed (each outcome) | spread |
| TW-20 / TM-06 Check-in review | submitted with rich answers + photos + weight delta; reviewed (acknowledged/needs_follow_up/adjust_coaching + note shared); not-submitted due/overdue; draft only | spread |
| TW-21 History | long mixed timeline (plan publish, config versions, check-ins, exceptions, notes, renewals) | long-tenure |
| TW-22 / TM-05 Check-ins inbox | 5–8 to review across clients; ended clients excluded | Rahul |
| TW-23 / TW-27 Templates | Mine: ≥8 workout, ≥8 nutrition, ≥2 combined, 2 onboarding, 3 check-in forms; FitBud bases (global) present; search miss "pcod" vs hit "PCOS" | Rahul (Priya: 2–3; Nova: none = empty Mine) |
| TW-24 / TW-25 Form builders | trainer form with v1 + v2 versions (insert-only) | Rahul |
| TW-26 Libraries | global + 3–5 trainer custom exercises/foods (e.g. "Ragi dosa (home)") | Rahul |
| TW-28 / TW-29 / TM-07 Settings | trainer prefs with categories JSON; one trainer with push off | Rahul, Priya |
| TW-30 / TR-22 Ended + reactivate | ended (completed program), ended (client paused – financial), reactivation pending, reactivation expired, reactivated-in-past (`reactivated_at`) | Kavya, Nikhil, new persona |
| TW-31 Responsiveness | 14 d of reminders with opened/ignored; push off; not enough data | Farhan, Ishita, new persona |
| TW-32 Asked coach | open (meal portion, substitute, exercise form, pain → attention), answered with note, expired; repeat ask_count>1 | spread |
| TW-33 System states | forbidden/not-found ids (Priya's clients) | Lakshmi, Karan |
| TW-34 Note composer | private notes, shared notes seen/unseen, unshared | spread |
| TM-01 Attention | same as TW-04 first sections | Rahul |
| TM-03 Client status | week strip with mixed days; responsiveness | any active |
| TM-08 Role select | dual role | Karan |
| TM-09 Activity feed | ≥100 events over 7 d across types; filtered empty for a type window | Rahul's book |
| TR-02 Invite accept | pending token valid; expired/used token | Anita |
| TR-03 Intake | draft partially filled | Vikram |
| TR-04 Waiting | submitted (step 2); coaching_ready no plan (step 3 "Rahul is building your plan") | Sneha, new persona |
| TR-05 Reminder setup | prefs not yet set (fresh after review) | coaching_ready persona |
| TR-06 Today | training day mid-progress; rest day; paused reminders banner; coach note card; check-in due banner; Dubai tz | Aarav, Meera, Farhan, Deepak |
| TR-07 / TR-08 / TR-26 Diet | mixed logged/unlogged today; deviations with logged_foods items; custom foods; recent foods | Lakshmi, Rohan |
| TR-09 Meal plan | effective nutrition content with 4–6 meals, macros | all active |
| TR-10/11/12 Workout | today's workout pending; missed earlier late-loggable (open missed_workout); partial execution started/paused; completed with RPE + set actuals | Aarav, Rohan |
| TR-14 Check-in | due today with pinned trainer form; overdue; draft; reviewed with shared note | spread |
| TR-15 Notifications | 20–40 per trainee mixed read/unread over weeks | Aarav |
| TR-16/17 Reminders | push off; paused; quiet hours 22:30–06:30; WhatsApp opt-in | Ishita, Farhan, Aarav |
| TR-18 Ask coach | trainer number present; prior asks open/answered | Aarav (Nova has no number) |
| TR-19 Sync | one conflicted sync_mutation | Aarav |
| TR-20/21 | profile; widget shows today's next item | Aarav |
| TR-23 Deep link | superseded assignment id (unavailable) | Meera |
| TR-24 Meal times | weekday/weekend overrides; Dubai | Deepak, Aarav |
| TR-25 Steps | on-device only — no data | — |

## 3. Research findings (brief)

### 3.1 Check-in cadence and content
- Weekly is the norm for online coaching; same day each week (Sunday evening / Monday morning are common), same questions for ≥4 weeks so answers trend; ~2–5 minutes of client effort. Coach replies within 24 h with one observation, one adjustment, one question. Sources: https://hubfit.com/blog/client-check-in-questions , https://r1setraining.com/playbook/weekly-checkin-template-online-coaching , https://colossus.fit/guides/online-coaching-check-in-template , https://www.fitspace.app/trainer-space/resources/weekly-check-in-template
- Core fields: sessions done vs planned, effort, pain (yes/no + where), energy/sleep/stress (1–5), nutrition adherence, weekly-average weight, waist, photos (front/side/back, same light, fasted), one win, one obstacle, "anything you need from me". Photos and waist are the most-skipped items (Fitsly: https://www.fitsly.com/blog/client-check-in-template). Niche add-ons: postpartum pelvic-floor check, top set on main lifts for strength, cycle phase for women's fat loss.
- Design consequence: weekly cadence for ~70 % of clients, biweekly for maintenance/advanced (~20 %), monthly for lapsed-maintenance/yearly plans (~10 %). Due Sunday, window 48 h (`due_window_hours` 48); ~15 % submitted Monday late; photos attached ~55 % of submissions, waist ~60 %.

**Realistic answers (Indian English)** — use as phrase banks, mixed per persona tone:
- Wins: "Hit all 4 sessions even with the quarter-end crunch", "Finally did 3 proper push-ups from the floor!", "Didn't touch the office samosas this week", "Walked 8k steps on 5 days, mostly after dinner with my wife".
- Obstacles: "Navratri garba every night so sleep was only 5-6 hrs", "Mother-in-law visiting, cooking was not in my hands", "Back to back client calls till 9 pm, skipped Thursday", "Had a wedding in Indore, ate whatever was there", "Periods week, felt bloated and low", "Travelled to Pune for work, hotel breakfast only".
- Wellbeing: "Good overall, energy better in mornings", "Bit tired, work is hectic", "Feeling strong, knees ok now", "Mood low this week, honestly".
- Questions to coach: "Can I have one cheat meal for Diwali?", "Is it ok to replace paneer with tofu, paneer is getting boring", "Should I take whey or is it not needed?", "Weight is stuck at 78 for 2 weeks, what to do?".
- Coach review notes (Rahul's voice): "Solid week Aarav. Bench moved 2.5 kg, keep the same plan. How's sleep after the new shift?", "No stress about the wedding, back to plan from Monday. Keep protein at 100 g even on festival days.", "Weight trend is still down 0.4/wk even if the scale jumped — that's water from the salty dinner."

### 3.2 WhatsApp question types (→ `coach_asks.topic` + item_type)
From Indian coaching services (https://www.yourtrainer.in/blog/first-week-with-a-nutritionist-real-member-questions , https://www.gomoringa.in/faq , https://dietowl.in/ , https://pehlehealth.com/): portion size of a specific dish (idli count, rice katori, roti count) → `portion_size` on meal_assignment; swaps/substitutes (paneer↔tofu, roti↔rice, no eggs on Tuesday/Thursday) → `substitute`; eating out / office lunch / wedding / travel → `eating_out`; festival allowances (Navratri fasting food, Diwali sweets, Karwa Chauth fast) → `festival`; supplements (whey, creatine, B12, D3) → `supplement` on plan_version; exercise form/alternative (no leg-press at society gym, home alternative) → `exercise_form`/`alternative` on exercise_execution; pain/discomfort (knee in lunges, lower back on RDL, shoulder pinch) → `pain` (TW-32 attention chip); timing (late dinner, pre-workout meal, night shift) → `timing`; scale stuck / weight jumped → `progress` on checkin; logging help ("how to log ghar ka khana") → `logging`.
Distribution target: portion 22 %, substitute 18 %, eating out 12 %, exercise form/alt 12 %, festival 8 %, supplement 8 %, timing 7 %, progress 6 %, pain 4 %, logging 3 %. 60–70 % answered (most within 2–8 h, answered_at in trainer's working hours 7–10 am / 1–2 pm / 8–10 pm IST), ~20 % expired, rest open; ~15 % have ask_count 2–3.

### 3.3 Exceptions and how coaches resolve them
Guidance (https://r1setraining.com/playbook/how-to-motivate-clients-who-miss-workouts , https://turnkey.coach/coaching-through-missed-workouts/ , https://coachway.io/articles/how-to-keep-online-coaching-clients-accountable/ , https://www.fitsly.com/blog/how-to-keep-online-clients-accountable): respond fast and without blame; diagnose (schedule, energy, stress, plan mismatch); reduce demand rather than push; give one fallback action; pattern of misses ⇒ cut volume/frequency and re-anchor on the "why"; celebrate return.
Seed mapping:
- Resolution outcomes/notes (Rahul voice): "Client was travelling — swapped to 30-min hotel workout", "Logged late, did the session", "Shifted Thursday workout to Saturday permanently (new shift timing)", "Plan reduced to 3 days for exam month", "Festival week — agreed flexible meals, protein target only", "Sick (viral fever) — rest till Monday", "Duplicate — meal logged under substitute".
- Mix per active client over tenure: every closed exception is resolved by the trainer (no auto_resolve, locked 28 Oct 2026; a late log only marks it "Client logged later" / `meal_logged_later`): ~70 % resolved by trainer in one tap after a late log or the condition clearing, ~20 % resolved by trainer with note (exception_actions resolve + intervention), ~10 % acknowledged then resolved later; at reset time 0–4 open per client (≤10 hard cap), of which some acknowledged.
- Interventions: `plan_adjustment` with `resulting_plan_version_id` when an exception pattern triggered a plan change (ties exception → plan v2), `schedule_checkin` for slipping clients, `note`.

### 3.4 Behaviour patterns
- **Logging decay:** self-monitoring falls from week 3–5; <50 % still logging consistently by week 10; diet logging median disengagement ~10 weeks, weight ~4 weeks without coach contact; coach contact lengthens engagement. Sources: https://pmc.ncbi.nlm.nih.gov/articles/PMC6856872/ , https://doi.org/10.2196/33603 , https://mhealth.jmir.org/2026/1/e64139/PDF . Resistance-training app users: median dropout 19 weeks, first-28-day consistency is the strongest predictor (https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2026.1855668/full). ⇒ model meal-log probability `p = base · decay(week) · coachBoost` with a honeymoon (weeks 1–3 ≈ +10 %), a dip weeks 5–10, partial recovery after a check-in review or plan change (coached clients don't fall to app-only levels).
- **Weekend dips:** intake highest Saturday, activity lowest Sunday; weight +0.06–0.08 kg/day on weekends; logging adherence lowest Thu–Sun. Sources: https://pmc.ncbi.nlm.nih.gov/articles/PMC3740215/ , https://pubmed.ncbi.nlm.nih.gov/12917498/ , https://www.tandfonline.com/doi/full/10.1080/21642850.2025.2485476 . ⇒ weekday multipliers (Mon 1.0, Tue 1.0, Wed 0.98, Thu 0.93, Fri 0.85, Sat 0.75, Sun 0.8) for meal logging; Saturday deviation probability ×2 (restaurant/repeat_recent); Sunday workout skip ×1.5.
- **Festivals:** feasting periods add ~0.7 kg on average (scoping review https://doi.org/10.1007/s13679-020-00370-5 ; NEJM holidays https://www.nejm.org/doi/full/10.1056/nejmc1602012); HealthifyMe Diwali-week report: +1.5 kg, workouts −32 %, sugar +32 % (https://www.timesnownews.com/health/diwali-2022-kaju-katli-soan-papdi-binge-gave-indians-extra-1-5-kilos-in-a-week-article-95421587), mostly lost in the following 10 days. 2026 dates (https://panchang.org/popular-hindu-festivals-holidays-2026-list/ , https://mpa.gov.in/media/calendar?date=2026-10): Independence Day 15 Aug, Onam 26 Aug, Ganesh Chaturthi 14 Sep, Sharad Navratri 11–20 Oct, **Dussehra 20 Oct (= reset day if NOW is today)**, Karwa Chauth 29 Oct, Diwali 8 Nov. Use relative-to-reset offsets but tag festival windows by absolute date only when the window falls inside the seeded history; otherwise use generic "family function"/"wedding" events (seeded per persona) so any NOW works.
- **Weight noise:** day-to-day SD ≈0.5 % body mass (~0.4 kg at 75 kg), 7-day SD ≈0.7 %, 1–2 kg swings within days to weeks from water/glycogen/sodium; ~6 % of days move ≥1 kg. Sources: https://pmc.ncbi.nlm.nih.gov/articles/PMC10653631/ , https://pmc.ncbi.nlm.nih.gov/articles/PMC5506524/ , https://doi.org/10.1080/03014467400000011 . ⇒ `w(t) = trend(t) + AR(1) noise (φ=0.6, σ=0.45 % bw) + weekend +0.25 kg Mon readings + luteal-phase +0.6–1.0 kg for women in a 28±3 day cycle + festival bumps`; fat-loss trend 0.4–0.8 %/wk early, slowing to 0.2–0.4 %/wk, with 2–3 week plateaus; lean bulk +0.15–0.25 kg/wk.
- **Strength stalls:** novices progress weekly (~1–2 %/wk), intermediates every 2–6 weeks; double progression (fill rep range → add smallest load) at RPE 7–8; deload (−30–50 % volume for a week) when performance/sleep drop. Sources: https://rippedbody.com/training-plateaus/ , https://www.strongerbyscience.com/weekly-load-progression/ , https://www.exsercise.com/blog/how-to-use-double-progression . ⇒ per-exercise state machine (see §6.4).
- **Protein context:** ICMR-NIN 2024 RDA 0.83 g/kg/day (https://www.nin.res.in/dietaryguidelines2024.html); coaches set 1.2–2.0 g/kg for training clients — vegetarian clients routinely under-hit protein, a top WhatsApp topic.

## 4. Personas (24)

Reference "today" = `R` (reset day, IST). Tenure = R − `coaching_relationships.started_at`. 16 personas are the existing demo accounts (email/ID/state/display name unchanged; ages/genders unchanged from `DEMO_TRAINEE_BIO`); 8 are new Rahul clients (new emails, same id recipes). Rahul ends up with 21 relationships (19 active-or-onboarding, 2 ended) + Anita's pending invite; Priya keeps Lakshmi + Karan; Nova stays empty.

Phase legend: **Invited / Intake / Review / Ready** (pre-plan) · **Foundation** (wk 1–4) · **Build** (progressing block) · **Plateau** (stalled, plan being adjusted) · **Maintenance** · **Ended**.
Adherence profile = baseline logging probability and shape (see §6.3): **A** steady high (≥90 %), **B** good with weekend dips (75–85 %), **C** erratic/moderate (55–70 %), **D** decaying (started high, now <40 %), **E** silent (no logs ≥14 d), **H** honeymoon (new, ~95 %), **—** n/a.

| # | Email (local part) · state | Name | Age/Sex | City (tz) | Job | Goal (`goal_short`) | Diet | Plan type (subscription `plan_name`) | Pay freq | Phase | Tenure | Adherence | Story arc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | anita.invite · invite_pending | Anita Desai | 29 F | Mumbai | Bank RM | — (invite only) | Veg | — | — | Invited | invite 2 d old | — | Friend-referral; invite sent Sat, WhatsApp number on invite; expired + revoked earlier invites show the reissue history. |
| 2 | vikram.onboarding · onboarding_incomplete | Vikram Rao | 33 M | Hyderabad | Backend engineer | Lose 10 kg | Non-veg | Fat Loss 12-week | quarterly (planned) | Intake | 3 d | — | Accepted invite, filled half the intake on his phone in the metro, stuck at the medical section. |
| 3 | sneha.review · awaiting_review | Sneha Kulkarni | 31 F | Pune | Chartered accountant | Run first 5K + tone up | Veg | Lifestyle Monthly | monthly | Review | 2 d | — | Submitted a detailed intake Sunday night; mentions mild hypothyroid (highlighted) — waiting for Rahul. |
| 4 | aarav.ontrack · active_on_track | Aarav Shah | 34 M | Ahmedabad | Product manager | Lean bulk | Eggetarian | Muscle Gain 24-week | quarterly | Build (block 3, PPL→UL) | 22 wk | A | Model client: +4.1 kg, bench 60→77.5 kg; one wedding week dip; subscription renewed twice; the "everything works" demo account. |
| 5 | rohan.slipping · slipping | Rohan Mehta | 29 M | Delhi | Pharma sales exec | Lose 6 kg | Non-veg | Fat Loss · Phase 2 | monthly | Plateau | 14 wk | D | Lost 4.2 kg in 9 weeks, then new sales targets + Navratri parties; workouts missed Mon/Wed, check-in late; Rahul has a v3 draft cutting to 3 days. |
| 6 | meera.ack · acknowledged | Meera Iyer | 38 F | Chennai | School principal | PCOS-friendly fat loss | South Indian veg | PCOS Care Quarterly | quarterly | Build | 26 wk | B | Slow steady loss (−5.6 kg, waist −7 cm), cycle-related weight swings; skips lunch on exam-duty days → Rahul acknowledged, plan v3 scheduled from next Monday moves lunch earlier. |
| 7 | farhan.paused · reminders_paused | Farhan Qureshi | 36 M | Bengaluru | Strategy consultant | Maintain muscle while travelling | Non-veg (halal) | Executive Monthly | monthly | Maintenance | 30 wk | C | Flies Mon–Thu; ignored 5 reminders in a row so backoff paused them; logs in bursts from hotel gyms; hotel-gym template. |
| 8 | ishita.pushoff · notifications_off | Ishita Banerjee | 27 F | Kolkata | UX designer | Rebuild morning routine | Non-veg (fish) | Lifestyle Monthly | monthly | Foundation→Build | 10 wk | C | Turned push off after a late-night reminder; still logs most days by opening the app; asked about portion size on WhatsApp (open). |
| 9 | kavya.ended · ended | Kavya Menon | 32 F | Kochi | Architect (on maternity leave) | Postpartum strength return | South Indian non-veg | Postpartum 16-week | monthly | Ended | 16 wk program, ended 10 d ago | B→— | Completed the postpartum program (−6 kg, can deadlift 40 kg); ended "program completed"; later received an invite from Priya. |
| 10 | nikhil.reactivate · reactivation_pending | Nikhil Kapoor | 41 M | Gurugram | Bank VP | Restart after travel break | Non-veg | Fat Loss Quarterly | quarterly | Ended → reactivation pending | 18 wk, ended 10 d ago | D→— | Six-week US secondment broke the habit; ended; Rahul sent a reactivation request with intake update (pending, expires in 11 d). |
| 11 | deepak.dubai · dubai_meal_times | Deepak Nair | 35 M | Dubai (Asia/Dubai) | Oil & gas engineer | Lose 8 kg | Kerala non-veg | NRI Fat Loss Monthly | monthly | Build | 13 wk | B | NRI on Dubai time; weekend is Sat–Sun but Friday prayers shift lunch; custom meal times; −5.2 kg. |
| 12 | arjun.attention · attention_hole | Arjun Kapoor | 30 M | Chandigarh | Startup founder | Build strength | Non-veg | Strength 12-week | quarterly | Plateau | 20 wk | B | Squat stalled at 110 kg for 4 weeks, missed 2 workouts during fund-raise week; critical missed-workout open + earlier resolved; deload planned. |
| 13 | neha.attention · attention_hole | Neha Reddy | 28 F | Hyderabad | HR business partner | Lose 4 kg | Veg (eggs no) | Fat Loss Monthly | monthly | Foundation | 7 wk | C | Lunch and dinner not logged yesterday (office offsite); good mornings, weak evenings; "View all" row. |
| 14 | tanvi.attention · attention_hole (display "Priya Sharma") | Priya Sharma | 26 F | Jaipur | PG medical resident | Stay consistent | Jain veg | Student Monthly | monthly | Build | 12 wk | C | 24-hour duty shifts; check-in 2 days overdue; gets the short "duty-day" workout. |
| 15 | lakshmi.foods · food_deviations (Priya) | Lakshmi Iyer | 37 F | Coimbatore | Textile business owner | Stabilise weekday meals | South Indian veg | Lifestyle Quarterly | quarterly | Build | 11 wk | B | Logs actual foods (logged_foods) often, custom foods "Ragi kali", "Kuzhi paniyaram"; visible only to Priya (TW-33 forbidden for Rahul). |
| 16 | karan.dual · dual_role (Priya) | Karan Mehra | 33 M | Mumbai | Freelance PT (also trainer) | Recomposition | Non-veg | Coach Plan Monthly | monthly | Build | 9 wk | A | A trainer coached by Priya; tests role select. |
| 17 | siddharth.yearly (new) | Siddharth Jain | 45 M | Indore | CA, family firm | Reverse prediabetes, lose 7 kg | Jain veg | Metabolic Health Yearly | yearly | Maintenance | 34 wk | A | HbA1c 6.1→5.6 (noted in check-ins), −7.8 kg, now biweekly check-ins; Paryushan in Aug handled with a fasting template. |
| 18 | ananya.newbie (new) | Ananya Bose | 24 F | Bengaluru (Asia/Kolkata) | SDE-1 | First pull-up | Eggetarian | Starter Weekly | weekly | Foundation | 5 wk | H | Eager beginner; logs everything; asks form questions (answered); assisted pull-up progressing. |
| 19 | imran.nightshift (new) | Imran Sheikh | 39 M | Lucknow | ICU doctor (night shifts) | Lose 8 kg | Non-veg | Fat Loss Quarterly | quarterly | Build | 19 wk (reactivated 9 wk ago) | C | Ended in June (burnout), reactivated in Aug; shift-pattern meal times; renewal **due today**. |
| 20 | pooja.silent (new) | Pooja Agarwal | 34 F | Noida | Homemaker, 2 kids | Lose post-pregnancy weight | Veg | Home Fit Monthly | monthly | Foundation → stalled | 9 wk | E | Kids' exams + mother-in-law visit; no logs for 16 days; renewal expired 3 d ago; Re-engage row; reminders ignored. |
| 21 | rajesh.senior (new) | Rajesh Pillai | 52 M | Thiruvananthapuram | Retired Navy officer | Mobility + BP control | Kerala non-veg (fish) | Active Ageing Yearly | yearly | Maintenance | 28 wk | A | Monthly check-ins, walks 10k daily, knee-friendly strength; open pain ask about knee (attention chip). |
| 22 | fatima.london (new) | Fatima Khan | 29 F | London (Europe/London) | Data analyst | Glute & strength focus | Non-veg (halal) | NRI Monthly | monthly | Build | 15 wk | B | UK time zone; Saturday brunch deviations; asks about Diwali-party plan with Indian friends. |
| 23 | harpreet.ready (new) | Harpreet Singh | 27 M | Ludhiana | Police-exam aspirant | Strength + run 1.6 km < 6 min | Veg (no eggs) | Performance Monthly | monthly | Ready (coaching_ready, no plan) | 4 d | — | Intake reviewed yesterday; config draft only; TW-12 "No plan yet", TR-04 step 3. |
| 24 | divya.wedding (new) | Divya Nair | 31 F | Mumbai | Brand manager | Lose 5 kg before December wedding | Eggetarian | Bridal 12-week (weekly billing) | weekly | Build | 10 wk | A | Deadline-driven; weekly renewal **upcoming in 4 d**; asks about Karwa Chauth fast + mehendi week; strong progress photos. |

Distribution check: lifecycle — invited 1, onboarding_pending 1, onboarding_submitted 1, coaching_ready 1, active 18, ended 2. Adherence (active) — on_track: Aarav, Siddharth, Ananya, Rajesh (an open pain ask does not affect adherence), Divya, Karan, Deepak, Fatima; needs_attention: Rohan, Meera (acknowledged still counts as open), Arjun, Neha, Priya S., Ishita, Imran, Lakshmi, Farhan (one open attention item); no_recent_data: Pooja; not_available: Vikram, Sneha, Harpreet, ended. Goals: 16 distinct. Diets: veg 4, Jain 2, South-Indian veg 2, eggetarian 3, non-veg 11, veg-no-eggs 2. Plan pay freq: weekly 2, monthly 13, quarterly 6, yearly 2. Sexes 12 M / 12 F.
## 5. Template catalogue

Source of truth for this section: `tools/templates.py` (validates every slug against `library-exercises.csv` / `library-foods.csv`, which were exported from `apps/api/seed/library/library-2026.10.2.json`, 353 exercises / 693 foods; regenerate with `python3 tools/templates.py`). Global FitBud bases already in the library (keep, do not copy): workout `bb39518d…` Beginner full body gym 3x, `e7cd8217…` Beginner home 3x, `c5715202…` Home fat-loss circuit 4x, `560d5876…` Intermediate U/L 4x, `4e3ae2e0…` PPL 6x; nutrition `7498cb74…` Veg North Indian, `6142ff80…` Non-veg high protein, `c7e79a87…` Jain, `92918a3a…` South Indian veg, `7ae47c37…` Eggetarian. Trainer templates below are Rahul's "Mine" (Priya gets forks of W02, N02, N07). Library data caveat: a few INDB recipe portions are implausible (e.g. onion-tomato uttapam 644 kcal/140 g, besan kadhi 605 kcal/150 g, boiled egg default 151 g) — the catalogue sets grams explicitly and avoids those items.

### 5.1 Workout programs (trainer-owned `plan_templates`, `template_type='workout'`)
All exercise ids are library v2 ids (`exercise_library_items.id`, from `seed/library/library-2026.10.2.json`); store as `sourceExerciseLibraryItemId` with `name`/muscles/equipment copied from the library row. `reps` is the bottom of the range in `setTargets.reps` and the range goes in `notes`; time-based items use `reps=null` and `notes` (e.g. "40 s"). RPE goes in `setTargets.rpe`, rest in `restSeconds`, progression rule in the exercise `instructions`.

#### W01 · Beginner Full Body · Gym · 3x (A/B)
For: beginner gym clients, wk 1–8. Schedule: Mon/Wed/Fri alternating A-B-A / B-A-B.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Full Body A | 1 | Goblet squat | `e1000001-0000-4000-8000-000000000020` | 3 × 10-12 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full Body A | 2 | Dumbbell bench press | `69b2567d-97cb-5839-8a26-17169ebefe14` | 3 × 8-12 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full Body A | 3 | Seated cable row | `e1000001-0000-4000-8000-00000000000d` | 3 × 10-12 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full Body A | 4 | Romanian deadlift (barbell) | `e1000001-0000-4000-8000-000000000003` | 3 × 8-10 | 7 | 120s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full Body A | 5 | Plank | `e1000001-0000-4000-8000-00000000001b` | 3 × 30-45 s | — | 60s | +10 s/week |
| Full Body B | 1 | Leg press | `e1000001-0000-4000-8000-000000000016` | 3 × 10-12 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full Body B | 2 | Lat pulldown (wide grip) | `e1000001-0000-4000-8000-00000000000c` | 3 × 10-12 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full Body B | 3 | Dumbbell shoulder press | `e1000001-0000-4000-8000-000000000009` | 3 × 8-12 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full Body B | 4 | Lying leg curls | `e1000001-0000-4000-8000-000000000017` | 3 × 10-12 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full Body B | 5 | Dead bug | `e1000001-0000-4000-8000-00000000001c` | 3 × 10/side | — | 45s | slow tempo |

#### W02 · Upper/Lower Hypertrophy · 4x
For: intermediate muscle gain / recomposition. Schedule: Mon U-A, Tue L-A, Thu U-B, Sat L-B.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Upper A | 1 | Bench press (barbell) | `e1000001-0000-4000-8000-000000000005` | 4 × 6-8 | 8 | 150s | +2.5 kg when 4×8 @≤RPE8 |
| Upper A | 2 | Bent-over row (barbell) | `e1000001-0000-4000-8000-00000000000e` | 4 × 8-10 | 8 | 120s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper A | 3 | Incline dumbbell press | `e1000001-0000-4000-8000-000000000006` | 3 × 10-12 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper A | 4 | Lat pulldown (wide grip) | `e1000001-0000-4000-8000-00000000000c` | 3 × 10-12 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper A | 5 | Side lateral raise | `e1000001-0000-4000-8000-00000000000a` | 3 × 12-15 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper A | 6 | Triceps pushdown – rope attachment | `d2a2e034-0e9b-592c-9d3f-19a63b0ed156` | 3 × 12-15 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower A | 1 | Back squat (barbell) | `e1000001-0000-4000-8000-000000000001` | 4 × 6-8 | 8 | 180s | +5 kg when 4×8 @≤RPE8 |
| Lower A | 2 | Romanian deadlift (barbell) | `e1000001-0000-4000-8000-000000000003` | 3 × 8-10 | 8 | 150s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower A | 3 | Leg press | `e1000001-0000-4000-8000-000000000016` | 3 × 10-12 | 8 | 120s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower A | 4 | Lying leg curls | `e1000001-0000-4000-8000-000000000017` | 3 × 10-12 | 8 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower A | 5 | Standing calf raises | `e1000001-0000-4000-8000-000000000019` | 4 × 10-15 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper B | 1 | Overhead press (barbell) | `e1000001-0000-4000-8000-000000000008` | 4 × 6-8 | 8 | 150s | +2.5 kg when 4×8 |
| Upper B | 2 | Pull-up | `e1000001-0000-4000-8000-00000000000b` | 4 × 6-10 | 8 | 120s | add reps → add 2.5 kg belt |
| Upper B | 3 | Dumbbell bench press | `69b2567d-97cb-5839-8a26-17169ebefe14` | 3 × 8-12 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper B | 4 | Seated cable row | `e1000001-0000-4000-8000-00000000000d` | 3 × 10-12 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper B | 5 | Barbell curl | `e1000001-0000-4000-8000-000000000011` | 3 × 10-12 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper B | 6 | Face pull | `e1000001-0000-4000-8000-000000000010` | 3 × 15 | 8 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower B | 1 | Deadlift (barbell) | `e1000001-0000-4000-8000-000000000004` | 3 × 5 | 8 | 180s | +5 kg/2 wk |
| Lower B | 2 | Split squat with dumbbell | `e1000001-0000-4000-8000-000000000015` | 3 × 8-10/leg | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower B | 3 | Leg extensions | `e1000001-0000-4000-8000-000000000018` | 3 × 12-15 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower B | 4 | Seated leg curl | `cf6db9c7-231f-5c84-acab-1b4792bfb52f` | 3 × 12-15 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower B | 5 | Hanging leg raise | `7a846251-b673-5cd2-a4c2-0bdf5c8d88c2` | 3 × 10-12 | — | 60s | reps |

#### W03 · Push/Pull/Legs · 6x (lean bulk)
For: advanced gain phase (Aarav block 2). Schedule: Mon–Sat P/P/L/P/P/L, Sun rest.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Push | 1 | Bench press (barbell) | `e1000001-0000-4000-8000-000000000005` | 4 × 5-7 | 8 | 180s | top set +2.5 kg/2 wk |
| Push | 2 | Seated dumbbell press | `c463b526-9e13-5eb1-ba1d-3ff39bafc16b` | 3 × 8-10 | 8 | 120s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Push | 3 | Incline dumbbell fly | `c6c653da-eb56-5a00-b17a-77765b19bbc3` | 3 × 12-15 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Push | 4 | Side lateral raise | `e1000001-0000-4000-8000-00000000000a` | 4 × 12-20 | 9 | 45s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Push | 5 | Triceps overhead extension with rope | `ef8a08b3-04b5-5f7a-9305-c23e1f8fa826` | 3 × 10-12 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Pull | 1 | Weighted pull ups | `cc0092e1-fcaa-58ac-b56f-4cd62d9a7c52` | 4 × 5-8 | 8 | 150s | +1.25–2.5 kg |
| Pull | 2 | T-bar row with handle | `81175929-b489-54df-bdd3-1576d60a0ff2` | 3 × 8-10 | 8 | 120s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Pull | 3 | One arm lat pulldown | `45dca996-f226-5c11-a621-a4dba82b2099` | 3 × 10-12 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Pull | 4 | Reverse machine fly | `600bf03d-f9b7-5500-9362-74456fe06ed4` | 3 × 15 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Pull | 5 | Incline dumbbell curl | `8c19a934-f679-517d-aa37-2bf589965d2f` | 3 × 10-12 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Legs | 1 | Back squat (barbell) | `e1000001-0000-4000-8000-000000000001` | 4 × 5-7 | 8 | 180s | top set +5 kg/2 wk |
| Legs | 2 | Stiff-legged barbell deadlift | `25647e8a-9061-5f2a-81a7-a6d635a456ff` | 3 × 8-10 | 8 | 150s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Legs | 3 | Hack squat | `d5ffd4b6-d501-5f65-92cd-0df364b8364f` | 3 × 10-12 | 9 | 120s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Legs | 4 | Seated leg curl | `cf6db9c7-231f-5c84-acab-1b4792bfb52f` | 3 × 10-12 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Legs | 5 | Seated calf raise | `5e111fe3-b91f-549d-a8ec-6ef4ffbdf189` | 4 × 12-15 | 9 | 45s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |

#### W04 · Strength Block · 4x (SBD + OHP)
For: strength goal / Arjun. Schedule: Mon squat, Tue bench, Thu deadlift, Sat OHP+volume.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Squat day | 1 | Back squat (barbell) | `e1000001-0000-4000-8000-000000000001` | 5 × 3-5 | 8 | 240s | wk1 RPE7 → wk3 RPE9, wk4 deload −40 % sets |
| Squat day | 2 | Front squat (barbell) | `e1000001-0000-4000-8000-000000000002` | 3 × 6 | 7 | 180s | +2.5 kg/wk |
| Squat day | 3 | Barbell hip thrust | `e1000001-0000-4000-8000-00000000001a` | 3 × 8-10 | 8 | 120s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Squat day | 4 | Ab roller | `bfd9d15c-803e-56e4-a858-c80a65b7ec6a` | 3 × 8-10 | — | 60s | reps |
| Bench day | 1 | Bench press (barbell) | `e1000001-0000-4000-8000-000000000005` | 5 × 3-5 | 8 | 210s | wave as squat |
| Bench day | 2 | Close-grip barbell bench press | `0af699a7-90ad-5aa2-9224-71e99df54b25` | 3 × 6-8 | 8 | 150s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Bench day | 3 | One-arm dumbbell row | `e1000001-0000-4000-8000-00000000000f` | 4 × 8-10 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Bench day | 4 | Face pull | `e1000001-0000-4000-8000-000000000010` | 3 × 15 | 8 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Deadlift day | 1 | Deadlift (barbell) | `e1000001-0000-4000-8000-000000000004` | 4 × 2-4 | 8 | 240s | wave; deload wk4 |
| Deadlift day | 2 | Romanian deadlift (barbell) | `e1000001-0000-4000-8000-000000000003` | 3 × 6-8 | 7 | 150s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Deadlift day | 3 | Chin-up | `a77b3d7a-9c90-55d9-a33a-7ceb5425acd2` | 4 × 6-8 | 8 | 120s | reps |
| Deadlift day | 4 | Farmer's carry | `e1000001-0000-4000-8000-00000000001e` | 3 × 30 m | — | 90s | +2 kg/hand |
| Press + volume | 1 | Overhead press (barbell) | `e1000001-0000-4000-8000-000000000008` | 5 × 3-5 | 8 | 180s | +1.25 kg/wk |
| Press + volume | 2 | Dips – chest version | `83c8cf70-9761-546b-9bf3-6d047481d4a8` | 3 × 8-12 | 8 | 120s | reps → weighted |
| Press + volume | 3 | Lat pulldown (wide grip) | `e1000001-0000-4000-8000-00000000000c` | 3 × 10-12 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Press + volume | 4 | Leg press | `e1000001-0000-4000-8000-000000000016` | 3 × 10-12 | 8 | 120s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |

#### W05 · Home Dumbbell Fat-Loss · 4x
For: home clients with 2 adjustable DBs (Pooja, Neha). Schedule: Mon/Tue/Thu/Sat.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Lower + core | 1 | Goblet squat | `e1000001-0000-4000-8000-000000000020` | 4 × 12-15 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower + core | 2 | Dumbbell rear lunge | `63792177-8e33-52e0-8773-cdfeed8a595a` | 3 × 10/leg | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower + core | 3 | Stiff-legged dumbbell deadlift | `2ff80430-d1c9-5865-b053-9a9a22a7463f` | 3 × 12 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower + core | 4 | Glute bridge | `1d516abe-53dc-55ef-898c-c530f0f59b3f` | 3 × 15 | — | 45s | single-leg when 3×20 |
| Lower + core | 5 | Plank | `e1000001-0000-4000-8000-00000000001b` | 3 × 40 s | — | 45s | +5 s/wk |
| Upper push/pull | 1 | Dumbbell floor press | `67960ba9-2a2d-56a2-8e8f-240cbfbbec30` | 4 × 10-12 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper push/pull | 2 | One-arm dumbbell row | `e1000001-0000-4000-8000-00000000000f` | 4 × 10-12/arm | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper push/pull | 3 | Dumbbell shoulder press | `e1000001-0000-4000-8000-000000000009` | 3 × 10-12 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper push/pull | 4 | Incline push-up | `971aa71f-9f87-53f1-912d-6dfbf3576d79` | 3 × AMRAP | — | 60s | lower the incline |
| Upper push/pull | 5 | Hammer curls | `bd39fc76-75ad-5d77-a881-89d1aa220657` | 2 × 12 | 8 | 45s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Circuit | 1 | Surya namaskar (sun salutation) | `292b0ead-ed14-5fe5-8aa9-ff7e74aeb8ee` | 1 × 6 rounds | — | 0s | +1 round/2 wk |
| Circuit | 2 | Mountain climbers | `547e40a4-2bc8-5db0-bfad-edfc385cc7cb` | 4 × 30 s | — | 30s | time |
| Circuit | 3 | Bodyweight squat | `710db63d-3636-5371-888c-fa181db61bf4` | 4 × 20 | — | 30s | reps |
| Circuit | 4 | Burpee | `99cc61d0-09d8-57d8-917f-45ca4be1a1f2` | 4 × 8 | — | 45s | reps |
| Circuit | 5 | Jumping jacks | `a64bf7a5-90eb-53c2-a8c4-d8b64f6f85c1` | 4 × 40 s | — | 30s | time |
| Full body | 1 | Dumbbell squat | `1185c06a-e886-5ed3-8ab3-c347a53a096a` | 3 × 12 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full body | 2 | Bent over two-dumbbell row | `d7ce07ee-5605-5f42-90ef-b0c5fdb53d2e` | 3 × 12 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full body | 3 | Dumbbell step ups | `eae24e89-2d29-5834-837d-c2deae29b79f` | 3 × 10/leg | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Full body | 4 | Push-up | `e1000001-0000-4000-8000-000000000007` | 3 × AMRAP | — | 60s | reps |
| Full body | 5 | Russian twist | `c804949b-f36e-53a0-bdd5-7b8d1d26a8c2` | 3 × 20 | — | 45s | reps |

#### W06 · Hotel Gym Express · 3x 35 min
For: travelling executives (Farhan). Schedule: any 3 non-consecutive days.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Express A | 1 | Dumbbell bench press | `69b2567d-97cb-5839-8a26-17169ebefe14` | 3 × 8-12 | 8 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express A | 2 | Goblet squat | `e1000001-0000-4000-8000-000000000020` | 3 × 10-12 | 8 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express A | 3 | One-arm dumbbell row | `e1000001-0000-4000-8000-00000000000f` | 3 × 10-12 | 8 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express A | 4 | Treadmill jog | `526bed6f-4974-5b38-b3ad-dd6dd27ac39e` | 1 × 12 min | — | 0s | +1 min |
| Express B | 1 | Dumbbell shoulder press | `e1000001-0000-4000-8000-000000000009` | 3 × 8-12 | 8 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express B | 2 | Split squat with dumbbell | `e1000001-0000-4000-8000-000000000015` | 3 × 8-10/leg | 8 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express B | 3 | Push-up | `e1000001-0000-4000-8000-000000000007` | 3 × AMRAP | — | 60s | reps |
| Express B | 4 | Stationary bike | `e1000001-0000-4000-8000-000000000024` | 1 × 15 min intervals | — | 0s | +1 interval |
| Bodyweight (no gym) | 1 | Hindu squat (baithak) | `f6ff43ab-9d3d-5ebb-a1f1-846ca2e34e94` | 4 × 20 | — | 45s | +5 reps |
| Bodyweight (no gym) | 2 | Hindu push-up (dand) | `b671f1a8-c76b-5420-9920-a847c159c062` | 4 × 10 | — | 60s | +2 reps |
| Bodyweight (no gym) | 3 | Bodyweight walking lunge | `e1000001-0000-4000-8000-000000000014` | 3 × 20 steps | — | 45s | reps |
| Bodyweight (no gym) | 4 | Plank | `e1000001-0000-4000-8000-00000000001b` | 3 × 45 s | — | 45s | time |

#### W07 · Postpartum Return to Strength · 3x
For: postpartum (Kavya); cleared by doctor. Schedule: Mon/Wed/Fri.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Foundation A | 1 | Dead bug | `e1000001-0000-4000-8000-00000000001c` | 3 × 8/side | — | 45s | slow, exhale on effort |
| Foundation A | 2 | Glute bridge | `1d516abe-53dc-55ef-898c-c530f0f59b3f` | 3 × 12 | — | 45s | → single-leg |
| Foundation A | 3 | Goblet squat | `e1000001-0000-4000-8000-000000000020` | 3 × 10 | 6 | 75s | +2 kg/2 wk |
| Foundation A | 4 | One-arm dumbbell row | `e1000001-0000-4000-8000-00000000000f` | 3 × 10/arm | 6 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Foundation A | 5 | Bird dog | `e1000001-0000-4000-8000-00000000001d` | 3 × 8/side | — | 45s | hold 3 s |
| Foundation B | 1 | Kettlebell one-legged deadlift | `bbc57390-bb5e-5981-8eff-65813ad6c5cc` | 3 × 8/leg | 6 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Foundation B | 2 | Incline push-up | `971aa71f-9f87-53f1-912d-6dfbf3576d79` | 3 × 8-12 | — | 60s | lower incline |
| Foundation B | 3 | Dumbbell step ups | `eae24e89-2d29-5834-837d-c2deae29b79f` | 3 × 8/leg | 6 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Foundation B | 4 | Side plank | `31c090b1-f959-55d3-a809-ba2318affba4` | 3 × 20 s/side | — | 45s | +5 s |
| Foundation B | 5 | Brisk walk (outdoor) | `6d4c0104-26da-5b8a-994f-dd85e0115865` | 1 × 20 min | — | 0s | +5 min/wk |
| Strength C | 1 | Romanian deadlift (barbell) | `e1000001-0000-4000-8000-000000000003` | 3 × 8 | 7 | 120s | +2.5 kg/wk |
| Strength C | 2 | Dumbbell bench press | `69b2567d-97cb-5839-8a26-17169ebefe14` | 3 × 10 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Strength C | 3 | Lat pulldown (wide grip) | `e1000001-0000-4000-8000-00000000000c` | 3 × 10 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Strength C | 4 | Pallof press | `c3add3b5-045a-522e-ab33-33c19cf0c555` | 3 × 10/side | — | 45s | band |

#### W08 · Active Ageing · Knee-friendly · 3x
For: 50+ / BP / knees (Rajesh). Schedule: Tue/Thu/Sat + daily walk.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Strength A | 1 | Dumbbell squat to a bench | `3ef2056d-091c-504a-b7bd-35396a6a6baa` | 3 × 10-12 | 6 | 90s | +1 kg/2 wk |
| Strength A | 2 | Seated cable row | `e1000001-0000-4000-8000-00000000000d` | 3 × 12 | 6 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Strength A | 3 | Machine bench press | `65346e8f-8faf-5a58-a81f-1a2a0201c2ab` | 3 × 12 | 6 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Strength A | 4 | Glute bridge | `1d516abe-53dc-55ef-898c-c530f0f59b3f` | 3 × 15 | — | 45s | hold 2 s |
| Strength A | 5 | Standing calf raises | `e1000001-0000-4000-8000-000000000019` | 3 × 15 | 6 | 45s | reps |
| Strength B | 1 | Leg press | `e1000001-0000-4000-8000-000000000016` | 3 × 12 | 6 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Strength B | 2 | Lat pulldown (wide grip) | `e1000001-0000-4000-8000-00000000000c` | 3 × 12 | 6 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Strength B | 3 | Seated dumbbell press | `c463b526-9e13-5eb1-ba1d-3ff39bafc16b` | 3 × 10-12 | 6 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Strength B | 4 | Bird dog | `e1000001-0000-4000-8000-00000000001d` | 3 × 8/side | — | 45s | hold |
| Strength B | 5 | Farmer's carry | `e1000001-0000-4000-8000-00000000001e` | 3 × 20 m | — | 60s | +1 kg |
| Mobility + walk | 1 | World's greatest stretch | `60b23cc2-9ca7-52a4-8655-9ccb69098ccd` | 2 × 5/side | — | 0s | — |
| Mobility + walk | 2 | Cat stretch | `bdb77bc9-dabd-5e00-8a63-1a29cff443d8` | 2 × 8 | — | 0s | — |
| Mobility + walk | 3 | Kneeling hip flexor | `b8e6f48c-663b-572b-8d12-a8e68df4b387` | 2 × 30 s/side | — | 0s | — |
| Mobility + walk | 4 | Brisk walk (outdoor) | `6d4c0104-26da-5b8a-994f-dd85e0115865` | 1 × 40 min | — | 0s | +5 min |

#### W09 · Glute & Lower Focus · 4x
For: women's glute/strength (Fatima). Schedule: Mon/Tue/Thu/Sat.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Glutes heavy | 1 | Barbell hip thrust | `e1000001-0000-4000-8000-00000000001a` | 4 × 6-8 | 8 | 150s | +5 kg |
| Glutes heavy | 2 | Romanian deadlift (barbell) | `e1000001-0000-4000-8000-000000000003` | 3 × 8-10 | 8 | 120s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Glutes heavy | 3 | Split squat with dumbbell | `e1000001-0000-4000-8000-000000000015` | 3 × 10/leg | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Glutes heavy | 4 | Thigh abductor | `da098264-88b4-5d3c-88f3-00ad2329fe51` | 3 × 15-20 | 9 | 45s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper | 1 | Dumbbell bench press | `69b2567d-97cb-5839-8a26-17169ebefe14` | 3 × 8-12 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper | 2 | Lat pulldown (wide grip) | `e1000001-0000-4000-8000-00000000000c` | 3 × 10-12 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper | 3 | Seated dumbbell press | `c463b526-9e13-5eb1-ba1d-3ff39bafc16b` | 3 × 10-12 | 8 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Upper | 4 | Seated cable row | `e1000001-0000-4000-8000-00000000000d` | 3 × 12 | 8 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Quads + glutes | 1 | Goblet squat | `e1000001-0000-4000-8000-000000000020` | 4 × 10-12 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Quads + glutes | 2 | Leg press | `e1000001-0000-4000-8000-000000000016` | 3 × 12-15 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Quads + glutes | 3 | One-legged cable kickback | `0e1905c7-262e-51dd-a8e8-d55dbb23df03` | 3 × 15/leg | 9 | 45s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Quads + glutes | 4 | Leg extensions | `e1000001-0000-4000-8000-000000000018` | 3 × 15 | 9 | 45s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Posterior chain | 1 | Sumo deadlift | `6932a3df-8841-52cc-88e9-c6b80e0142c5` | 3 × 6-8 | 8 | 150s | +5 kg |
| Posterior chain | 2 | Glute ham raise | `15543365-d05e-5dde-9ed5-eaa0a7eaff03` | 3 × 6-10 | 8 | 90s | reps |
| Posterior chain | 3 | Lying leg curls | `e1000001-0000-4000-8000-000000000017` | 3 × 12 | 9 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Posterior chain | 4 | Hip lift with band | `76675db3-643d-52f9-ae58-9cf0213c1ee7` | 3 × 20 | — | 45s | reps |

#### W10 · Duty-Day Express · 25 min · 3x
For: shift workers (Priya S., Imran). Schedule: 3 flexible days; required=false on post-night-shift days.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Express full body A | 1 | Goblet squat | `e1000001-0000-4000-8000-000000000020` | 3 × 12 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express full body A | 2 | Push-up | `e1000001-0000-4000-8000-000000000007` | 3 × AMRAP | — | 60s | reps |
| Express full body A | 3 | One-arm dumbbell row | `e1000001-0000-4000-8000-00000000000f` | 3 × 12/arm | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express full body A | 4 | Mountain climbers | `547e40a4-2bc8-5db0-bfad-edfc385cc7cb` | 3 × 30 s | — | 30s | time |
| Express full body B | 1 | Dumbbell lunges | `198a72ed-ea53-57ab-8395-6d0b5de87c48` | 3 × 10/leg | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express full body B | 2 | Dumbbell shoulder press | `e1000001-0000-4000-8000-000000000009` | 3 × 10-12 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express full body B | 3 | Stiff-legged dumbbell deadlift | `2ff80430-d1c9-5865-b053-9a9a22a7463f` | 3 × 12 | 7 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Express full body B | 4 | Dead bug | `e1000001-0000-4000-8000-00000000001c` | 3 × 10/side | — | 30s | tempo |
| Walk + mobility | 1 | Brisk walk (outdoor) | `6d4c0104-26da-5b8a-994f-dd85e0115865` | 1 × 30 min | — | 0s | +5 min |
| Walk + mobility | 2 | Child's pose | `e79b7a8b-1d8c-5762-9e65-d61082333125` | 2 × 45 s | — | 0s | — |
| Walk + mobility | 3 | Hamstring stretch | `19e130ae-4bf6-5df5-81ae-1ac1c5c61383` | 2 × 30 s/side | — | 0s | — |

#### W11 · First Pull-up Program · 3x
For: beginner women strength (Ananya). Schedule: Mon/Wed/Fri.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Pull focus | 1 | Scapular pull-up | `fb03c844-1f5d-5e82-a5e0-74ce87922f6f` | 3 × 8 | — | 60s | → band-assisted |
| Pull focus | 2 | Band assisted pull-up | `026da59b-63e6-561f-bb1b-38da5804ba42` | 4 × 5-8 | 8 | 120s | lighter band when 4×8 |
| Pull focus | 3 | Lat pulldown (wide grip) | `e1000001-0000-4000-8000-00000000000c` | 3 × 8-10 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Pull focus | 4 | Inverted row | `fafd2277-644a-5b02-8c62-07e4e35f3d18` | 3 × 8-10 | 8 | 90s | lower the bar |
| Lower + push | 1 | Goblet squat | `e1000001-0000-4000-8000-000000000020` | 3 × 8-10 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower + push | 2 | Dumbbell bench press | `69b2567d-97cb-5839-8a26-17169ebefe14` | 3 × 8-10 | 7 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Lower + push | 3 | Romanian deadlift (barbell) | `e1000001-0000-4000-8000-000000000003` | 3 × 8-10 | 7 | 120s | +2.5 kg/wk |
| Lower + push | 4 | Plank | `e1000001-0000-4000-8000-00000000001b` | 3 × 40 s | — | 45s | time |
| Pull + core | 1 | Chin-up | `a77b3d7a-9c90-55d9-a33a-7ceb5425acd2` | 3 × negatives × 3-5 | — | 120s | 5 s eccentric → full reps |
| Pull + core | 2 | One-arm dumbbell row | `e1000001-0000-4000-8000-00000000000f` | 3 × 10/arm | 8 | 60s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Pull + core | 3 | Hanging leg raise | `7a846251-b673-5cd2-a4c2-0bdf5c8d88c2` | 3 × 8 | — | 60s | reps |
| Pull + core | 4 | Dumbbell shoulder press | `e1000001-0000-4000-8000-000000000009` | 3 × 10 | 7 | 75s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |

#### W12 · Police Fitness Prep · Strength + Run · 4x
For: performance/test prep (Harpreet). Schedule: Mon strength, Tue run, Thu strength, Sat run.

| Day | # | Exercise (library name) | id | Sets × reps | RPE | Rest | Progression |
|---|---|---|---|---|---|---|---|
| Strength A | 1 | Back squat (barbell) | `e1000001-0000-4000-8000-000000000001` | 4 × 5 | 8 | 180s | +5 kg/wk |
| Strength A | 2 | Pull-up | `e1000001-0000-4000-8000-00000000000b` | 4 × AMRAP | — | 120s | reps |
| Strength A | 3 | Push-up | `e1000001-0000-4000-8000-000000000007` | 4 × AMRAP | — | 90s | reps |
| Strength A | 4 | Plank | `e1000001-0000-4000-8000-00000000001b` | 3 × 60 s | — | 45s | time |
| Intervals | 1 | Treadmill run | `25b5e466-e759-5262-8ad3-52b632a0ea32` | 6 × 400 m @ goal pace | — | 90s | −2 s/rep/wk |
| Intervals | 2 | Wind sprints | `cee72a99-7d0c-572b-933c-2baa8847511a` | 4 × 60 m | — | 60s | — |
| Strength B | 1 | Deadlift (barbell) | `e1000001-0000-4000-8000-000000000004` | 4 × 5 | 8 | 180s | +5 kg/wk |
| Strength B | 2 | Overhead press (barbell) | `e1000001-0000-4000-8000-000000000008` | 4 × 6 | 8 | 120s | +2.5 kg |
| Strength B | 3 | Bent-over row (barbell) | `e1000001-0000-4000-8000-00000000000e` | 3 × 8 | 8 | 90s | double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower) |
| Strength B | 4 | Front box jump | `a73cf1ff-7dbf-5e74-8abd-b3b7454523f9` | 4 × 5 | — | 90s | height |
| Tempo run | 1 | Treadmill jog | `526bed6f-4974-5b38-b3ad-dd6dd27ac39e` | 1 × 25 min easy | — | 0s | +2 min/wk |
| Tempo run | 2 | Jump rope (skipping) | `c8f5b42c-4f85-5a67-81a3-cbede7e032c1` | 5 × 1 min | — | 30s | — |

### 5.2 Diet templates (trainer-owned `plan_templates`, `template_type='nutrition'`)
Items are `calculated` snapshots built with `foodSnapshotFromLibrary` from the library row + grams (macros below computed from library per-100 g values: kcal / P / C / F). Times feed `mealPrescriptions.localTime`.

#### N01 · North Indian Veg · Fat Loss · ~1470 kcal
For: veg fat loss (Neha, Pooja, Anita). **Day total ≈ 1466 kcal · P 67 g · C 203 g · F 58 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 08:00 | breakfast | Besan chilla `f1000001-0000-4000-8000-000000000027` 156 g (3 chillas); Curd / dahi, low fat `819f0c27-dde8-50c0-8684-e0b8fb4c997a` 150 g (1 katori dahi) | 307 | 20 | 50 | 7 |
| Lunch | 13:30 | lunch · photo | Chapati / roti `f1000001-0000-4000-8000-000000000001` 72 g (2 roti); Moong dal (dhuli) `62847307-94cb-590a-997a-bc15718b27de` 200 g (1 katori dal); Bhindi sabzi (dry) `f1000001-0000-4000-8000-000000000018` 100 g (1 katori sabzi); Tossed salad `f1000001-0000-4000-8000-000000000019` 100 g (1 katori salad) | 419 | 12 | 60 | 19 |
| Evening snack | 17:00 | snack | Buttermilk, low fat `f1000001-0000-4000-8000-000000000010` 250 g (1 glass chaas); Apple, with skin (seb) `40103865-37b4-5a5b-a69a-f594201d0941` 150 g (1 apple); Peanuts, dry-roasted `e4f5e114-efd6-540b-afc4-b1d351abfbe2` 20 g (1 small handful) | 303 | 14 | 37 | 13 |
| Dinner | 20:30 | dinner · photo | Palak paneer `f1000001-0000-4000-8000-000000000017` 300 g (1 bowl); Chapati / roti `f1000001-0000-4000-8000-000000000001` 72 g (2 roti); Cucumber raita `9254a815-7d6b-5df8-8486-7e4a78dcfc57` 100 g (½ bowl) | 438 | 20 | 56 | 19 |

#### N02 · South Indian Veg · PCOS-friendly · ~1750 kcal
For: PCOS / insulin-sensitive (Meera, Lakshmi). **Day total ≈ 1755 kcal · P 64 g · C 234 g · F 79 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 07:45 | breakfast | Moong bean dosa `b5294110-3544-5a93-a14e-63ceb742334a` 120 g (2 pesarattu); Coconut chutney `f1000001-0000-4000-8000-00000000001f` 30 g (2 tbsp); Sambar `f1000001-0000-4000-8000-000000000007` 150 g (1 small bowl) | 568 | 21 | 71 | 28 |
| Mid-morning | 11:00 | snack | Buttermilk, low fat `f1000001-0000-4000-8000-000000000010` 250 g (1 glass); Guava (amrood) `30f92e88-2a3a-59a3-b0ff-eb0ee4f1f2fc` 100 g (1 guava) | 175 | 11 | 26 | 4 |
| Lunch | 13:00 | lunch · photo | Rice, brown, cooked `1b35bd63-a8c6-5d9e-a912-7d6bfbe9774b` 120 g (¾ katori); Sambar `f1000001-0000-4000-8000-000000000007` 200 g (1 bowl); Beans thoran `0d623d55-194a-5dfe-ad12-fd09b2c4f79c` 100 g (1 katori); Curd / dahi, low fat `819f0c27-dde8-50c0-8684-e0b8fb4c997a` 100 g (½ katori) | 536 | 18 | 76 | 23 |
| Dinner | 20:00 | dinner · photo | Jowar dosa `4f3029e5-0b21-5622-8976-975029372471` 66 g (2 jowar dosa); Avial `e6b9ad73-f6ed-53a2-b567-1b63abe6506d` 150 g (1 katori); Paneer tikka `f1000001-0000-4000-8000-00000000000b` 100 g (4 pieces) | 475 | 14 | 60 | 25 |

#### N03 · Jain Veg · Metabolic Health · ~1540 kcal
For: prediabetes / Jain (Siddharth, Priya S.). **Day total ≈ 1540 kcal · P 62 g · C 204 g · F 68 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 08:00 | breakfast | Moong dal stuffed chilla `f1000001-0000-4000-8000-000000000028` 200 g (2 chilla); Milk, 2% fat (close to toned milk 3%) `f1000001-0000-4000-8000-000000000026` 200 g (1 cup milk, no sugar) | 410 | 21 | 57 | 14 |
| Lunch | 13:00 | lunch · photo | Chapati / roti `f1000001-0000-4000-8000-000000000001` 72 g (2 roti); Dal dhokli `861381bb-4ab9-58e9-a83b-e6fbc6bfc7ad` 250 g (1 bowl); Bharwa bhindi `5aeb30db-3bca-5625-a293-19d1249740d0` 100 g (1 katori); Lauki ka raita `65e1b2ea-1a9e-5e76-8056-1ac271b87453` 120 g (1 bowl) | 479 | 19 | 72 | 19 |
| Snack | 17:00 | snack | Peanuts, dry-roasted `e4f5e114-efd6-540b-afc4-b1d351abfbe2` 25 g (1 handful); Chai (with milk and sugar) `3625d6da-6363-5225-b8cb-4af894ada379` 150 g (1 cup chai) | 171 | 7 | 9 | 13 |
| Dinner (before sunset on chauvihar days) | 19:00 | dinner | Panchmel dal `d0c5c764-7037-5983-b115-b10918642fdb` 200 g (1 bowl); Jowar dosa `4f3029e5-0b21-5622-8976-975029372471` 66 g (2); Tossed salad `f1000001-0000-4000-8000-000000000019` 100 g (1 katori) | 480 | 16 | 65 | 22 |

#### N04 · Eggetarian · High Protein · ~1640 kcal
For: fat loss women eggetarian (Divya, Ananya). **Day total ≈ 1636 kcal · P 104 g · C 175 g · F 66 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 08:00 | breakfast · photo | Egg omelette, plain `810148cb-1879-5545-9a04-14c2b739347b` 165 g (3-egg omelette); Bread, whole wheat (brown bread) `2c1763a8-92a1-5805-a27e-561a6d48f2aa` 56 g (2 slices); Orange (santra/narangi) `23134f4b-dd53-56b6-8017-b0f98046a5b5` 130 g (1 orange) | 460 | 26 | 41 | 21 |
| Lunch | 13:30 | lunch · photo | Chapati / roti `f1000001-0000-4000-8000-000000000001` 72 g (2 roti); Rajma curry `f1000001-0000-4000-8000-000000000008` 180 g (1½ bowl); Tossed salad `f1000001-0000-4000-8000-000000000019` 100 g (1 katori) | 467 | 16 | 77 | 17 |
| Post-workout | 18:00 | snack | Whey protein powder (isolate) `f1000001-0000-4000-8000-000000000020` 32 g (1 scoop in water); Banana, ripe (kela) `f1000001-0000-4000-8000-00000000001c` 115 g (1 banana) | 224 | 26 | 28 | 1 |
| Dinner | 20:30 | dinner · photo | Palak mushroom egg bhurji `088fafc9-4f88-5125-b4fa-3b929ccd2c2d` 200 g (1 bowl); Chapati / roti `f1000001-0000-4000-8000-000000000001` 36 g (1 roti); Curd / dahi, low fat `819f0c27-dde8-50c0-8684-e0b8fb4c997a` 150 g (1 katori) | 485 | 37 | 28 | 27 |

#### N05 · Eggetarian Gujarati · Lean Bulk · ~3040 kcal
For: gain phase (Aarav). **Day total ≈ 3044 kcal · P 161 g · C 373 g · F 118 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 07:30 | breakfast | Oats, rolled `d8dd028f-fe1a-5cb3-8de9-e51b3a4568fc` 60 g (60 g oats); Milk, 2% fat (close to toned milk 3%) `f1000001-0000-4000-8000-000000000026` 300 g (300 ml milk); Banana, ripe (kela) `f1000001-0000-4000-8000-00000000001c` 115 g (1 banana); Egg, whole, hard-boiled `70f42638-188d-5c80-bd9e-41143188cfc9` 150 g (3 boiled eggs) | 721 | 38 | 84 | 26 |
| Lunch | 13:00 | lunch · photo | Chapati / roti `f1000001-0000-4000-8000-000000000001` 108 g (3 roti); Chana dal `2d4041d6-0eac-561b-836b-31415c24f2c8` 250 g (1 bowl); Aloo ki sabzi `b8a6228d-52b5-5086-a89e-632abce44d2f` 120 g (1 katori); Curd / dahi (plain yogurt, whole milk) `f1000001-0000-4000-8000-00000000000f` 150 g (1 katori) | 667 | 24 | 102 | 26 |
| Pre-workout | 17:30 | snack | Dhokla `b2e27cf0-5516-57a4-8a0e-a4edd18d7c84` 120 g (4 pieces); Peanut butter, creamy `49704d10-adfe-51da-a977-79c5b541c57d` 25 g (1 tbsp on 1 slice); Bread, whole wheat (brown bread) `2c1763a8-92a1-5805-a27e-561a6d48f2aa` 28 g (1 slice) | 478 | 26 | 60 | 20 |
| Post-workout | 19:30 | snack | Whey protein powder (isolate) `f1000001-0000-4000-8000-000000000020` 32 g (1 scoop); Milk, 2% fat (close to toned milk 3%) `f1000001-0000-4000-8000-000000000026` 250 g (250 ml) | 238 | 33 | 14 | 6 |
| Dinner | 21:00 | dinner · photo | Methi thepla `a8b5601a-c1ad-50e0-821b-766599caecfc` 73 g (2 thepla); Vegetable khichdi `7b6a82ce-ea7d-50c5-a179-8d814cae9bcb` 300 g (1½ bowl); Egg omelette, plain `810148cb-1879-5545-9a04-14c2b739347b` 110 g (2-egg omelette); Cucumber raita `9254a815-7d6b-5df8-8486-7e4a78dcfc57` 150 g (1 bowl) | 940 | 41 | 113 | 41 |

#### N06 · North Indian Non-veg · Fat Loss · ~1790 kcal
For: men fat loss (Rohan, Vikram, Imran). **Day total ≈ 1786 kcal · P 99 g · C 196 g · F 77 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 08:30 | breakfast | Vegetable poha `0bec7034-2445-53d1-a6be-69dd361daa75` 250 g (1 plate); Egg, whole, hard-boiled `70f42638-188d-5c80-bd9e-41143188cfc9` 100 g (2 boiled eggs) | 606 | 25 | 64 | 31 |
| Lunch | 13:30 | lunch · photo | Rice, white, cooked (long grain) `bbfa1485-97dd-5b9c-968f-a5725b22a08f` 150 g (1 katori rice); Chicken curry `f1000001-0000-4000-8000-00000000000c` 250 g (1 bowl); Tossed salad `f1000001-0000-4000-8000-000000000019` 100 g (1 katori) | 581 | 35 | 61 | 24 |
| Snack | 17:30 | snack | Sprouted moong chaat `f1000001-0000-4000-8000-00000000001a` 150 g (1 bowl); Chai (with milk and sugar) `3625d6da-6363-5225-b8cb-4af894ada379` 150 g (1 cup) | 73 | 3 | 15 | 1 |
| Dinner | 21:00 | dinner · photo | Tandoori chicken `c92efc75-7b18-533a-95a3-0bbcb09ca213` 150 g (4 pieces); Chapati / roti `f1000001-0000-4000-8000-000000000001` 72 g (2 roti); Matar ki sabzi `d389b9b4-6260-522c-a2c7-6801cd04bd86` 100 g (1 katori); Cucumber raita `9254a815-7d6b-5df8-8486-7e4a78dcfc57` 100 g (½ bowl) | 526 | 37 | 55 | 22 |

#### N07 · Kerala Non-veg · Fish & Rice · ~1970 kcal
For: Malayali clients (Deepak, Rajesh, Kavya). **Day total ≈ 1968 kcal · P 95 g · C 182 g · F 110 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 07:30 | breakfast | Appam `f140c4b0-7b12-57e0-9e8a-5fe1bcb3051e` 120 g (2 appam); Egg, whole, hard-boiled `70f42638-188d-5c80-bd9e-41143188cfc9` 100 g (2 eggs); Tea, black, brewed `8bb500ae-ea81-5a3b-8629-d6c2afa1f92b` 150 g (black tea) | 478 | 16 | 25 | 38 |
| Lunch | 13:00 | lunch · photo | Rice, red, raw `d479e3f9-fb68-5157-842c-441937507215` 60 g (red rice (60 g raw)); Fish curry `f1000001-0000-4000-8000-000000000024` 250 g (1 bowl meen curry); Cabbage carrot thoran (with coconut) `7cc15c42-81ed-5c6c-915d-497cc0623a63` 100 g (1 katori); Buttermilk, low fat `f1000001-0000-4000-8000-000000000010` 250 g (1 glass moru) | 708 | 38 | 81 | 30 |
| Snack | 16:30 | snack | Banana, ripe (kela) `f1000001-0000-4000-8000-00000000001c` 115 g (1 nendran-size banana); Peanuts, dry-roasted `e4f5e114-efd6-540b-afc4-b1d351abfbe2` 25 g (1 handful) | 258 | 7 | 32 | 13 |
| Dinner | 20:00 | dinner · photo | Chapati / roti `f1000001-0000-4000-8000-000000000001` 72 g (2 chapati); Chicken yakhni `adf5d23f-d5aa-554e-a514-100af6a86f70` 250 g (1 bowl); Beans thoran `0d623d55-194a-5dfe-ad12-fd09b2c4f79c` 100 g (1 katori) | 525 | 34 | 44 | 29 |

#### N08 · Veg (no eggs) · High Protein Bulk · ~2860 kcal
For: veg strength (Harpreet). **Day total ≈ 2863 kcal · P 127 g · C 390 g · F 112 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 07:00 | breakfast | Paneer paratha `75f1d9ac-3d62-5ffe-8a68-f61d2efe0a49` 170 g (2 paratha); Curd / dahi (plain yogurt, whole milk) `f1000001-0000-4000-8000-00000000000f` 200 g (1 bowl); Milk, 2% fat (close to toned milk 3%) `f1000001-0000-4000-8000-000000000026` 250 g (1 glass) | 694 | 29 | 70 | 36 |
| Lunch | 13:00 | lunch · photo | Chapati / roti `f1000001-0000-4000-8000-000000000001` 144 g (4 roti); Rajma curry `f1000001-0000-4000-8000-000000000008` 240 g (2 bowls); Rice, white, cooked (long grain) `bbfa1485-97dd-5b9c-968f-a5725b22a08f` 150 g (1 katori); Tossed salad `f1000001-0000-4000-8000-000000000019` 100 g (1 katori) | 894 | 28 | 163 | 24 |
| Post-run | 17:30 | snack | Whey protein powder (isolate) `f1000001-0000-4000-8000-000000000020` 32 g (1 scoop); Banana, ripe (kela) `f1000001-0000-4000-8000-00000000001c` 230 g (2 bananas); Peanuts, dry-roasted `e4f5e114-efd6-540b-afc4-b1d351abfbe2` 25 g (1 handful) | 482 | 33 | 60 | 14 |
| Dinner | 20:30 | dinner · photo | Matar paneer `a3ac8614-82b8-50a4-853e-f260c096619f` 280 g (1 bowl); Chapati / roti `f1000001-0000-4000-8000-000000000001` 108 g (3 roti); Soyabean curry `8d10c4ac-2d2e-5d74-b7ba-506da6be92eb` 120 g (1 bowl) | 792 | 37 | 98 | 38 |

#### N09 · Travel & Eating-out · Non-veg · ~2010 kcal
For: consultants/NRIs (Farhan, Fatima). **Day total ≈ 2009 kcal · P 147 g · C 208 g · F 68 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Hotel breakfast | 07:30 | breakfast | Egg omelette, plain `810148cb-1879-5545-9a04-14c2b739347b` 165 g (3-egg omelette); Bread, whole wheat (brown bread) `2c1763a8-92a1-5805-a27e-561a6d48f2aa` 56 g (2 toast); Fruit salad `f1000001-0000-4000-8000-00000000001b` 150 g (1 bowl fruit) | 513 | 26 | 51 | 23 |
| Client lunch | 13:30 | lunch · photo | Tandoori chicken `c92efc75-7b18-533a-95a3-0bbcb09ca213` 200 g (tandoori/grilled chicken); Naan `3c07e1c1-a6fd-5e53-b818-239d8b6fa000` 53 g (1 naan); Tossed salad `f1000001-0000-4000-8000-000000000019` 150 g (salad); Rice, white, cooked (long grain) `bbfa1485-97dd-5b9c-968f-a5725b22a08f` 150 g (1 katori) | 732 | 42 | 87 | 25 |
| Snack | 17:00 | snack | Yogurt, Greek, plain, nonfat `ffa13f00-fe3d-5c9b-be13-6da0012e54eb` 170 g (1 cup Greek yogurt); Almonds (badam), raw `36c3a672-00d4-5b61-9912-debdf199f255` 25 g (1 handful) | 246 | 23 | 11 | 13 |
| Dinner | 21:00 | dinner · photo | Chicken breast, skinless, cooked `2f3e8399-1d99-507b-b715-8f389c89213c` 150 g (grilled chicken breast); Rice, brown, cooked `1b35bd63-a8c6-5d9e-a912-7d6bfbe9774b` 150 g (1 katori); Mixed vegetables, frozen, boiled `e0330cde-ee6b-578d-bf8d-e4f36bb3d457` 150 g (sautéed veg) | 518 | 57 | 58 | 6 |

#### N10 · Bengali Fish · Balanced · ~1670 kcal
For: Bengali (Ishita). **Day total ≈ 1669 kcal · P 79 g · C 220 g · F 60 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 09:00 | breakfast | Oats, rolled `d8dd028f-fe1a-5cb3-8de9-e51b3a4568fc` 50 g (oats); Milk, 2% fat (close to toned milk 3%) `f1000001-0000-4000-8000-000000000026` 200 g (milk); Banana, ripe (kela) `f1000001-0000-4000-8000-00000000001c` 115 g (1 banana) | 401 | 14 | 70 | 7 |
| Lunch | 14:00 | lunch · photo | Rice, white, cooked (long grain) `bbfa1485-97dd-5b9c-968f-a5725b22a08f` 150 g (1 katori); Moong dal (dhuli) `62847307-94cb-590a-997a-bc15718b27de` 200 g (1 katori dal); Fish curry `f1000001-0000-4000-8000-000000000024` 200 g (1 piece macher jhol) | 517 | 27 | 68 | 17 |
| Snack | 17:30 | snack | Rice, puffed (murmura) `4292d1e2-64dd-5a48-92d9-5d2c87fe198d` 28 g (jhal muri (2 cups)); Peanuts, dry-roasted `e4f5e114-efd6-540b-afc4-b1d351abfbe2` 25 g (peanuts); Chai (with milk and sugar) `3625d6da-6363-5225-b8cb-4af894ada379` 150 g (1 cup) | 283 | 8 | 34 | 13 |
| Dinner | 21:00 | dinner · photo | Chapati / roti `f1000001-0000-4000-8000-000000000001` 72 g (2 roti); Chicken curry `f1000001-0000-4000-8000-00000000000c` 200 g (1 bowl); Tossed salad `f1000001-0000-4000-8000-000000000019` 100 g (salad) | 467 | 29 | 47 | 22 |

#### N11 · Navratri / Vrat Day · ~1380 kcal
For: festival fasting days (Divya, Siddharth, Neha). **Day total ≈ 1380 kcal · P 49 g · C 166 g · F 65 g.**

| Meal | Time | Type | Items (library name, id, grams) | kcal | P | C | F |
|---|---|---|---|---|---|---|---|
| Breakfast | 08:00 | breakfast | Milk, 2% fat (close to toned milk 3%) `f1000001-0000-4000-8000-000000000026` 250 g (1 glass milk); Banana, ripe (kela) `f1000001-0000-4000-8000-00000000001c` 115 g (1 banana); Almonds (badam), raw `36c3a672-00d4-5b61-9912-debdf199f255` 25 g (10 almonds) | 383 | 14 | 43 | 18 |
| Lunch | 13:00 | lunch · photo | Sabudana khichdi `8dd0af01-3ccf-53dc-85a0-4f9b9b06d4f3` 200 g (1 plate); Curd / dahi, low fat `819f0c27-dde8-50c0-8684-e0b8fb4c997a` 150 g (1 katori) | 469 | 13 | 59 | 23 |
| Snack | 17:00 | snack | Fruit salad `f1000001-0000-4000-8000-00000000001b` 200 g (1 bowl); Peanuts, dry-roasted `e4f5e114-efd6-540b-afc4-b1d351abfbe2` 25 g (1 handful) | 303 | 8 | 40 | 15 |
| Dinner | 20:00 | dinner · photo | Paneer tikka `f1000001-0000-4000-8000-00000000000b` 150 g (paneer tikka (sendha namak)); Lauki ka raita `65e1b2ea-1a9e-5e76-8056-1ac271b87453` 150 g (1 bowl) | 225 | 14 | 24 | 10 |

### 5.3 Combined (full-plan) templates (`template_type='combined'`)
| Code | Title | Content |
|---|---|---|
| C01 | Fat-loss starter · Home 4x + North Indian veg | W05 + N01 |
| C02 | Lean bulk · Upper/Lower + Eggetarian | W02 + N05 |
| C03 | Travel-proof · Hotel 3x + Eating-out | W06 + N09 |
(Fills the "none seeded" gap noted in `09-demo-data.md` for TW-27.)

### 5.4 Onboarding forms (trainer-owned; `onboarding_form_templates` + insert-only `onboarding_form_versions`)
Global "Default onboarding" v1 (`11111111-…`, 5 legacy textarea fields: goals, relevant_history, preferences, schedule, limitations) stays untouched. Rahul owns:

**OF1 "FitBud Intake — Rahul" v1 (created R−200 d) and v2 (R−60 d; adds `cycle_regular`, `festival_fasting`, splits `diet_type` options).** v2 is the form on all new invites; personas who joined before R−60 keep v1 responses.

| Section | id | Label | Type | Options / unit | Req | Highlight |
|---|---|---|---|---|---|---|
| About you | `primary_goal` | What's the main goal for the next 3 months? | single_choice | fat_loss "Lose fat", muscle_gain "Build muscle", strength "Get stronger", health "Health markers (sugar, BP, PCOS)", performance "Sport / test prep", consistency "Build a routine" | ✓ | |
| About you | `goal_detail` | Tell me in your own words what success looks like | long_text | max 1000 | ✓ | |
| About you | `height_cm` | Height | number | cm | ✓ | |
| About you | `weight_kg` | Current weight | number | kg | ✓ | |
| About you | `occupation_schedule` | Work hours and shift pattern | short_text | | ✓ | |
| Health | `medical_conditions` | Any medical conditions? | multiple_choice | none, thyroid "Thyroid", pcos "PCOS/PCOD", diabetes "Diabetes / prediabetes", bp "High BP", asthma, other | ✓ | ✓ |
| Health | `medications` | Medicines or supplements you take | short_text | | | ✓ |
| Health | `injuries` | Injuries or pain (knee, back, shoulder…) | long_text | | | ✓ |
| Health | `cycle_regular` (v2) | Are your periods regular? (skip if not applicable) | single_choice | yes, no, na "Not applicable" | | |
| Training | `experience` | Training experience | single_choice | none "Never trained", lt1 "< 1 year", y1_3 "1–3 years", gt3 "3+ years" | ✓ | |
| Training | `where_train` | Where will you train? | single_choice | gym "Gym", home "Home", both "Both / travel" | ✓ | |
| Training | `equipment_home` | Equipment at home | multiple_choice | none, dumbbells, bands, kettlebell, bench, pullup_bar | | |
| Training | `days_per_week` | Days you can realistically train | number | days | ✓ | |
| Training | `preferred_time` | Preferred workout time | single_choice | early "5–7 am", morning "7–10 am", evening "5–8 pm", late "after 8 pm" | ✓ | |
| Food | `diet_type` | Food preference | single_choice | veg "Vegetarian", veg_no_egg "Vegetarian (no egg)", egg "Eggetarian", nonveg "Non-vegetarian", jain "Jain", vegan "Vegan" | ✓ | |
| Food | `cuisine` | Home cuisine | single_choice | north, south, gujarati, bengali, maharashtrian, kerala, other | ✓ | |
| Food | `who_cooks` | Who cooks at home? | single_choice | self, family, cook "Cook / maid", tiffin "Tiffin / outside" | ✓ | ✓ |
| Food | `allergies` | Allergies or foods you avoid | short_text | | | ✓ |
| Food | `festival_fasting` (v2) | Do you fast regularly (Navratri, Ekadashi, Ramzan, Karwa Chauth, Paryushan…)? | short_text | | | ✓ |
| Food | `alcohol` | Alcohol | single_choice | never, social "Socially (≤2/month)", weekly | | |
| Lifestyle | `sleep_hours` | Average sleep | number | hours | ✓ | |
| Lifestyle | `steps` | Average daily steps (if you know) | number | steps | | |
| Lifestyle | `stress` | Stress level these days | single_choice | low, medium, high | | |
| Lifestyle | `why_now` | Why now? What's different this time? | long_text | | | |
| Consent | `photos_ok` | OK to share progress photos with me (private)? | yes_no | | ✓ | |

**OF2 "Quick intake — returning / reactivation" v1** (used for Nikhil's reactivation intake update and Imran's August return): `what_changed` long_text ✓, `weight_kg` number ✓, `new_injuries` long_text (highlight), `days_per_week` number ✓, `goal_now` single_choice (same options as primary_goal) ✓.

**Answer realism**: answers come from the persona sheet (§4) in Indian English, e.g. Sneha `goal_detail`: "Want to run the Pune half's 5K in Dec without walking, and fit into my old kurtas. Office is 9:30–7, so mornings only."; `medical_conditions`: ["thyroid"], `medications`: "Thyronorm 50 mcg"; Vikram's draft stops after `where_train` (Health section unanswered except `medical_conditions`).

### 5.5 Check-in forms (trainer-owned; `checkin_form_templates` + insert-only `checkin_form_versions`)
Global "Weekly check-in" v1 (`c1000001-…-011`: body_weight, waist, photo_front/side/back, wellbeing, notes) stays; never insert a second global version. Answers always also fill the legacy keys (`wellbeing` required, `notes`, `bodyWeightKg`, `photoIntent`) plus `fieldAnswers{}`.

**CF1 "Weekly coaching check-in" (Rahul) v1 (R−200 d) → v2 (R−90 d, adds `steps_avg` and `cycle_phase`)** — default for weekly clients via `checkin_schedules.preferred_checkin_form_version_id`.

| id | Label | Type | Notes |
|---|---|---|---|
| `body_weight` | Average morning weight this week | measurement `body_weight_kg` | required for fat-loss/gain |
| `waist` | Waist at navel | measurement `waist_cm` | |
| `photo_front` / `photo_side` / `photo_back` | Front / Side / Back photo | photo_intent front/side/back | same light, fasted |
| `sessions_done` | How many planned workouts did you complete? | single_choice | all, most, some, none |
| `training_feel` | How did training feel? | scale_1_5 | low "Very easy", high "Very hard" |
| `diet_adherence` | How closely did you follow the meal plan? | scale_1_5 | low "Not at all", high "100 %" |
| `energy` / `sleep` / `stress` | Energy · Sleep quality · Stress | scale_1_5 ×3 | |
| `hunger` | Hunger between meals | scale_1_5 | |
| `pain` | Any pain or niggles? | yes_no | follow-up in `notes` |
| `steps_avg` (v2) | Average daily steps | number `steps` | |
| `cycle_phase` (v2) | Where are you in your cycle? | single_choice | period, follicular, ovulation, luteal "Pre-period", na |
| `wellbeing` | One line: how was the week? | short_text ✓ | legacy key |
| `win` | One win this week | short_text | |
| `obstacle` | What got in the way? | short_text | |
| `notes` | Anything you need from me? | long_text | legacy key |

**CF2 "Strength check-in" v1** (Arjun, Aarav, Harpreet, Ananya): body_weight, `top_squat`/`top_bench`/`top_deadlift` (number `kg`), `sessions_done`, `training_feel`, `sleep`, `pain`, wellbeing, notes.
**CF3 "Monthly maintenance review" v1** (biweekly/monthly clients: Siddharth, Rajesh, Farhan): body_weight, waist, `bp_reading` (short_text "128/82"), `fasting_sugar` (number `mg/dL`), `steps_avg`, `diet_adherence`, `wellbeing`, `goal_next_month` (short_text), notes.
Priya: forks CF1 into "Priya weekly" v1. Nova: none.

### 5.6 Persona → template assignment
Plan versions are created from templates (`creation_source='template'`, `source_template_id`) and then adjusted (`'adjustment'`/`'previous_version'`) as the story requires. Loads are persona-specific (start load = estimated 10RM × 0.85; see §6.4).

| Persona | Workout (version history) | Diet | kcal target (adj.) | Onboarding | Check-in form · cadence |
|---|---|---|---|---|---|
| Aarav | v1 W01 (wk 1–6) → v2 W03 PPL (wk 7–16) → v3 W02 U/L (wk 17–now, effective) | N05 | 2900 → 3050 (v2) | OF1 v1 | CF2 · weekly |
| Rohan | v1 W02 → v2 W02 + N06 −150 kcal (plateau, wk 9) → **v3 draft** W02 cut to 3 days | N06 | 1900 → 1750 | OF1 v1 | CF1 v2 · weekly |
| Meera | v1 W05 (home) → v2 W01 (joined gym) → **v3 scheduled** (next Mon, lunch moved 12:30) | N02 | 1550 | OF1 v1 | CF1 v2 · weekly |
| Farhan | W06 (v1), v2 adds Bodyweight day for no-gym hotels | N09 | 2200 | OF1 v1 | CF3 · biweekly |
| Ishita | W05 → v2 W01 when she joined a gym near office | N10 | 1650 | OF1 v1 | CF1 v2 · weekly |
| Kavya | W07 (v1 wk 1–8, v2 wk 9–16 adds Strength C) | N07 (lactation +300 kcal in v1) | 2250 → 1950 | OF1 v1 | CF1 · weekly (ended) |
| Nikhil | W02 | N06 | 2000 | OF1 v1 + OF2 requested | CF1 · weekly (ended) |
| Deepak | W02 → v2 W02 + 15-min cardio finisher | N07 (Dubai times) | 2000 → 1850 | OF1 v1 | CF1 v2 · weekly |
| Arjun | W04 (v1 block 1, v2 block 2 heavier, **v3 deload week scheduled**) | N06 (+300 kcal maintenance) | 2400 | OF1 v1 | CF2 · weekly |
| Neha | W05 | N01 | 1450 | OF1 v2 | CF1 v2 · weekly |
| Priya S. | W10 | N03 (Jain) | 1600 | OF1 v1 | CF1 v2 · weekly |
| Lakshmi (Priya) | Priya fork of W01 | Priya fork of N02 | 1600 | global v1 | Priya weekly · weekly |
| Karan (Priya) | Priya fork of W02 | Priya fork of N07 | 2300 | global v1 | Priya weekly · weekly |
| Siddharth | W08 → v2 W01 | N03 (+ N11 on Paryushan days via `applicableWeekdays`-free day swap) | 1700 | OF1 v1 | CF3 · biweekly |
| Ananya | W11 | N04 | 1700 | OF1 v2 | CF2 · weekly |
| Imran | W10 (night-shift times 23:00/03:00 meals) | N06 | 1850 | OF1 v1 + OF2 | CF1 v2 · weekly |
| Pooja | W05 | N01 | 1450 | OF1 v2 | CF1 v2 · weekly |
| Rajesh | W08 | N07 | 1900 | OF1 v1 | CF3 · monthly |
| Fatima | W09 | N09 (halal) | 1800 | OF1 v1 | CF1 v2 · weekly |
| Divya | W02 → v2 W05 extra conditioning day; Navratri week uses N11 on fasting days | N04 | 1550 | OF1 v2 | CF1 v2 · weekly |
| Harpreet | none yet (coaching_ready); draft config only | — | — | OF1 v2 (reviewed) | — |
| Sneha | — (awaiting review) | — | — | OF1 v2 (submitted) | — |
| Vikram | — (draft intake) | — | — | OF1 v2 (draft) | — |
| Anita | — (invite with OF1 v2) | — | — | — | — |

## 6. Generator plan

### 6.1 Module layout (Phase 2 to build)
```
apps/api/src/seed/demo/
  spec.ts            (unchanged 19 accounts) + spec-extra.ts (8 new personas, same DemoAccountSpec shape)
  ids.ts             (unchanged)
  generator/
    index.ts         generateDemoWorld(input) → { files: { name, sql }[] , stats }
    rng.ts           seeded PRNG + helpers
    clock.ts         IST/tz day math built on ids.localDayStartIso + @fitbud/core addDaysToLocalDate
    personas.ts      24 persona configs (§4) incl. arcs as event lists
    templates/       workouts.ts, diets.ts, forms.ts  (ported from tools/templates.py tables)
    entities/        relationships.ts, onboarding.ts, config.ts, plans.ts, schedule.ts,
                     meals.ts, workouts.ts, checkins.ts, progress.ts, exceptions.ts,
                     asks.ts, notes.ts, notifications.ts, reminders.ts, invites.ts
    sql.ts           multi-row INSERT builder + file chunker
    validate.ts      zod-validates every content_json/answers_json/schema_json with @fitbud/contracts
```
`build.ts` keeps users/roles/profiles/identities (extended to the 8 new accounts with the same phone counter continuing at 19+) and calls `generateDemoWorld` instead of `buildDemoHistorySql`. `seed-demo.ts` writes `.wrangler/demo-seed-NN.sql` and applies each in order (array-arg `spawnSync`, `spawnOptions()` ⇒ Windows-safe). `demo-seed.test.ts` keeps its persona-state assertions and adds: determinism (two runs with the same NOW/SEED → identical SQL hash), "no timestamp > NOW except future windows", "≤10 open exceptions per relationship", "every gap in last 3 days has an exception or a log", zod validity.

### 6.2 Determinism
- PRNG: **sfc32** seeded from `sha256(SEED + "|" + streamKey)` (first 16 bytes → 4×uint32). One independent stream per (persona, entity kind) — e.g. `rng("aarav", "meals")` — so editing one persona/entity never shifts another's numbers. Helpers: `float()`, `int(a,b)`, `chance(p)`, `pick(arr)`, `weighted(map)`, `normal(μ,σ)` (Box–Muller), `ar1(φ,σ)`.
- Never call `Math.random`, `Date.now`, `crypto.randomUUID`. IDs: `demoUuid(kind, personaKey, …naturalKey)` (e.g. `demoUuid("meal-assignment", "aarav", "2026-10-14", rxId)`), so IDs are stable for a given NOW and the persona-level IDs (users, relationships, invites, the IDs listed in `09-demo-data.md` for Rohan/Meera exceptions, templates, check-ins) are kept by reusing the exact existing recipes in `history.ts` for those rows.
- Dates: `R = kolkataLocalDate(NOW)`; every persona event is an offset in days from R (`R-154`), converted to the trainee's local date and then to UTC with `localDayStartIso(date, "HH:MM", tz)`. Times of day are drawn per persona habit (e.g. Aarav logs breakfast 07:40±15 min) and clamped `≤ NOW`. Weekday logic uses the trainee-local weekday. Absolute festival dates are applied only if they fall inside `[start, R]`; otherwise they are skipped (arcs still read naturally because each persona also has generic events).
- `NOW` default: `process.env.NOW ?? new Date().toISOString()` (unchanged); for screenshots pin `NOW` (e.g. `2026-10-18T04:30:00Z`) in both the seed and `.dev.vars`.

### 6.3 Behaviour model (shared)
Per persona config: `baseMeal`, `baseWorkout`, `profile` (A/B/C/D/E/H), `weekdayMult` (§3.4), `events[]` (`{from,to,kind:"travel"|"festival"|"sick"|"wedding"|"exam"|"shift"|"family", mealMult, workoutMult, deviationBoost, weightBump}`).
`pLog(day) = clamp(base · weekdayMult[wd] · decay(week) · coachBoost(day) · Π event.mult, 0.02, 0.99)` where `decay` by profile: A flat 1.0; B 1.0→0.92; C noisy around 0.65 (weekly random walk σ 0.08); D 1.0 until its break week, then exp(−0.12·weeks); E like C then 0 for the last N days; H 0.97. `coachBoost` = +0.08 for 3 days after a reviewed check-in, trainer note or answered ask.
Meal outcome given logged: confirmed 70–85 %, modified (deviation kinds: portion_adjustment 30, substitute 25, restaurant 15 (×2 Sat), repeat_recent 10, logged_foods 15, manual/other 5), skipped 5–10 % (breakfast-heavy for C/D). `logged_late` when logged after window end (8 % baseline, 20 % for D). Photos when `photo_required` and logged: 85 % (A) … 40 % (C) → `media_assets` (status ready; 1 failed per 200).
Workout: completed / modified (some sets skipped or loads changed) / skipped / missed (no execution). Session RPE 6–9 (normal around prescribed RPE +0.3 on bad-sleep weeks). Paused executions: 1 % (TR-11 resume).

### 6.4 Per-entity rules
| Entity | Rule |
|---|---|
| users/roles/profiles/identities | Existing 18 users exactly as today + 8 new (timezone from persona; DOB from age/birthday). Karan dual role kept. Trainer prefs rows for Rahul/Priya. |
| client_invitations | Anita pending/expired/revoked (existing ids) + reissue link (`reissued_from_id`); one accepted invite per relationship (`accepted_user_id`, `invitation_id` on the relationship) dated `start−1..3 d`; Kavya-Priya pending. |
| coaching_relationships | `started_at = R − tenure`; Kavya/Nikhil ended R−10 (`end_reason`: "Program completed" / "Travelling for work — will restart"); Imran: original relationship row reactivated (`reactivated_at` R−63; there is only one row per pair — model the June end via history/notes, `ended_at` cleared). |
| onboarding_form_responses / reviews | Submitted at start−1 d (reviewed start+0..1 d) with OF1 v1/v2 answers from persona sheet; Vikram draft; Sneha submitted R−2 unreviewed; Harpreet reviewed R−1. |
| coaching_configurations (+ expectations, schedules, tracking) | v1 active from start; v2 (superseded v1) when goal/cadence changed in the arc (Aarav goal change wk 7, Siddharth weekly→biweekly wk 20, Rohan sessions 4→3 draft). Harpreet: `draft`. `photo_requirement` per persona (Divya/Meera all_meals, most selected_meals (lunch+dinner), Farhan none). `due_window_hours` 48. |
| subscription_versions | Billing chain from start: weekly/monthly/quarterly/yearly periods; one version per renewal (`starts_on`, `renews_on`); last renews_on drives state: Imran due today (R), Divya upcoming R+4, Pooja expired R−3, Aarav current R+38, Rohan upcoming R+6, rest spread. |
| plans / plan_versions | One plan per relationship; versions per §5.6 with `effective_from/to` contiguous; superseded versions have `effective_to = next.effective_from − 1 d`; future `scheduled`; drafts `draft` (no assignments). `content_json` = template content materialised with fresh `demoUuid` ids per version and persona loads in `loadLabel` ("42.5 kg", "BW", "Band: red"). |
| plan_assignment_policies | For each nutrition-changing version: `today_onward`; one `today_only` (Divya Karwa Chauth day); Meera's v3 has `consistency_ack_fingerprint`. |
| workout/meal_assignments | For every effective version day in `[effective_from, min(effective_to, R+6)]` per weekday/`applicableWeekdays`; window = local day start → +`completion_window_hours`/`confirmation_window_hours`; when a version supersedes mid-way, earlier-generated future rows of the old version flip to `superseded` with `superseded_by_plan_version_id` (Meera v3 from next Monday ⇒ R+1..R+6 old rows superseded). Ended clients: future rows superseded at end (as today). |
| meal_compliance | Per §6.3; `items_json` + `*_scaled` computed with `foodSnapshotFromLibrary` for planned items (confirmed) or scaled/replaced items (modified); restaurant deviations use library dishes (butter chicken, naan, veg biryani, chilli chicken, pav bhaji); Lakshmi/Fatima use `trainee_custom_foods`. `client_logged_at` = logged_at − 0..2 min (offline lag 5 % up to 6 h). |
| workout/exercise/set_executions | For executed sessions: every exercise and set from the assignment snapshot; `actual_reps` around target (±1–2, fewer on last set when RPE ≥9), `actual_load_label` from the progression state machine: per exercise keep `load, repsTop`; success (all sets at top of range) → +increment next session; 2 consecutive failures → hold; 3 → stall flag (Arjun squat 110 kg 4 wk, Rohan bench during plateau); deload week −40 % sets (Arjun v3). Beginners (H) progress every session for 4–6 weeks then weekly. |
| checkins / checkin_reviews | Dates from cadence anchored on the persona's check-in weekday (mostly Sunday; Deepak Friday; Fatima Saturday); window = local day start → +48 h. Past ones: submitted (A 98 %, B 90 %, C 70 %, D drops to 40 %), 12 % submitted next day, missed ones stay `draft`-less rows only for the most recent 1–2 (past window ⇒ overdue). `answers_json` from phrase banks (§3.1) conditioned on the week's actual stats (sessions_done computed from executions, diet_adherence from compliance %, weight = weekly mean of the weight series). Reviews 1–30 h after submission, outcome mix 70/20/10 (ack/follow-up/adjust); `adjust_coaching` coincides with a new plan/config version within 3 days. Current week: some due today, 5–8 unreviewed submissions in Rahul's inbox, 2 drafts, 2 overdue (Priya S., Rohan). |
| measurements | Weight series per persona: trend from start weight → current (from arc) with AR(1) noise, weekend/Monday bump, luteal +0.6–1.0 kg, festival bumps; trainee self weigh-ins 1–4×/week by profile (`source='trainee_entry'`), check-in weekly mean (`source='checkin'`, `checkin_id`); waist/hip/chest every 2–4 weeks (−0.6…−1 cm per kg lost); `other` for Siddharth fasting sugar via CF3. One `trainer_entry` per persona at start (baseline taken on call). |
| media_assets / progress_entries | Check-in photos (front/side/back) on ~55 % of check-ins (`checkin_photo`, object_key `demo/<rel>/<checkin>/<slot>.jpg`, status ready; images are placeholders — Phase 2 decides whether to ship sample JPEGs in R2 local or leave keys dangling with a "Couldn't load photo" state for one); meal photos (`meal_photo`) for photo-required logs; progress entries: milestones ("First full push-up", "Down 5 kg", "Bench 75 kg"), notes. |
| exceptions / exception_actions / interventions | Derived from the generated logs using the same candidate rules as `@fitbud/core` (`missedWorkoutCandidate`, `overdueMealCandidate`, …, rule_version `mvp.v2`, same summaries/details) so they look exactly like runtime ones. Historical ones: resolved by condition (late log; `source_logged_late_at`) or by trainer (`exception_actions` acknowledge→resolve with notes from §3.3, `resolution_outcome`), detected→active the same minute. Open at R: match §4 adherence column (Rohan: critical missed workout Mon+Wed + overdue check-in; Meera: acknowledged missed lunch; Arjun: 2 missed workouts; Neha: lunch+dinner overdue yesterday; Priya S.: overdue check-in; Ishita: overdue breakfast; Imran: meal_logged_later; Farhan: skipped workout; Lakshmi: meal_deviation). **Coverage rule:** after generating logs, scan the last 3 local days for every candidate; each must have a seeded exception (open or resolved) or the log must exist — guarantees the runtime evaluator adds nothing; cap 10 open. Keep the 3 existing ids (Rohan active/resolved, Meera acknowledged). |
| coach_asks | ~1.5 per active client per month, topics per §3.2 distribution, items = real assignment/execution/checkin/plan_version ids; answered ones link `trainer_note_id` (shared note) and `answered_by` Rahul; open at R: Ishita portion_size (existing id), Rajesh pain (knee, on Lower exercise_execution), Divya festival, Fatima eating_out, Ananya exercise_form; 2 expired. |
| trainer_notes | Private notes on intake review and after resolves; shared notes from check-in reviews (visibility `client`, `shared_at`, `seen_at` for most, unseen for 3 recent), one unshared (`unshared_at`). |
| notifications (+ deliveries) | Trainee: reminders per enabled reminder_rule at meal/workout times (not every one — 60 %, dedupe keys stable), `checkin_reviewed`, `trainer_note_shared`, `coach_answered`, `plan_published`, `subscription_renewal_reminder`, `reminders_paused` (Farhan), `relationship_ended`, `reactivation_requested` (Nikhil). State read/delivered/failed; `opened_at` for 30–70 % by profile (drives TW-31). Trainer (Rahul): `trainer_checkin_submitted`, `trainer_intake_submitted`, `trainer_ask_coach`, `trainer_critical_digest` daily, `trainer_renewal`, `trainer_meal_times_changed` (Deepak). Keep last 60 days only to bound rows. Ishita: `suppressed` (push off). |
| notification_preferences / device_tokens / reminder_rules / reminder_states | Per persona: push on/off, quiet hours (Aarav 22:30–06:30, Imran daytime 09:00–16:00), channel `app_and_whatsapp` for 6 with opt-in fields, `preferred_workout_time`; Farhan reminder_state `paused` (consecutive_ignores 5, paused_until R+2); Pooja consecutive_ignores 4 mode normal; tokens ios/android, Ishita token active but push off. |
| meal_time_overrides | Deepak (all, Dubai), Aarav weekends breakfast 09:00, Imran night-shift (weekdays). |
| trainee_custom_foods | Lakshmi 3, Fatima 2, Harpreet 1 ("Pinni (homemade)"). |
| reactivation_requests | Nikhil pending (expires R+11, intake_update_requested=1); Imran: one expired (R−84) and one confirmed (created R−66, resolved R−63). Kavya has none. |
| sync_mutations | One `conflicted` row for Aarav on a superseded meal (TR-19). |
| change_log, scheduled_jobs, idempotency_records, auth_*, web_sessions, whatsapp_* | Left empty (runtime-owned). |
| plan_templates / form templates | §5; created R−200…R−30 with `record_version` 1–4 to look edited. Library custom items for Rahul: exercises "Society-gym cable row (single stack)", foods "Ragi dosa (home)", "Sattu sharbat". |

### 6.5 Rough row counts (Rahul ~19 active-history clients, avg ~15 weeks; Priya 2)
| Table | Rows |
|---|---|
| users / identities / profiles / roles | 26 / 26 / 27 / 28 |
| relationships, invitations | 23, ~30 |
| onboarding responses / reviews | 23 / 21 |
| configurations (+3 child tables each) | ~30 (+90) |
| subscription_versions | ~110 |
| plans / plan_versions / policies | 21 / ~50 / ~25 |
| meal_assignments | ~10,500 (≈21 × 105 d × 4.6 + 7 d future) |
| meal_compliance | ~7,500 |
| workout_assignments | ~1,500 |
| workout_executions / exercise_executions / set_executions | ~1,150 / ~5,500 / ~18,000 |
| checkins / reviews | ~330 / ~280 |
| measurements | ~1,600 |
| media_assets / progress_entries | ~1,200 / ~60 |
| exceptions / actions / interventions | ~900 / ~350 / ~80 |
| coach_asks / trainer_notes | ~110 / ~260 |
| notifications / deliveries | ~6,000 / ~4,000 (60-day cap) |
| prefs / tokens / rules / reminder_states / overrides / custom foods | ~28 / ~30 / ~84 / ~24 / ~10 / 6 |
| templates (plan / onboarding / check-in) | 26+ / 2 (+3 versions) / 4 (+5 versions) |
| **Total** | **≈ 60,000 rows** |

### 6.6 D1 batching and apply
- D1 limits (https://developers.cloudflare.com/d1/platform/limits/): max SQL statement length 100 KB, ≤100 bound parameters per query; the seed uses literal SQL (no bindings) so the statement-length limit is the one that bites. Rule: **multi-row `INSERT INTO t (cols) VALUES (…),(…)` with ≤ 200 rows and ≤ 90 KB per statement** (content_json/answers_json rows: 1 row per statement when > 20 KB).
- Files (each applied with one `wrangler d1 execute fitbud --local --persist-to .wrangler/state --file <f>`; each file is one batch/transaction, so a failure leaves earlier files applied — reruns are safe because `00` wipes):
  `00-wipe.sql` (existing `wipeAppData` + trainer form templates/versions + trainer library items) → `01-identity.sql` → `02-templates-forms.sql` → `03-relationships-onboarding-config-subs.sql` → `04-plans.sql` → `05-assignments.sql` → `06-logs-meals.sql` → `07-logs-workouts.sql` (exercise/set executions, chunked into 07a/b/c at ~4 MB each) → `08-checkins-progress-media.sql` → `09-exceptions-asks-notes.sql` → `10-notifications-prefs.sql`.
  Insert parents before children in every file so `PRAGMA defer_foreign_keys` is not relied on across files (keep it at the top of each file anyway).
- Expected size ~25–35 MB SQL; target < 60 s local apply. Write to `.wrangler/demo-seed/` and print per-file row counts + elapsed time. Windows: no shell pipes, globbing or `&&` inside scripts; paths via `path.join`; files written UTF-8 without BOM; line endings `\n` (wrangler accepts both).
- Verification hook (Phase 2): after apply, `seed-demo.ts` runs a read-only `node:sqlite` check of key counts and the §2 invariants against the local D1 file and fails loudly.

### 6.7 Open questions for Phase 2
1. Photos: ship ~30 licensed/placeholder JPEGs into local R2 (`.wrangler/state/v3/r2`) vs. leave object keys unresolved? (TW-18/TW-20 look much better with real thumbnails.)
2. Should Imran's June end be modelled as a separate ended relationship? Schema forbids it (UNIQUE trainer+trainee) — current plan uses reactivated_at + history notes.
3. Confirm that Priya forks and Nova empty-state are wanted; confirm 8 new emails.
4. `demo-seed.test.ts` assertions referencing the 4-week window must be updated alongside the generator.
