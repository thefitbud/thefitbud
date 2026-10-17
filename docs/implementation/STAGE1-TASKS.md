# Stage 1 (Foundation) — ordered task list for the implementing agent

Read [`PLAN.md`](./PLAN.md) first. It lists the inputs and their hashes, the baseline findings, the decisions (A1–A10), the migration and contract inventory, and what each screen needs. Section numbers (§) refer to `FitBud_UIUX_Implementation_Guide.md` v1.2.

## Ground rules

- **Branch.** Work on `cursor/stage1-foundation-a3da` (created from `feat/update-ui`). Make one commit per task, or per logical change inside a task. Push with `git push -u origin cursor/stage1-foundation-a3da`. Never force-push and never amend. Open the PR into `feat/update-ui` only in T33.
- **Node.** Use Node **≥ 22.13** (the repo resolves to 22.23 through nvm/pnpm). `/exec-daemon/node` (22.14) has no FTS5 in `node:sqlite`, so run tests with `pnpm …`, not a bare `node`/`npx`.
- **Credentials.** Never look for or use real credentials. Only `.dev.vars.example` and `.env.example` change, never a real secret. Every external provider (Firebase custom tokens, Meta Cloud API, email) is built behind an interface with a test double.
- **Migrations.** Don't edit an applied migration. The only exception is replacing 0014/0017/0019, which MIGRATION_PLAN §0 explicitly sanctions for never-applied environments. Write migrations as SQL by hand, add them to `apps/api/drizzle/meta/_journal.json`, and mirror them in `apps/api/src/db/schema.ts`. **Don't run `drizzle-kit generate`**: there are no snapshots, so it would regenerate everything.
- **Server-side ownership checks** on every new route: use `loadAccessibleRelationship` (exists) plus the new `assertRelationshipWritable`. No message text is ever stored for coach asks. No % scores, risk labels, HRV, streaks or leaderboards in any payload.
- **D1 limits** apply to every new route and job: ≤ 50 queries per invocation (Free plan), ≤ 100 bound parameters per statement. Batch with `db.batch([...])` and chunk multi-row inserts (rows × columns ≤ 100).
- Keep `pnpm typecheck`, `pnpm lint` and `pnpm test` green after every task.

---

## T00 — Inputs and workspace sanity
**Do**
1. Put the three archives from PLAN §0 somewhere outside the repo (e.g. `/tmp/att/`), extract them and check the hashes.
2. `pnpm install`, then run `pnpm typecheck`, `pnpm lint` and `pnpm test` and record the baseline. Expect what PLAN §1 shows: lint has 2 errors, 1 API test fails.

**Accept:** the baseline is recorded in your notes. Nothing is committed in this task.

## T01 — Baseline green
**Files:** `apps/api/src/routes/gate6-workflow.test.ts` (lines 73 and 77, replace `any` with real types), `apps/api/src/routes/notifications.test.ts` (test "applies meal and workout clocks…").

**Do**
- Make the clocks test independent of today's date. Compute `localDate` as tomorrow in `Asia/Kolkata`, publish with a mode or `effectiveFrom` that covers it, and derive the `evaluateAt(...)` instants from `localDate` instead of the literals `2026-10-09T23:30Z`, `2026-10-10T01:45Z` and `2026-10-10T03:30Z`.
- Note: T19 rewrites the reminder engine, so this test changes again there. Keep the fix minimal.

**Accept:** `pnpm lint` and `pnpm test` pass on the untouched product code.

**Gotcha:** generation clips dates to the version's `effectiveFrom` (`effectiveLocalBounds` in `domain/assignment-schedule.ts`). Any hard-coded past date produces 0 rows.

## T02 — Fix migrations 0014, 0017 and 0019, and add 0021
**Files:** `apps/api/drizzle/0014_onboarding_form_templates.sql`, `0017_plan_template_ownership.sql`, `0019_checkin_form_templates.sql` (replace with `library/schema/fixed_migrations/*.sql`), new `apps/api/drizzle/0021_library_v2.sql` (verbatim), `meta/_journal.json` (idx 21, tag `0021_library_v2`).

**Do:** copy the files byte for byte. Apply the bundle's `.diff` files to confirm the only changes are the removed `BEGIN/COMMIT/PRAGMA foreign_keys` lines and the added `PRAGMA defer_foreign_keys = true;`.

**Accept**
- `pnpm --filter @fitbud/api db:migrate:local` on an empty `.wrangler/state` applies 0000–0021 without errors.
- `python3 library/pipeline/tests/test_migrations_d1like.py`, with `MIG` pointed at `apps/api/drizzle`, prints `fixed migrations + 0021: OK` and `fk violations: []`. This was verified during planning against this branch's 0000–0020.

**Gotchas**
- `wrangler d1 migrations apply` already wraps each file in a transaction, so the originals fail with "cannot start a transaction within a transaction".
- The FTS5 module name must be lowercase `fts5`. Verify that the tokenizer string with Devanagari and Telugu `tokenchars` is accepted by local D1 (and remote before release).
- The existing test helpers will break as soon as `schema.ts` changes. Do T03 in the same PR, right after this task.

## T03 — One shared test database helper (node:sqlite plus a D1 shim)
**Files**
- New `apps/api/src/test-support/d1-sqlite.ts`: a `D1Database` implementation over `node:sqlite` `DatabaseSync`. It needs `prepare().bind().all()/first()/run()/raw()` and `batch()`. Use `stmt.setReturnArrays(true)` for `raw()` so joined columns with the same name (`id`) aren't collapsed. `run()` returns `meta.changes` and `last_row_id`.
- New `apps/api/src/test-support/memory-db.ts`:
  - `createMemoryDb({ foreignKeys?: boolean, librarySeed?: boolean })`. It applies **every** `drizzle/*.sql` in numeric order, one transaction per file, statement by statement, splitting with a `complete_statement`-style splitter, like `test_migrations_d1like.py`.
  - It returns `{ db: drizzle(shim, { schema }), sqlite, close }`.
  - On start it checks for FTS5 and throws a clear error if `node:sqlite` lacks it.
- Every `apps/api/src/**/*.test.ts` that defines its own `createMemoryDb`. There are 20: `auth.test.ts`, `configuration`, `progress`, `workouts`, `notifications`, `meals`, `iteration-a`, `checkins`, `templates`, `history`, `workspaces`, `sync`, `exceptions`, `gate6-workflow`, `authorization-matrix`, `plans`, `realtime`, `legacy-dev-attention-inbox`, `onboarding-subscription`, `onboarding-templates`.

**Do**
- Replace each local helper with the shared one.
- `legacy-dev-attention-inbox.test.ts` and `onboarding-subscription.test.ts` use the sql.js API (`sqlite.run(sql, params)`, `sqlite.exec(sql)` → `[{columns, values}]`). They also apply a **partial** chain, insert legacy rows, then apply the rest. Give the helper `applyMigrationsUpTo(n)` / `applyMigrationsFrom(n)` and a tiny sql.js-compatible `run/exec` adapter so their assertions keep working.

**Accept**
- All existing API tests pass on the new helper.
- `sql.js` is no longer needed by API tests (remove the devDependency if unused).

**Gotchas**
- sql.js has **no FTS5**, so 0021 can't load into it.
- The old helpers applied migrations in a **non-numeric** order (e.g. 0012 before 0002, 0011 after 0014, 0006/0007 after 0018). The numeric chain works once T02 is in. If a test relied on the odd order, fix the test, not the chain.
- Drizzle `select()` reads every column declared in `schema.ts`. A test DB that misses one migration fails with "no such column".

## T04 — Migration-chain test
**File:** new `apps/api/src/db/migration-chain.test.ts`.

**Accept (assertions)**
1. A fresh DB with `foreign_keys=ON` applies 0000→latest, one transaction per file.
2. Apply the library seed (T07 command SQL: wipe, then 01–06, then post-wipe) and the demo seed (T24). Then `PRAGMA foreign_key_check` returns **0 rows**.
3. Running the library seed twice gives identical counts per table.
4. Counts after seeding: 693 active global foods, 353 active global exercises, 10 global plan templates, **0** global rows with `seed_version IS NULL` in the food, exercise and serving tables, and every legacy id in `library_id_redirects` or reused.
5. `food_search_fts MATCH 'roti*'` returns chapati/roti and does **not** match `प्रोटीन` for `रोटी*`.

## T05 — Drizzle schema merge for 0021
**Files:** `apps/api/src/db/schema.ts` (merge `library/schema/library.drizzle.ts`), `apps/api/src/domain/mappers.ts`, `apps/api/src/domain/library-snapshots.ts`.

**Do**
- Add the new columns and tables.
- Widen `foodLibraryItems.cuisineRegion`, or better, read the new `cuisine` (`indian|indian_pantry|global`). The seed still writes `cuisine_region='indian'` for every row.
- Keep `primary_muscles_json`, `secondary_muscles_json`, `equipment_json` and `instructions` populated: old readers use them, and the v2 seed keeps them in sync.
- Don't declare the FTS virtual tables in Drizzle. Query them with ``sql`…` `` raw.

**Accept:** typecheck passes and the existing library and template tests pass.

## T06 — Commit the v2 seed into the repo
**Files**
- New `apps/api/seed/library/`:
  - `sql/01_lookups.sql` … `sql/06_seed_version.sql`, verbatim (~19 MB in total; `02_foods.sql` alone is 15 MB).
  - `library-2026.10.2.json`, `manifest.json`, `ATTRIBUTION.md` (from `library/review/`), and a `README.md` explaining the provenance and how to regenerate (pipeline lives outside the repo).
- Root `.gitattributes`: mark `apps/api/seed/library/sql/*.sql` and `*.json` as `-diff linguist-generated`.

**Don't commit** `sources/`, `pipeline/interim/` or the `.xlsx` review sheets.

**Accept:** `sha256sum` of each file matches `manifest.json`.

## T07 — Library load command: wipe the old library, load v2 (local/dev)
**Files**
- New `apps/api/seed/library/00_wipe_legacy_dev.sql` and `07_post_wipe_dev.sql`.
- New `apps/api/scripts/library-seed.ts`. It runs `wrangler d1 execute fitbud --local --persist-to .wrangler/state --file …` in order 00, 01…06, 07, then the FTS rebuild (05) again. It refuses `--remote`.
- `apps/api/package.json` script `db:seed:library`, plus the root alias `pnpm db:seed:library`.

**Behaviour.** The facts below were measured during planning on 0000–0021 plus the v2 seed.

**`00_wipe_legacy_dev.sql`** runs before the v2 load:
- `DELETE FROM plan_templates WHERE ownership='global' AND id IN ('a1000001-0000-4000-8000-000000000001','…02','…03')`. These are the old bases from 0017; the v2 seed adds 10 new ones.
- Delete the legacy servings: `food_library_servings` rows whose food is global and whose `seed_version IS NULL`, i.e. the 80 `b1000001-…` rows. **First** record them in a temp table (`CREATE TEMP TABLE legacy_servings AS SELECT id, food_library_item_id …`) so 07 can redirect them.
- Never touch rows with `ownership='trainer'`.

**`01…06`:** the v2 seed, verbatim.

**`07_post_wipe_dev.sql`:**
- For each archived legacy food (`ownership='global' AND seed_version IS NULL`), insert a `library_id_redirects` row if one is missing. Then delete the food row. The 7 archived legacy foods are:

| Legacy food | Id | Redirect target |
|---|---|---|
| Phulka | `f1000001-…0002` | chapati `…0001` (already in the seed) |
| Dal Tadka | `f1000001-…0005` | the INDB mixed dal row (look up by `slug`) |
| Dal Fry | `f1000001-…0006` | the INDB mixed dal row |
| Paneer Bhurji | `f1000001-…000a` | paneer curry |
| Oats (savory) | `f1000001-…0015` | milk oatmeal |
| Vegetable Sabzi | `f1000001-…0016` | vegetable stir-fry |
| Tofu Stir-fry | `f1000001-…0025` | plain tofu |

  The targets after Phulka are MIGRATION_PLAN's **low-confidence** mappings. Put them in a reviewed constant list in the SQL with `reason='dev_wipe_low_confidence'` and list them in HANDOFF for product-owner confirmation.
- For every recorded legacy serving, insert `library_id_redirects(old_id, 'food_serving', new_id = COALESCE(resolved food).default_serving_id, 'dev_wipe', '2026.10.2')`. TEMP tables don't survive between `wrangler d1 execute` calls, so either concatenate 00+07 into one execution around the 01–06 files, or use a real scratch table `library_wipe_scratch` and drop it at the end. **Pick the scratch table.**
- Rebuild FTS (`05_search.sql`).

**Old library seed code and fixtures to remove**
- `apps/api/scripts/seed-dev.ts` (3,969 lines; it carries hard-coded food and exercise names and `assertGlobalLibrary`). Delete it and its `db:seed:dev` scripts, replacing them with T24.
- Grep `trainer-web`, `mobile` and `packages/*` for the hard-coded legacy library ids (`f1000001-`, `e1000001-`, `b1000001-`, `a1000001-`) used as fixtures outside tests, and replace them with lookups.
- **Leave** migrations 0011/0016/0017 unchanged. They still insert the legacy rows on a fresh DB, and the wipe removes them. Tests that rely on legacy ids keep working because the tests don't run the wipe.

**Accept**
- After `pnpm db:reset` (T25): 0 global rows with `seed_version IS NULL` in the food, serving and exercise tables. 10 global templates.
- Each of the 7 legacy food ids and 80 legacy serving ids resolves through `library_id_redirects`, or is an active reused id.
- Re-running the command is a no-op (same counts).

**Gotchas**
- `wrangler d1 export` can't export FTS virtual tables. Document this in the README.
- Local import of the 15 MB foods file takes minutes. Show progress per file.

## T08 — Library search API, trainee search and redirects
**Files:** `apps/api/src/routes/libraries.ts`, new `apps/api/src/domain/library-search.ts`, new `apps/api/src/routes/me-foods.ts` (mounted at `/me/foods`), `packages/contracts/src/nutrition.ts`, new `packages/contracts/src/trainee-food.ts`.

**Behaviour**
- **Search.** For `q` of length ≥ 2, build a prefix query per token (`"tok"*`, quotes escaped), run `food_search_fts MATCH ?`, `ORDER BY bm25(food_search_fts, 0, 10, 4, 1)`, and join `food_library_items` with `status='active' AND (ownership='global' OR trainer_user_id=:trainer)`. Without `q`, list alphabetically with cursor paging (30/50). Exercises work the same way over `exercise_search_fts`, keeping the existing `muscleGroup`, `equipment` and `difficulty` filters (now from the `exercise_library_muscles` and `exercise_library_equipment` joins).
- **Response additions:** `aliases[]` (lang plus text), `dietTags`, `cuisine`, `servings[]` (`isDefault`, `quantityScaled`, `conversionScaled`), `defaultServingId`, `source` (name plus attribution). Exercises add `media[]`, which is empty unless `LIBRARY_MEDIA_BASE_URL` is set (A10).
- **Redirects.** Any endpoint that accepts a library id resolves it through `library_id_redirects` first: plan and template content validation (`sourceFoodLibraryItemId`, `sourceServingId`, `sourceExerciseLibraryItemId`), meal `logged_foods` items, and `GET /libraries/foods/:id` if added. It responds with the new id and `redirectedFrom`.
- **FTS on writes.** Trainer create, update and archive of a food or exercise rebuilds that item's FTS row (`DELETE … WHERE food_id=?` plus an `INSERT … SELECT` scoped to the id, adapted from `05_search.sql`) in the same `db.batch`.
- **Trainee endpoints** (role trainee, read-only):
  - `GET /me/foods/search?q=&limit=20`: global foods plus the trainer-owned foods of the trainee's **active** trainer.
  - `GET /me/foods/recent`: the last 20 distinct foods from the trainee's own `meal_compliance.items_json` and `trainee_custom_foods`.
  - `GET /me/foods/index?since=`: an id/name/alias/kcal/default-serving delta by `updated_at` for offline search.
- `GET /libraries/foods/custom-logged?rid=` (trainer): the trainee's custom foods for that relationship.

**Accept (tests)**
- `q=roti` finds chapati/roti; `q=रोटी` (Hindi) finds it via aliases; `q=प्रोटीन` does not.
- A trainer never sees another trainer's foods.
- A trainee gets 403 on `POST /libraries/foods`.
- Posting a plan with the legacy Phulka id stores the chapati id.
- One request issues ≤ 5 queries.

## T09 — Config, flags and the dev email sink
**Files**
- New `apps/api/drizzle/0022_auth_config.sql` (tables per PLAN §3.1), `schema.ts`.
- New `apps/api/src/config/flags.ts`: `getFlags(env, db)` reads `feature_flags`, overridden by `FLAG_*` env vars, cached per request.
- New `apps/api/src/routes/config.ts`: public `GET /config` → `{flags:{wa_otp, wa_automation, steps_enabled}, supportEmail}` with `Cache-Control: public, max-age=3600`.
- New `apps/api/src/lib/email.ts`: `sendSystemEmail(env, db, {to, template, vars})` with providers `dev_sink` and `disabled`, plus stubs for `resend`/`ses` that throw `EMAIL_PROVIDER_NOT_CONFIGURED`.
- New `apps/api/src/emails/{otp,invite,password-changed,admin-alert}.ts`, giving subjects per §1.6.11.
- New `apps/api/src/routes/dev.ts`: `GET /dev/mail?to=&limit=`. Mount it only when `ENVIRONMENT === 'local'`; otherwise it returns 404.
- `packages/contracts/src/config.ts`, `packages/core/src/config.ts` (flag keys and defaults).
- `apps/api/src/types.ts`: new env vars `ENVIRONMENT`, `EMAIL_PROVIDER`, `SYSTEM_EMAIL_FROM` (default `FitBud <tech@thefitbud.com>`), `SYSTEM_EMAIL_REPLY_TO`, `ADMIN_ALERT_EMAILS` (default `tech@thefitbud.com`), `SUPPORT_EMAIL`, `APP_HOST`, `FLAG_WA_OTP`, `FLAG_WA_AUTOMATION`, `FLAG_STEPS_ENABLED`.
- `wrangler.toml` `[vars]` gets non-secret defaults (`ENVIRONMENT="local"`, `EMAIL_PROVIDER="dev_sink"`). `.dev.vars.example` lists every variable with a fake value and a comment.

**Accept**
- `GET /config` returns all flags `false`.
- With `EMAIL_PROVIDER=dev_sink` and `ENVIRONMENT=local`, an email shows up in `GET /dev/mail` and as one `[DEV MAIL]` console line.
- With `ENVIRONMENT=production`, `dev_sink` refuses to send (throws, and is logged without the body) and `/dev/mail` is 404.

**Gotcha:** `lib/log.ts` redacts sensitive keys. Write the dev-mail line with `console.log` directly, inside the `dev_sink` provider only, so the general logger never sees codes.

## T10 — Auth: password, email OTP, and WhatsApp OTP behind its flag
**Files:** `apps/api/src/routes/auth.ts`, new `apps/api/src/domain/otp.ts`, new `apps/api/src/auth/password.ts`, new `apps/api/src/auth/custom-token.ts`, `apps/api/src/auth/identity.ts`, `apps/api/src/middleware/auth.ts`, new `packages/contracts/src/auth.ts`, `packages/api-client/src/index.ts` (methods for every new endpoint).

**Behaviour (§3.1a; decisions A4 and A5)**
- **Identifiers.** Accept an email or a mobile number. Normalise emails to lower-case. Normalise mobiles to E.164 with a `+91` default (reuse `normalizeWhatsappE164` from `packages/core/src/whatsapp.ts`; `whatsappHref` there is the starting point for the `wa.me` builder). Look them up in `user_identities`.
- **`POST /auth/login {identifier, password}`**
  - On success return `{token, tokenKind, userId}`.
  - On failure return a **generic** 401 `INVALID_CREDENTIALS`.
  - After 10 failures, set `locked_until = now + 15 min`; the response stays generic.
  - Per-IP limit: 30 per 15 min, in `auth_rate_limits`, keyed by `sha256(ip)` from `CF-Connecting-IP`.
- **`POST /auth/otp/start {identifier, purpose: login|reset|invite, invitationToken?}`**
  - Always return 202 `{sent:true, channels:[…]}` with generic wording. For an unknown identifier, return the same shape and send nothing.
  - Codes are 6 digits from `crypto.getRandomValues`. Store `code_hash = sha256(code + identifier_hash)`, expiring after 10 min.
  - A new code invalidates the previous unconsumed one.
  - Resend after 60 s; 5 per hour and 10 per day per identifier.
  - Channels: email always (E-OTP). WhatsApp (W-OTP) only if `wa_otp` is on, a mobile is on file, the template is approved and the budget allows; otherwise skip it silently. `channels_sent` records what happened.
- **`POST /auth/otp/verify {identifier, code, purpose}`**
  - 5 attempts per code. On the 5th wrong attempt the code is invalidated (`OTP_INVALID`; a new code is needed).
  - `login` returns a token. `reset` returns `{resetProof}`, a 10-minute single-use HMAC. `invite` returns `{otpProof}`.
- **`POST /auth/password/reset {resetProof, newPassword}`:** sets the password, sends E-PWD and returns a token.
- **`POST /auth/password/set {currentPassword?, newPassword}`** (signed in): `currentPassword` is required if a password exists. Sends E-PWD.
- **Passwords:** 8–64 characters with no composition rules. Reject the top-1000 breached list, shipped as a small static file. Hash with PBKDF2-SHA-256 at 100,000 iterations, stored as `pbkdf2$100000$salt$hash`. Compare in constant time.
- **Tokens (A5):** `AUTH_MODE=test` gives `createTestIdToken(user.firebaseUid, email)`. `AUTH_MODE=firebase` gives an RS256 custom token signed with `FIREBASE_SERVICE_ACCOUNT_JSON`, unit-tested with a generated key pair. If the secret is missing, return 503 `AUTH_PROVIDER_NOT_CONFIGURED`.
- **Close the fail-open (backend review P0):**
  - Refuse `AUTH_MODE=test` unless `ENVIRONMENT=local` or the request comes from tests: middleware returns 503.
  - The test-token parser must reject any token whose uid has no `users` row **and** isn't in a session exchange.

**Accept (tests)**
- Every limit fires: 10 fails → locked; 6th code in an hour → 429 with the generic body; the 6th verify → invalid.
- No response distinguishes a known identifier from an unknown one (same status, body and timing class).
- The OTP code appears only in the dev mailbox.
- With `wa_otp=false`, `channels_sent=['email']` and no ledger row is written. With `wa_otp=true` and the template not approved: `['email']`, the result is `template_not_approved` and no ledger row.
- **No SMS code path exists.**

## T11 — Trainer profile and `/me`
**Files:** `routes/auth.ts` (`meRoutes`), `packages/contracts/src/identity.ts`, `profile.ts`.

**Behaviour**
- `PUT /me/trainer-profile {displayName, whatsappE164?, timezone}` validates E.164 and an IANA zone (via `Intl.DateTimeFormat`) and updates `trainer_profiles` and `users.timezone`.
- `GET /me` adds `timezone`, `email` (from `user_identities`) and `trainerProfile {displayName, whatsappE164}`.

**Accept:** a trainee gets 403. Invalid zone → 400.

## T12 — Invitations: invite URL, email, preview, reissue, revoke, accept with password
**Files:** `routes/invitations.ts`, `packages/contracts/src/relationship.ts`, migration `0023` columns.

**Behaviour**
- `POST /invitations` returns `inviteUrl = https://${APP_HOST}/i/${token}` (the token is shown once, as today) and accepts `sendEmail: boolean`, which sends E-INV through `lib/email.ts`.
- `GET /invitations/preview?token=` is public. It returns `{trainerDisplayName, status}` only; never the email or phone.
- `POST /invitations/:id/reissue` creates a new pending invite with a new token, marks the old one `revoked` and sets `reissued_from_id`. `POST /invitations/:id/revoke` revokes it.
- `POST /invitations/accept {token, displayName, mobileE164?, password, otpProof}` verifies the `invite`-purpose `otpProof` against the invite's email. It creates the user, the `user_identities` row (email = invite email) and the trainee profile, sets the password, and returns `{token, tokenKind, relationshipId}`. Keep the existing behaviour for authenticated accept, for backwards compatibility.

**Accept:** an expired, revoked or accepted token returns distinct 409/410 codes on accept, but preview only gives `status`. The accept flow works end to end with the dev mailbox.

## T13 — Relationship lifecycle: end, reactivate and the writable guard (D21, §3.8)
**Files:** `routes/relationships.ts`, new `apps/api/src/domain/relationship-lifecycle.ts`, `domain/history.ts`, `domain/exceptions.ts`, `packages/contracts/src/relationship.ts`, `history.ts`, migration `0023`.

**Behaviour**
- **`POST /relationships/:rid/end {reason?}`** (trainer, owner): sets `status='ended'`, `ended_at` and `ended_by_user_id`. Then:
  - System-closes open exceptions: `status='resolved'`, `closed_reason='coaching_ended'`.
  - Supersedes unstarted future assignments.
  - Cancels pending check-ins and reminders, and cancels a pending reactivation request.
  - Writes history `relationship_ended` and notifies the trainee (`relationship_ended`, P-END).
- **`POST /relationships/:rid/reactivate {intakeUpdateRequested?: boolean}`** (trainer, ended relationship, same trainer): creates a `reactivation_requests` row that expires in 14 days and notifies the trainee (`reactivation_requested`, P-REACT). Only one pending request at a time.
- **`POST /relationships/:rid/reactivate/confirm`** (trainee): status `active` on **the same id**, `reactivated_at`, the request `confirmed`, history `relationship_reactivated`. The onboarding state goes back to "ready" (or "onboarding" if `intakeUpdateRequested`). Reminders resume only once a plan is assigned. `/reactivate/cancel` (trainer) cancels. Expiry runs in the cron.
- **`assertRelationshipWritable(db, rid)`** in `domain/relationship-lifecycle.ts` returns `409 RELATIONSHIP_ENDED`. Call it from **every** trainee write (meals, workouts, check-ins, progress, sync push, coach asks, meal times) and from trainer writes that create future work (plans, generation, configuration, nudges). Several routes already check `relationship.status === 'ended'` inline; replace those with the helper.

**Accept:** tests for each transition, expiry after 14 days, writes blocked after the end, the same id after confirm, and history entries. A different trainer inviting the same trainee creates a **new** relationship. Check the existing unique index `coaching_relationships_trainer_trainee_uidx` (trainer+trainee): it blocks a second row for the same pair, which is correct because the same trainer reactivates.

## T14 — Trainer notes visible to the client (D20)
**Files:** `routes/checkins.ts` (notes handlers), new `routes/me-coach-notes.ts`, `packages/contracts/src/checkin.ts` (note schemas) or a new `note.ts`, `domain/history.ts`, migration `0023`.

**Behaviour**
- `POST /checkins/relationships/:rid/notes` accepts `{body, visibility='private', subjectType?, subjectId?, checkinId?}`.
- `PATCH …/notes/:noteId {visibility}` shares or unshares, writing history `note_shared` / `note_unshared`.
- Sharing (on create or patch) sets `shared_at` and sends **P-NOTE** (`trainer_note_shared`), merged within 15 min, max 2 a day. **Not** when the note is saved as part of a check-in review (`checkinId` set through `POST /checkins/:id/review`); that's covered by P-CHK-REV.
- `GET /me/coach-notes?since=` (trainee) returns client-visible notes only. `POST /me/coach-notes/:id/seen` sets `seen_at`. The trainer read shows `seenAt`.
- Private notes never appear in any trainee payload, including sync pull, links resolve and notifications.

**Accept:** a trainee never sees private notes (test sync pull too). Exactly 1 push per share; 0 for review notes.

## T15 — Fix the assignment-generation 500, then add the combined assign
**Files:** `domain/assignment-schedule.ts`, `routes/workouts.ts`, `routes/meals.ts`, `routes/plans.ts`, `packages/contracts/src/plan.ts`.

**Step 1: reproduce before fixing.** On `feat/update-ui`, run `wrangler dev`, then the old `node scripts/seed-dev.ts` (before T07 deletes it, or from git history). Capture the failing request and the `errorName` in the structured log; `index.ts` `onError` logs only the name and request id. Record the real cause in HANDOFF.

The main suspect, from reading the code: `insertWorkoutAssignments` and `insertMealAssignments` run 2 SELECTs + 1 INSERT per placement, sequentially. A 4-week window with daily meals × 4–5 slots is hundreds of queries in one invocation, past D1's per-invocation query limit (50 on Free). Other things to rule out:
- A unique-index collision (`*_rel_version_day_date_uidx`) from duplicate weekday sessions in `workoutSessionsOnDates`.
- An invalid stored timezone throwing in `Intl` inside `workoutWindowForLocalDate`.
- A `JSON.parse` of a legacy `content_json` shape in `parsePlanContentJson`.

**Step 2: fix.**
- Load the existing rows for the whole date range with **one** SELECT per table: `(rel, localDate BETWEEN …)`, covering both the same version and other scheduled versions.
- Compute placements in memory.
- Insert with `db.batch()` in chunks so each statement has ≤ 100 bound parameters: `workout_assignments` has 14 columns, so ≤ 7 rows per multi-row insert. Alternatively, one single-row insert per statement inside a batch of ≤ 50.
- Add `ON CONFLICT DO NOTHING` on the unique index so retries are safe.
- Cap the range at 35 days per call (400 `RANGE_TOO_LARGE`).
- Never let an exception escape as a bare 500. Map it to `422 GENERATION_FAILED` with a request id. The UI shows "Couldn't create this week's schedule · Retry".

**Step 3: combined assign.**
- `POST /plans/:planId/versions/:vid/assign {window, effectiveFrom, effectiveTo?, dietChangeScope?: 'today_onward'|'today_only', notifyClient: boolean, dryRun?: boolean}`.
- It publishes the version if it's still a draft (existing publish logic), saves `plan_assignment_policies`, and generates both workout and meal assignments. It returns `{replaced: {workouts, meals}, created: {workouts, meals}, dates}`.
- `dryRun` computes the same result without writing.
- `notifyClient` sends P-PLAN (`plan_published`).
- Idempotent with the `Idempotency-Key` header. Store the response, and use an INSERT-first idempotency record (`ON CONFLICT DO NOTHING`, then re-read) to close the find-then-insert race the backend review flagged.
- `GET /plans/:planId/versions/:vid/diff` returns a structural diff against the previous version: added, removed and changed workout days and exercises, meals and items, and per-meal and per-day kcal deltas.

**Accept**
- A test counts D1 calls through a counting shim: a 28-day generation with 5 meal slots uses ≤ 10 statements in ≤ 3 round trips.
- A dry-run writes 0 rows.
- The demo seed (T24) and the old seed scenario run without a 500.

## T16 — Late logging, optional items, and food deviations with kcal
**Files:** new `packages/core/src/late-logging.ts` (pure), `routes/meals.ts`, `routes/workouts.ts`, `routes/sync.ts` (mutation handlers), `domain/exceptions.ts`, `packages/contracts/src/meal.ts`, `workout.ts`, new `packages/core/src/macros.ts`, migration `0024`.

**Behaviour (§3.7, D23/D34/D25/D28)**
- **`canLog({assignment, exception, now, clientLoggedAt, traineeTz, required})`** returns `ok | ok_late | ok_after_resolve | locked | superseded | ended`:
  - Required items can be logged late while their exception isn't `resolved`.
  - An offline client timestamp earlier than `resolvedAt` is accepted and flagged `logged_after_resolve`.
  - Optional items (items no exception rule covers, i.e. a meal or workout marked `required: false` in the plan) only on their own local date, using `clientLoggedAt`.
  - Edits to an already-logged item are allowed until the end of its local day.
- Routes return `409 LOCKED` with `reason`.
- A late log sets `logged_late=1`. If an exception exists it moves to (or keeps) the `meal_logged_later` signal ("Client logged later"). It **never** auto-resolves.
- **Deviation `kind:'logged_foods'`** has `items: [{foodId?, customFood?: {name, kcal, protein?, carbs?, fat?, servingLabel}, servingId?, quantity}]`. Library items are resolved through redirects. Custom foods are written to `trainee_custom_foods`. Kcal and macros are computed server-side (`macros.ts`, scaled integers) and stored on `meal_compliance` (`items_json`, `kcal_scaled`, …).
- Day totals (per meal and per day) are exposed by T17.

**Accept:** a table-driven test for every row of the §3.7 table. Sync push gets the same result as REST. Kcal sums are exact in scaled integers.

**Gotchas**
- `meal_compliance.deviation_kind` has no SQL CHECK. Add `logged_foods` to the Drizzle enum, the contracts and every `switch` over deviation kinds (`domain/mappers.ts`, `domain/workspace.ts`, `domain/history.ts`) so exhaustiveness checks catch them.
- Optional vs required: the plan content has no explicit `optional` flag today. Add `required: boolean` (default `true`) to meal prescriptions and workout days in `plan.ts`, with a parser default so old JSON stays valid.

## T17 — Read models: week, day, workspace header, attention groups and the activity feed
**Files**
- `routes/workspaces.ts` and `domain/workspace.ts`: header gains `traineeTimezone`, `hasCustomMealTimes` and `trainerWhatsappE164`. New `GET /workspaces/relationships/:rid/week?start=` → `{workouts:{assigned,completed}, meals:{assigned,logged}, days:[{date,state: done|partial|missed|rest|future}]}`.
- New `routes/me-day.ts`: `GET /me/day/:date` → `{assignments, logs, totals:{kcalScaled, perMeal[]}, loggable per item}`, and `GET /me/week?start=` (same shape as the trainer week).
- `routes/exceptions.ts`: `GET /exceptions/attention?groupBy=relationship` → groups `[{relationshipId, traineeDisplayName, items:[{id,type,severity,status,ageMinutes,summary}]}]`, critical first, then oldest. `GET /exceptions/:id` embeds `sourceSummary` (the meal or workout name, date, logged state). `POST /exceptions/:id/resolve` accepts `{note?, outcome?: 'talked'|'plan_adjusted'|'no_action'|'other'}` and stores them.
- New `routes/activity-feed.ts`: `GET /activity/feed?cursor&limit=30&types&rid&since` → `{events:[{id,rid,traineeDisplayName,type,subtype,occurredAt,traineeLocalTime,summary,kcal?,link}],nextCursor}`. Build it from `meal_compliance`, `workout_executions`, `checkins`, `coach_asks` and the meal-times history, using a cursor on `(occurredAt,id)`.
- `routes/clients.ts`: `renewal=due|overdue|none`, `status=ended`, `facets:{status:{…}, adherence:{…}, renewal:{…}}`.
- `routes/notifications.ts`: nudge limits (3 per trainer per hour **and** 1 per item per 4 h), returning `429 NUDGE_LIMIT` with `retryAfter`.

**Accept:** every read is ≤ 10 queries (count them in a test). No percentages in any payload; add a contract test that scans the response schemas for keys matching `/percent|score|risk|streak|rank/i`. The weekly consistency count uses late logs on their original date.

## T18 — Coach asks (TR-18, TW-32)
**Files:** new `routes/coach-asks.ts`, `packages/contracts/src/coach-ask.ts`, migration `0023`, notification types.

**Behaviour**
- `POST /coach-asks {relationshipId, itemType, itemId, topic}` (trainee, idempotent; also accepted through `/sync/push` as the outbox):
  - Validates the item belongs to the relationship.
  - A repeat ask on the same item within 24 h merges (`ask_count+1`, `last_asked_at`).
  - Sends `trainer_ask_coach` to the trainer.
  - **No text field**; the conversation happens on WhatsApp via `wa.me`.
- `GET /coach-asks?status=open` (trainer: own relationships; trainee: own asks).
- `POST /coach-asks/:id/answer {note?}`: optionally creates a client-visible note, sets `answered`, and sends `coach_answered` (inbox only, I-ANS). `POST /coach-asks/:id/notes` adds a note linked to the ask without answering it.
- The cron expires asks after 7 days.

**Accept:** merge, expiry, ownership and ended-relationship tests.

## T19 — Reminder engine v2 (§3.6)
**Files:** `packages/core/src/reminder.ts` (and its test), `apps/api/src/domain/reminders.ts`, `apps/api/src/jobs/reminders.ts`, `routes/notifications.ts`, `packages/contracts/src/notification.ts`, migration `0025`, `wrangler.toml` cron.

**Behaviour**
- **Constants:**
  - Remove `WORKOUT_REMINDER_LOCAL_TIMES`, `MEAL_REMINDER_ADVANCE_MINUTES` and `MEAL_REMINDER_FOLLOW_UP_MINUTES`.
  - Add: workout offset 75, fallback anchor `18:00`, learned time = median start of the last 6 sessions in 28 days with ≥ 3 samples. Meal after 40 min; snooze 30 min, max 1. Summary `min(lastMeal+60, 21:30)`. Hard stop `22:00`. Default quiet hours `22:00–07:00`. Daily cap 5. Merge window 30 min.
- **Pre-send checks, in order** (§3.6 flowchart):
  1. Relationship active and rule on.
  2. Still unlogged.
  3. Prefs and token OK, else W-FB through the budget guard (flag-gated).
  4. Quiet hours or hard stop: meal, workout and summary **expire**; check-in, plan, nudge and note **defer** to the end of quiet hours.
  5. Back-off.
  6. Cap with priority: nudge > meal > workout > check-in > EOD > informational. Informational goes to the inbox only.
  7. Merge within 30 min.
- **Back-off** state in `reminder_states`:
  - Self-logger: logged before the reminder on ≥ 5 of the last 7, so skip the category; re-enable after 2 misses in 7 days.
  - Soft ignorer: 3 ignored in a row (no open or log within 2 h), so skip every other occurrence.
  - Pause: 5 ignored, so pause the category 7 days and send P-PAUSE (`reminders_paused`).
  - Push failure: 2 failed deliveries, so mark the token revoked; status "Notifications off".
- **Everything in the trainee's timezone** (`users.timezone`). P-MEAL anchors on `meal_time_overrides` if set, else the plan slot time.
- **Reads:**
  - `GET /notifications/relationships/:rid/responsiveness?days=14` returns `{label: logs_on_own|responds|often_misses|reminders_paused|notifications_off|not_enough_data, counts:{sent, opened, loggedAfter, loggedBefore}}`, with **no percentages**.
  - `GET /notifications/reengagement-candidates`: no log for 48 h and ≥ 3 consecutive unanswered reminders. Return a `wa.me` link built from trainer-signed W-RE-M text. FitBud sends nothing.
- **Notification types**, added to the enum and contracts:
  - Trainee: `plan_published`, `checkin_reviewed`, `coach_answered`, `reminders_paused`, `relationship_ended`, `trainer_note_shared`, `reactivation_requested`.
  - Trainer: `trainer_ask_coach`, `trainer_checkin_submitted`, `trainer_intake_submitted`, `trainer_critical_digest`, `trainer_renewal`, `trainer_meal_times_changed`, `admin_whatsapp_budget`.
  - Wire their producers in T13, T14, T15, T18, T20 and the check-in/onboarding submit routes.
- **Preferences:** `GET/PUT /notifications/preferences` gain `channelPreference`, `whatsappOptIn{granted,at,source,textVersion}`, `preferredWorkoutTime`, `traineeTimezone` (writes `users.timezone`, adds an activity entry), `locale` and `trainerCategories`. With `wa_automation=false`, `channelPreference` is forced to `app` and opt-in can't be granted (400 `FEATURE_DISABLED`).
- **Cron:** change `*/15 * * * *` to `*/5 * * * *` (§3.6 tick). Fan out per relationship through `REMINDER_QUEUE` so each invocation stays under 50 queries (backend review P0 #3). Add a DLQ consumer config entry in `wrangler.toml` (local name only).

**Accept**
- Table-driven tests per decision-table row in `packages/core/src/reminder.test.ts`.
- The §3.6 "day in the life" fixtures:
  - 5 meals + a 19:00 workout → ≤ 5 pushes.
  - Self-logger → 0–1.
  - Ignorer → paused on day 5.
  - Quiet hours 21:00–06:00 → nothing at or after 21:00.
  - Lunch override 14:30 → P-MEAL at about 15:10.
  - Push off + opt-in + `wa_automation` on with an approved template → exactly 1 W-FB a day. With the flag off → 0, and `skipped:'flag_off'`.
- A trainee in `Asia/Dubai` gets local-time reminders.
- `notifications.test.ts` is updated, with no hard-coded calendar dates.

## T20 — Meal times (TR-24, D24)
**Files:** new `routes/me-meal-times.ts`, `packages/contracts/src/meal-times.ts`, migration `0024`, `domain/reminders.ts`, `domain/assignment-schedule.ts`.

**Behaviour**
- `GET /me/meal-times` returns the plan slots (`slotKey`, label, plan time) merged with overrides.
- `PUT /me/meal-times {overrides:[{slotKey, dayPattern, time}]}` validates 05:00–22:00, slot order kept, ≥ 60 min between consecutive slots. It stores the overrides and writes history `meal_times_changed`. It recomputes windows for today's unlogged and future meal assignments, reschedules P-MEAL, and notifies the trainer with `trainer_meal_times_changed` (T-MEALTIME), merged within 15 min.
- When a new plan version drops a slot, delete its override and set a `mealTimesNeedReview` flag in `GET /me/meal-times`.

**Accept:** validation tests, window recompute, one trainer notification for two quick edits.

## T21 — Links resolver (TR-23, TW-33)
**Files:** new `routes/links.ts`, `packages/contracts/src/links.ts`.

**Behaviour:** `GET /links/resolve?kind=&id=` → `{role, route, available, reason?: not_found|not_yours|ended|superseded|expired}`. Kinds: meal, workout, checkin, exception, ask, plan, client, today, note, reactivate. It resolves ownership server-side for the current actor and role. The route strings come from a map shared with the clients in `packages/core/src/links.ts`.

**Accept:** one test per kind, covering available, not yours and ended.

## T22 — WhatsApp Cloud client, template registry, budget and webhook (flagged)
**Files**
- New `apps/api/src/lib/whatsapp-cloud.ts`: `fetch` to `https://graph.facebook.com/v21.0/{phoneNumberId}/messages`, template messages only, injectable `fetch` for tests.
- New `domain/whatsapp-templates.ts` with the seed data for W-OTP, W-FB, W-CHK, W-PLAN and W-RENEW (copy from §4.2; status `draft`), plus `whatsapp-templates.lint.test.ts` implementing the 9 copy-lint rules of §4.6.
- New `domain/whatsapp-budget.ts`: §4.5 modes normal/soft/hard; reserve-then-send in one `db.batch`; settle from webhook pricing; threshold alerts at 50/80/100% of the budget and 90/100% of the cap, once a month each, via E-ALERT to `ADMIN_ALERT_EMAILS`; IST month key; rates from config (`WA_MONTHLY_BUDGET_INR=500`, `WA_HARD_CAP_INR=1000`, `WA_RATE_UTILITY_CENTIPAISE=1357` and `WA_RATE_AUTH_CENTIPAISE=1357`, i.e. ₹0.1357 incl. GST). Ledger `est_cost_paise` and `cost_paise` stay integers per §4.5: round each message **up** to whole paise (14), and compare mode thresholds on the summed paise.
- New `routes/webhooks-whatsapp.ts`: `GET` verify with `WA_WEBHOOK_VERIFY_TOKEN`, `POST` with an `X-Hub-Signature-256` HMAC check using `WA_APP_SECRET`. It handles statuses (settle the ledger), template status updates (registry plus alert), inbound `STOP` (opt out within one round trip and send a free-form service confirmation) and other inbound text (one auto-reply a day pointing to the app; no conversation).
- Migration `0026`. `.dev.vars.example` gets `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET` and `WA_WEBHOOK_VERIFY_TOKEN` as **fake placeholders**.

**Behaviour**
- `sendTemplate(key, …)` checks the flag **first**: `wa_otp` for W-OTP, `wa_automation` for the rest. If it's off, return `{skipped:'flag_off'}` with **no** ledger row.
- Next it resolves the latest `approved` version; if there is none, `{skipped:'template_not_approved'}`.
- Then budget, opt-in and STOP checks, then quiet hours. Only then send.
- Nothing in the codebase may send WhatsApp text on behalf of a trainer or trainee. Add a test that greps `src/` for `graph.facebook.com` outside `lib/whatsapp-cloud.ts`.

**Accept:** every §4.5 and §4.6 acceptance box, as unit tests with a mocked `fetch`, in both flag states.

## T23 — Templates hub data, onboarding and check-in form bases
**Files:** `routes/templates.ts`, `routes/onboarding-templates.ts`, `routes/checkin-forms.ts`, `packages/contracts/src/template.ts`.

**Behaviour:** `GET /templates?templateType&scope=all|bases|mine&q` filters by `ownership`. Every item carries `ownership` and `isBase`. The 10 v2 templates are the FitBud workout, diet and full-plan bases. The onboarding and check-in form lists gain the same `scope` filter; their global rows come from 0014 and 0019. Bases are read-only (403 on PUT/DELETE); fork to Mine (exists).

**Accept:** the scope filters work; the 3 legacy bases are gone after the wipe (T07).

## T24 — Demo seed (one idempotent command)
**Files**
- New `apps/api/src/seed/demo/` with:
  - `spec.ts`: the declarative list of accounts and states below.
  - `build.ts`: a pure function `(referenceDate, libraryIndex) → SQL statements`, with deterministic UUIDv5 ids under namespace `fitbud-demo-v1`.
  - `history.ts`: 3–4 weeks of assignments, logs and exceptions.
- New `apps/api/scripts/seed-demo.ts`. It writes `.wrangler/demo-seed.sql` and runs `wrangler d1 execute fitbud --local --persist-to .wrangler/state --file …`. It refuses non-local runs, then prints the account table.
- Scripts: `seed:demo` (api package) and root `pnpm seed:demo`. Remove `db:seed:dev`.

**Approach (decision A9):** write SQL directly. The API can't backdate: generation clips to `effectiveFrom`, and every write is stamped "now".
- The file starts with `PRAGMA defer_foreign_keys = true;` and **no** BEGIN/COMMIT.
- It first deletes all non-library app data in child-to-parent order. That covers every table except: the library tables, the **global** rows of `plan_templates`, `onboarding_form_*` and `checkin_form_*`, `feature_flags` and `whatsapp_templates`. Then it inserts.
- Re-running gives the same world. The reference date is today in `Asia/Kolkata`, so "today" screens stay live.
- Plans are built from **v2 library ids only**. Look the foods and exercises up by `slug` in the loaded library and fail loudly if one is missing. Use per-100 g canonical nutrients from the DB and `foodSnapshotFromLibrary` from `@fitbud/core`, so the snapshots are honest.
- Passwords are PBKDF2-hashed at seed time with the same format as T10.

**Dev-only password (all demo accounts):** `FitBud-demo-2026`. Document it in HANDOFF and README as dev-only. Domain `@demo.fitbud.test` (the reserved `.test` TLD). Phones `+9190000000NN` (fake). All names are obviously demo.

**Accounts and states**

| # | Email | Role | Trainer | State it demonstrates |
|---|---|---|---|---|
| 1 | `rahul.coach@demo.fitbud.test` | trainer | — | Main trainer, `Asia/Kolkata`, WhatsApp set; owns #3–#13; 2 own templates (one workout, one diet) plus the bases |
| 2 | `priya.coach@demo.fitbud.test` | trainer | — | Second trainer; owns #14–#15; pending invite to #11's email (new-coach path) |
| 3 | invite only: `anita.invite@demo.fitbud.test` | (none yet) | Rahul | **Invite pending**. Also one expired and one revoked invite for TW-08. The seed prints the raw token for the pending invite. |
| 4 | `vikram.onboarding@demo.fitbud.test` | trainee | Rahul | **Onboarding incomplete** (intake draft saved, not submitted) |
| 5 | `sneha.review@demo.fitbud.test` | trainee | Rahul | Intake **submitted, awaiting review** (TW-10, TR-04) |
| 6 | `aarav.ontrack@demo.fitbud.test` | trainee | Rahul | **Active, on track**. 4 weeks of history, plan v1→v2 (versioned; v2 effective). Check-ins submitted and reviewed. One private note and one client-visible note (seen). Renewal in 20 days. |
| 7 | `rohan.slipping@demo.fitbud.test` | trainee | Rahul | **Slipping**, with every Needs Attention type: missed workout (critical, 2 d old), skipped workout (attention), overdue meal (critical, 5 h), skipped meal (attention), meal deviation (attention), overdue check-in (attention). Renewal **overdue**. |
| 8 | `meera.ack@demo.fitbud.test` | trainee | Rahul | **Acknowledged, not resolved**. A missed meal acknowledged 1 d ago, then **logged late** ("Client logged later"). One resolved exception, so that item is **locked**. An optional snack from yesterday shows "Not logged" (read-only). |
| 9 | `farhan.paused@demo.fitbud.test` | trainee | Rahul | **Reminders paused** (decision A3). 5 ignored meal reminders → `reminder_states.mode='paused'` until +7 d. Responsiveness "Reminders paused". In the re-engagement candidates. |
| 10 | `ishita.pushoff@demo.fitbud.test` | trainee | Rahul | Push failure (token revoked) → "Notifications off". Open coach ask on a meal (TW-32), asked twice (merged). |
| 11 | `kavya.ended@demo.fitbud.test` | trainee | Rahul (ended) | **Ended 10 d ago, reactivatable** (no pending request). Exceptions closed "coaching ended". Also has Priya's pending invite. |
| 12 | `nikhil.reactivate@demo.fitbud.test` | trainee | Rahul (ended) | Ended, with a **pending reactivation request** (expires in 9 d) → TR-22 confirm card |
| 13 | `deepak.dubai@demo.fitbud.test` | trainee | Rahul | **Different timezone** (`Asia/Dubai`; the trainer sees "1 h 30 m behind you"). Also **changed meal times** (lunch 14:30 every day, dinner 21:00 weekdays) → `hasCustomMealTimes`, history `meal_times_changed`, a trainer notification. |
| 14 | `lakshmi.foods@demo.fitbud.test` | trainee | Priya | **Food deviations from the library** ("Something different" `logged_foods`: idli + sambar instead of poha; one custom food "Office canteen thali"). Kcal per meal and per day. Telugu aliases exercised. Check-in **pending** (due today). |
| 15 | `karan.dual@demo.fitbud.test` | trainer **and** trainee | Priya | **Dual role** (TM-08). As a trainee: active, check-in **submitted, not reviewed**. As a trainer: 0 clients (empty states). |

**History rules**
- 21–28 days back from the reference date, in the trainee's timezone.
- Every derived state appears somewhere: completed, modified, skipped, missed and pending workouts; logged, changed, skipped, logged late, overdue and pending meals; due, overdue, submitted and reviewed check-ins.
- The four adherence states each occur in the roster: `on_track` (#6, #14), `needs_attention` (#7, #8), `no_recent_data` (#9), `not_available` (#4, #5).

**Accept (test `apps/api/src/seed/demo/demo-seed.test.ts`)**
- Applying migrations, the library seed and the demo SQL into `createMemoryDb({foreignKeys:true, librarySeed:true})` gives `foreign_key_check` = 0. Applying it twice gives identical row counts.
- Every account logs in via `POST /auth/login` with the dev password.
- For each trainer: `GET /exceptions/attention?groupBy=relationship`, `/clients` (facets include an ended client), `/activity/feed`, `/coach-asks?status=open`, and for each relationship the workspace, week, activity and responsiveness endpoints all return 200.
- For each trainee: `/me/day/today`, `/me/week`, `/me/coach-notes` and `/me/meal-times` all return 200.
- A spec assertion checks that every state in the table is present (query-based, not just "rows exist").
- No demo row references a legacy library id.

## T25 — Local run, reset and seed commands
**Files:** `apps/api/package.json`, root `package.json`, `README.md` (local dev section), new `apps/api/scripts/db-reset.ts`.

**Commands**
- `pnpm db:reset`: deletes `apps/api/.wrangler/state/v3/d1` (only that path; refuses anything else), then `db:migrate:local`, `db:seed:library`, `seed:demo`.
- `pnpm db:seed:library`, `pnpm seed:demo`, `pnpm api` (wrangler dev on `127.0.0.1:8787`).
- Keep `db:migrate:local`.

**Accept:** from a clean clone, `pnpm install && pnpm db:reset && pnpm api` serves `/health`, `/config` and `/docs`. The OpenAPI document includes every new route: add each with `operation({...})`, and extend `openapi.test.ts` so new paths are present.

## T26 — Contracts, core helpers and the API client
**Files:** the `packages/contracts/src/*` and `packages/core/src/{format,labels,support,macros,config,links,late-logging}.ts` from PLAN §3.2–3.3, and `packages/api-client/src/index.ts` with typed methods for every new endpoint plus `getConfig()` (1 h cache, refresh on demand).

**Accept**
- Contract round-trip tests (`packages/contracts/src/index.test.ts`).
- `formatTimeDiff` tests (IST vs Dubai = "1 h 30 m behind you"; same zone = "same time"; half-hour and DST zones).
- The `wa.me` builder encodes text and strips non-digits.
- An api-client test for `getConfig` caching.

## T27 — Design tokens in one shared place
**Files**
- New package `packages/tokens` (`@fitbud/tokens`): `src/tokens.ts` holds the raw values. A small build script (`scripts/build-css.ts`) emits `dist/tokens.css` with `:root` custom properties; or commit a generated `src/tokens.css` plus a test that checks it is in sync.
- `packages/ui-mobile/src/theme.ts`: import from `@fitbud/tokens`, keeping the existing export names so mobile code doesn't break, and add a `semantic` export.
- `apps/trainer-web/src/styles.css`: `@import "@fitbud/tokens/tokens.css";` and replace the hard-coded `:root` values with references.

**Values**
- **Brand:**

| Token | Value |
|---|---|
| Indigo | `#4527C6` |
| Deep Navy | `#1A1249` (A1) |
| Coral | `#FF5B7D` (A1; accent only) |
| Soft Coral | `#FFB0C3` |
| Pale Lavender | `#EDEAFF` |
| Chalk | `#FAF7F2` |

- **Ink, surface and border:** ink 900/700/500/200 `#0F1115/#25262B/#5B616B/#E6E8EB`; surface page web `#F3F5FB`, mobile `#F6F5FB`; card `#FFFFFF`; border `#E7E9F2`.
- **Semantic** (fill/text): critical `#FEF2F2/#B91C1C`, attention `#FFFBEB/#B45309`, positive `#ECFDF5/#047857`, info `#EFF6FF/#1D4ED8`, neutral `#F3F4F6/#374151`, brand-selected `#EDEAFF/#4527C6`. Destructive filled button `#B91C1C`.
- **Rings:** kcal `#4527C6`, protein = deep navy, carbs `#7C6CF0`, fat `#0E7490`, track `#E6E8EB`.
- **Type scale:** §1.6.2 table, web and mobile.
- **Spacing:** 4/8/12/16/24/32/40. **Radii:** web card 16, input/button 10, pill 999; mobile card 20, control 16. **Elevation:** levels 1–3 per §1.6.1.
- **Fonts:**
  - Satoshi 400/500/600/700, with the fallback stack `Satoshi, "Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif`.
  - Web already loads Satoshi from Fontshare. Add Noto Sans Devanagari through Google Fonts `<link>` in `apps/trainer-web/index.html`.
  - Mobile: add `expo-font` and `@expo-google-fonts/noto-sans-devanagari`. Satoshi has no npm package, so bundle the OTF/WOFF files under `packages/brand/fonts/` only if the licence allows it; the Fontshare free licence allows embedding in apps. Load them in `apps/mobile/App.tsx` behind a splash hold.
- Tagline constant: `"Progress, guided."`.

**Remove** the old status colours `success #10B981`, `warning #F59E0B` and `error #EF4444` as status colours. Keep them exported as deprecated aliases that map to semantic values, so screens compile; the UI agents migrate them.

**Accept**
- One source of truth: grep shows no brand hex in `theme.ts` or `styles.css` outside the import.
- Web and mobile typecheck and test.
- A contrast unit test for the semantic pairs (≥ 4.5:1).

## T28 — Temporary logo set (one replaceable location)
**Files:** new package `packages/brand` (`@fitbud/brand`) containing:
- `logo/mark.svg`: the supplied SVG, unchanged.
- `logo/mark-white.svg`: all strokes and fills `#FFFFFF`; the ring keeps coral only if the contrast passes, otherwise white.
- `logo/mark-dark.svg`: for dark backgrounds (dots `#FAF7F2`, ring coral).
- `logo/lockup-horizontal.svg`, `lockup-horizontal-white.svg` and `lockup-horizontal-dark.svg`: mark plus the "FitBud" wordmark. The wordmark is **converted to outlines** from Satoshi Bold so it renders without the font; do the conversion in the generator with `opentype.js` from the Satoshi OTF.
- `favicon/`: `favicon.ico` (16/32/48), `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `site.webmanifest`.
- `app/`: `icon.png` (1024, chalk background, mark centred), `adaptive-foreground.png` (1024 with a 66% safe zone), `adaptive-background` colour = Chalk, `splash.png` (1284×2778, mark plus tagline on Chalk).
- `scripts/generate.ts`: renders every PNG from the SVGs (use `@resvg/resvg-js` as a devDependency) and the ICO, so swapping the logo is "replace `mark.svg` (and optionally the font), run `pnpm --filter @fitbud/brand generate`".
- `src/index.ts`: exports the paths and the tagline.
- `README.md`: how to swap the logo, and where each file is used.

**Wire up**
- `apps/trainer-web/index.html` favicon links and manifest, copied at build time via a Vite `publicDir` alias or a small copy step.
- `apps/mobile/app.json`: `icon`, `splash.image`, `splash.backgroundColor` Chalk, `android.adaptiveIcon.{foregroundImage, backgroundColor}`, each pointing at `../../packages/brand/app/*` (or via `app.config.ts` using `require.resolve`).
- Replace any inline logo SVG in `apps/trainer-web/src/layout/AppShell.tsx` with an import from `@fitbud/brand`. **Don't redesign the shell.**

**Accept:** the generator is idempotent. `pnpm --filter @fitbud/mobile exec expo config --type public` resolves the image paths. The web build includes the favicons. Grep shows no other logo file in the repo.

**Gotcha:** the referenced `/workspace/handoff/logo/*.png` and `round2_refinement.png` didn't exist in the planning environment. Generate everything from the SVG.

## T29 — Wire `/config` into the clients (no screens)
**Files**
- `apps/trainer-web/src/lib/*` and `apps/mobile/src/*` (whichever module holds the API client): a `useConfig()` / `ConfigProvider` that calls `api.getConfig()`, caches it for 1 h and refreshes on focus or foreground.
- Export helpers `isWhatsAppOtpEnabled()`, `isWhatsAppAutomationEnabled()` and `isStepsEnabled()`.

**Accept:** unit tests in both apps with a mocked client. No UI changes beyond the provider.

## T30 — Hardening called out by the backend review (keep small)
- **Media signing:** remove the hard-coded fallback secret in `lib/files.ts` (`fileSigningSecret`). Require `MEDIA_SIGNING_SECRET` unless `ENVIRONMENT=local`.
- **Idempotency:** switch `saveIdempotencyRecord` to an INSERT-first pattern (`ON CONFLICT DO NOTHING`, then re-read) used by every route.
- **Rate limits:** apply the `auth_rate_limits` helper to auth and nudge routes.
- **DO migration:** `wrangler.toml` uses `new_classes` for `RelationshipRealtimeRoom`; Workers Free requires SQLite-backed DOs (`new_sqlite_classes`). Change it **only if** the class was never deployed (no production deployment exists, per Agents.md). Otherwise list it in HANDOFF.

## T31 — Run everything for real and record the results
- From scratch: `pnpm db:reset`, then `pnpm api`. Exercise with `curl` and record the HTTP status and a trimmed body in HANDOFF:
  - `/health`, `/config`.
  - `/auth/login` for one trainer and one trainee; `/auth/otp/start`, then read the code from `/dev/mail`, then `/auth/otp/verify`.
  - `/exceptions/attention?groupBy=relationship`, `/clients?status=ended`, `/libraries/foods?q=roti`, `/me/foods/search?q=idli`.
  - `/plans/…/assign` with a dry-run, then for real; a late meal log on #8 (200) and on a resolved item (409 `LOCKED`).
  - `/relationships/:rid/end`, `/activity/feed`, `/notifications/relationships/:rid/responsiveness`.
  - `POST /notifications/reminders/evaluate` (dev trigger) at a fixed instant.
  - `GET /webhooks/whatsapp` verify with the fake token.
- Run `pnpm typecheck`, `pnpm lint` and `pnpm test` at the root and record the counts.

## T32 — `docs/implementation/HANDOFF-stage1.md`
Sections:
1. What changed, per task.
2. Every new or changed endpoint, with method, path, role, request and response contract names, and error codes.
3. Every new or changed contract.
4. The flags and their defaults, and how to flip them locally (`FLAG_*` in `.dev.vars` or `UPDATE feature_flags`).
5. Env vars (fake values only).
6. Exact commands: install, reset, seed, run, test, and reading OTPs from `/dev/mail`.
7. The demo account table from T24: role, email, the dev-only password, and the state or flow each demonstrates.
8. Real run results from T31.
9. Known gaps: media not uploaded (A10), Firebase custom token untested live, WhatsApp untested against Meta, the low-confidence library redirects awaiting confirmation, the DO migration note, the steps spike, and the colour-value difference (A1).
10. The root cause of the old seed 500 (from T15 step 1).

## T33 — Pull request
Check for a PR template (`.github/PULL_REQUEST_TEMPLATE.md`, `PULL_REQUEST_TEMPLATE/`; none existed at planning time). Open a **draft** PR from `cursor/stage1-foundation-a3da` into `feat/update-ui` using the ManagePullRequest tool, never the `gh` CLI. The body should summarise the HANDOFF and list the test, typecheck and lint results.

---

## Suggested commit sequence

T01 · T02 · T03 · T04 (initial) · T05 · T06 · T07 · T08 · T09 · T10 · T11 · T12 · T13 · T14 · T15 · T16 · T17 · T18 · T19 · T20 · T21 · T22 · T23 · T26 (can be interleaved with the backend tasks it supports) · T24 · T04 (final, with the demo seed) · T25 · T27 · T28 · T29 · T30 · T31 · T32 · T33.
