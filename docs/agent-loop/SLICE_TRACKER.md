# FitBud MVP Slice Tracker

Handoff between parent-agent loop ticks. Update after every slice.

Status values: `todo` | `in_progress` | `done` | `blocked`

## Phase A — Platform

| Slice | Status | Depends | Checks run | Notes |
| --- | --- | --- | --- | --- |
| A1 Workspace bootstrap | done | — | build, lint, typecheck, test | pnpm+turbo monorepo; apps + packages shells |
| A2 API skeleton | done | A1 | build, lint, typecheck, test; db:migrate:local | Hono, envelopes, health, Drizzle/D1, idempotency, cursors |
| A3 Identity | done | A2 | build, lint, typecheck, test (auth 401/403) | users/roles/profiles/sessions; Firebase test double; GET /me |

## Phase B — Relationship

| Slice | Status | Depends | Checks run | Notes |
| --- | --- | --- | --- | --- |
| B1 Invitations and coaching relationships | done | A3 | lint, typecheck, test; db:migrate:local | invitations + relationships routes; trainer isolation; idempotent create; token hash/expiry/accept |
| B2 Intake and onboarding | done | B1 | lint, typecheck, test; db:migrate:local | versioned intake definition; draft/submit/review; Invited→Pending→Submitted→Coaching Ready; no silent overwrite |
| B3 Trainer web: auth + clients + invite + onboarding review | done | B2 | lint, typecheck, test, build (@fitbud/trainer-web); api-client test; browser sanity | Home + Clients + Add Client + Onboarding Review; Configure Coaching stub; light tokens; local Bearer auth; fetch bind fix in api-client |
| B4 Mobile: auth, role resolution, accept invite, intake | done | B2 | lint, typecheck, test, build (mobile + ui-mobile) | Trainee auth/invite/intake + nav shell; see session log |

## Phase C — Four priority loops

| Slice | Status | Depends | Checks run | Notes |
| --- | --- | --- | --- | --- |
| C1 Coaching configuration | done | B2 | lint, typecheck, test (config/auth); db:migrate:local (0002); trainer-web build | Draft→Configured→Active; expectations persisted; Configure Coaching wired; coaching_ready preserved |
| C2 Plans and versions | done | C1 | lint, typecheck, test (plan publish/immutability/supersede/schedule); db:migrate:local (0003); contracts/api-client build | JSON snapshots on plan_versions; reject immutable edits; immediate/scheduled publish; draft-from-version; templates deferred to D6 |
| C3 Workout loop (end-to-end) | done | C2 | lint, typecheck, test (workouts authz/lifecycle/missed); db:migrate:local (0004); trainer-web + mobile typecheck/lint | Assignments from effective plan + TZ windows; start/pause/resume/complete/modify/skip; set Done without re-entry; session RPE when configured; Missed derived; trainer Plan+Activity |
| C4 Diet loop (end-to-end) | done | C2 | lint, typecheck, test (meals authz/confirm/deviate/skip/overdue/photo); db:migrate:local (0005); trainer-web + mobile typecheck/lint | Meal assignments from effective plan + TZ windows; confirm/deviate/skip; photo intent when required; Pending/Logged Later/Overdue derived; trainer Activity compliance |
| C5 Check-in loop (end-to-end) | done | C1 | lint, typecheck, test (checkins authz/submit/review/overdue/inbox); db:migrate:local (0006); trainer-web + mobile typecheck/lint/test/build | Schedule/due/submit/overdue derived; review context; trainee Today; trainer Check-ins + review actions |
| C6 Intervention loop (end-to-end) | done | C3, C4, C5 | lint, typecheck, test (exceptions authz/lifecycle/attention/source-preserved); db:migrate:local (0007); trainer-web + mobile | Deterministic exceptions; Detected→Active→Acknowledged→Resolved; Home attention; plan adjust via C2; check-in activeExceptions wired; Phase C complete |

## Phase D — Supporting MVP

| Slice | Status | Depends | Checks run | Notes |
| --- | --- | --- | --- | --- |
| D1 Progress and R2 | done | C6 | lint, typecheck, test (progress/files authz/upload/download/meal-photo + meals); db:migrate:local (0008); trainer-web + mobile lint/typecheck/test/build | measurements, progress_entries, media_assets; R2 `MEDIA` binding; time-limited download URLs; meal photo requires ready media asset; Progress UIs list stored data only |
| D2 History view | done | C6 | lint, typecheck, test (history authz/assembly); contracts/core/api-client/api/trainer-web build | Projection over domain tables; GET `/history/relationships/:id`; wrong trainer 404; trainee 403; trainer-web History tab; no event store; mobile history deferred |
| D3 Trainee offline sync | done | C3, C4, C5 | lint, typecheck, test (sync authz/idempotency/duplicate + mobile offline scenarios); contracts/core/api-client; db:migrate:local (0009) | SQLite outbox + push/pull; stable mutation UUID/idempotency; per-entity conflict rules; cursor after apply; uploads separate |
| D4 Push and reminders | done | C5 | lint, typecheck, test (notifications authz/dedupe/safe-payload + core reminder + mobile routing); contracts/core/api-client/api/mobile; db:migrate:local (0010 applied) | Device tokens + prefs; cron/queue reminder eval; routing-only payloads; dedupe; provider acceptance ≠ completion; FCM test double |
| D5 Selected realtime | done | C3, C4, C5, C6 | lint, typecheck, test (contracts/core/api-client/api incl. realtime authz/hint/plan-emit); trainer-web + mobile lint/typecheck/test; wrangler DO `RELATIONSHIP_REALTIME` | DO room per relationship; compact hints; clients refetch/sync; REST/sync authoritative without sockets |
| D6 Templates and libraries | done | C2 | lint, typecheck, test (templates authz/isolation/copy/libraries); db:migrate:local (0011 applied); contracts/core/api-client/api/trainer-web build | Trainer templates + exercise/food libraries as draft copy-sources; `creationSource: template`; never alias live plans |
| D7 Trainer mobile quick-use | done | C6, B4 | lint, typecheck, test, build (mobile + ui-mobile) | Role-aware trainer shell; attention/clients/check-ins; WhatsApp secondary; no plan builder |
| D8 Hardening | done | D1–D7 | lint, typecheck, test (authz matrix + log redaction + full workspace); db:migrate:local (no pending) | Auth matrix 401/isolation/role; structured logs without sensitive payloads; SLO comments in wrangler + packages/config; a11y + responsive; config wrong-owner → 404; Phase D complete |

## Session log

### 2026-09-26 — Phase A (A1–A3)
- Status: done
- Outcome: Runnable monorepo with API identity/session foundation
- Key paths: `docs/agent-loop/*`, `apps/*`, `packages/*`, `apps/api/drizzle/0000_identity.sql`
- Checks: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (all pass); `pnpm db:migrate:local` applied `0000_identity.sql`
- Risks / follow-ups: Production Firebase verification not wired (`AUTH_MODE=firebase` rejects); `/trainer/probe` is a temporary auth test surface for Phase A; Phase B starts at invitations

### 2026-09-26 — B1 + B2
- Status: done
- Outcome: Trainers can invite trainees; trainees accept and complete intake; trainers review to Coaching Ready
- Key paths: `apps/api/drizzle/0001_relationship_onboarding.sql`, `apps/api/src/routes/{invitations,relationships,intake}.ts`, `packages/contracts/src/{relationship,intake}.ts`, `packages/core/src/onboarding.ts`, `packages/api-client` relationship/intake methods
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. invitation isolation + onboarding transition tests); `pnpm db:migrate:local` (0001 already applied)
- Risks / follow-ups: UI slices B3/B4 consume these APIs; do not expand schema in UI slices

### 2026-09-26 — B3
- Status: done
- Outcome: Trainer can sign in on trainer-web (AUTH_MODE=test), list clients, create invitations, review intake, and open Configure Coaching stub
- Key paths: `apps/trainer-web/src/{auth,layout,pages,lib,components}`, `apps/trainer-web/src/App.tsx`, `apps/trainer-web/src/styles.css`, `packages/api-client/src/index.ts` (fetch bind fix)
- Checks: `pnpm --filter @fitbud/trainer-web` lint, typecheck, test, build (pass); `pnpm --filter @fitbud/api-client test` (pass); browser smoke on `:5175` sign-in → Home → Clients → Add Client invite create (pass)
- Risks / follow-ups: Local HTTP uses Bearer test token because API session cookies are Secure; Configure Coaching is stub until C1; production Firebase sign-in not wired

### 2026-09-26 — B4
- Status: done
- Outcome: Trainee can sign in (AUTH_MODE=test bearer), accept invitation, draft/submit intake, and land in trainee tab shell (Today / Workout / Diet / Progress / More)
- Key paths: `apps/mobile/App.tsx`, `apps/mobile/src/auth/AuthProvider.tsx`, `apps/mobile/src/navigation/{AppRouter,resolveRoute}.{ts,tsx}`, `apps/mobile/src/screens/{Auth,AcceptInvite,Intake,WaitingReview,UnsupportedRole}Screen.tsx`, `apps/mobile/src/trainee/TraineeShell.tsx`, `packages/ui-mobile/src/theme.ts`, `.env.example` (`EXPO_PUBLIC_API_BASE_URL`)
- Checks: `pnpm --filter @fitbud/mobile` lint, typecheck, test, build (pass); `pnpm --filter @fitbud/ui-mobile` lint, typecheck, test, build (pass); mobile e2e not run (no e2e harness)
- Risks / follow-ups: Production Firebase mobile sign-in not wired (test tokens only); trainer mobile deferred to D7; Phase C fills Today/Workout/Diet/Progress content

### 2026-09-26 — C1
- Status: done
- Outcome: Trainer can draft, configure, and activate coaching configuration (expectations for workouts, nutrition, check-ins, tracking) for a coaching-ready relationship; trainer-web Configure Coaching uses the API
- Key paths: `packages/contracts/src/configuration.ts`, `packages/core/src/configuration.ts`, `apps/api/drizzle/0002_coaching_configuration.sql`, `apps/api/src/routes/configurations.ts`, `apps/api/src/db/schema.ts` (config tables), `packages/api-client` config methods, `apps/trainer-web/src/pages/ConfigureCoachingPage.tsx`
- Checks: contracts/core/api-client lint+typecheck+test pass; API config+auth tests pass (`auth.test.ts`, `configuration.test.ts`); trainer-web lint/typecheck/test/build pass; `pnpm db:migrate:local` applied `0002_coaching_configuration.sql`
- Risks / follow-ups: Active config is immutable in-place (adjustment later); relationship stays `coaching_ready` after activate

### 2026-09-26 — C2
- Status: done
- Outcome: Trainers create plan drafts with validated JSON snapshots, preview, publish immediately or schedule, and create adjustment drafts from prior versions; published/effective/scheduled/superseded versions reject edits
- Key paths: `packages/contracts/src/plan.ts`, `packages/core/src/plan.ts`, `apps/api/drizzle/0003_plans.sql`, `apps/api/src/routes/plans.ts`, `packages/api-client` plan methods
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. `plans.test.ts`); local D1 has `plans`/`plan_versions`; contracts/api-client/trainer-web build pass
- Risks / follow-ups: Immediate publish sets status `effective` (not a lingering `published`); scheduled→effective promotion on read; plan builder UI deferred to C3; templates deferred to D6

### 2026-09-26 — C3
- Status: done
- Outcome: From an effective plan, workout assignments are generated with trainee-timezone windows; trainees start/pause/resume/complete/modify/skip on mobile; set Done keeps prescribed values unless overridden; session RPE required when configuration says so; Missed is server-derived; trainer web Plan + Activity read the same records
- Key paths: `packages/contracts/src/workout.ts`, `packages/core/src/{workout,timezone}.ts`, `apps/api/drizzle/0004_workouts.sql`, `apps/api/src/routes/workouts.ts`, `packages/api-client` workout methods, `apps/mobile/src/trainee/{WorkoutTab,ActiveWorkoutScreen,WorkoutSummaryScreen}.tsx`, `apps/trainer-web/src/pages/{ClientWorkspaceLayout,ClientPlanPage,ClientActivityPage}.tsx`
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. `workouts.test.ts` 401/403/lifecycle/missed); `pnpm db:migrate:local` applied `0004_workouts.sql`; trainer-web + mobile builds
- Risks / follow-ups: Assignment generation uses Mon/Wed/Fri-style weekday pattern from `sessionsPerWeek`; diet loop is C4; offline sync deferred to D3; mobile e2e not run (no harness)

### 2026-09-26 — C4
- Status: done
- Outcome: From an effective plan, meal assignments are generated with trainee-timezone confirmation windows; trainees confirm / lightweight deviate / skip on mobile; photo intent required only when config+prescription say so; Pending / Logged Later / Overdue are server-derived; trainer Activity shows the same compliance records
- Key paths: `packages/contracts/src/meal.ts`, `packages/core/src/meal.ts`, `apps/api/drizzle/0005_meals.sql`, `apps/api/src/routes/meals.ts`, `packages/api-client` meal methods, `apps/mobile/src/trainee/{DietTab,MealDeviationScreen}.tsx`, `apps/trainer-web/src/pages/ClientActivityPage.tsx`
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @fitbud/api test` (incl. `meals.test.ts` 401/403/lifecycle/photo/overdue); contracts/core meal tests; `pnpm db:migrate:local` (0005 applied); trainer-web + mobile typecheck/test/build
- Risks / follow-ups: Full R2 meal photo upload is D1; check-in loop is C5; offline sync deferred to D3; mobile e2e not run (no harness)

### 2026-09-26 — C5
- Status: done
- Outcome: Trainers schedule check-ins from active cadence; trainees submit from Today when due/overdue; Overdue is derived; trainers review context (submission, adherence, empty exceptions, measurements from answers, notes, plan) and Record Outcome / Adjust Coaching / Schedule Next / Record Note; WhatsApp is secondary hint only
- Key paths: `packages/contracts/src/checkin.ts`, `packages/core/src/checkin.ts`, `apps/api/drizzle/0006_checkins.sql`, `apps/api/src/routes/checkins.ts`, `packages/api-client` check-in methods, `apps/mobile/src/trainee/{CheckinScreen,TraineeShell}.tsx`, `apps/trainer-web/src/pages/{CheckinsPage,CheckinReviewPage,ClientCheckinsPage}.tsx`
- Checks: contracts/core/api/api-client lint+typecheck+test; `checkins.test.ts` 401/403/schedule/submit/overdue/review/inbox; core `checkin.test.ts`; local D1 has checkin tables (0006); trainer-web + mobile lint/typecheck/test/build
- Risks / follow-ups: Exception engine + attention feed is C6 (review context returns empty exceptions); full progress measurements/photos R2 is D1; offline check-in sync is D3; push reminders D4; mobile e2e not run (no harness)

### 2026-09-26 — C6
- Status: done
- Outcome: Deterministic Missed/Overdue exceptions appear on trainer Home attention; lifecycle Detected→Active→Acknowledged→Resolved without rewriting source signals; notes and interventions recorded; plan adjustment creates/publishes a new version trainees see when effective; check-in review `activeExceptions` is wired
- Key paths: `packages/contracts/src/exception.ts`, `packages/core/src/exception.ts`, `apps/api/drizzle/0007_exceptions.sql`, `apps/api/src/domain/exceptions.ts`, `apps/api/src/routes/exceptions.ts`, `apps/api/src/routes/exceptions.test.ts`, `packages/api-client` attention/exception/intervention methods, `apps/trainer-web/src/pages/{HomePage,ExceptionDetailPage,CheckinReviewPage,ClientPlanPage}.tsx`, `apps/mobile/src/trainee/TraineeShell.tsx`
- Checks: contracts/core/api/api-client lint+typecheck+test; `exceptions.test.ts` 401/403/lifecycle/attention/source-preserved; core `exception.test.ts`; local D1 has exception tables (0007); trainer-web + mobile lint/typecheck/test/build
- Risks / follow-ups: **Phase C (four priority loops) is complete.** Phase D next: D1 R2/progress, D2 history, D3 offline sync, D4 push, D5 realtime, D6 templates, D7 trainer mobile, D8 hardening. Mobile e2e / browser e2e not run (no harness). Resolve requires Acknowledged first. No AI recommendations or opaque scores.

### 2026-09-26 — D1
- Status: done
- Outcome: Trainees log measurements and progress photos via authorized R2 upload; meal photos when required associate a ready `media_assets` row; trainer and trainee Progress surfaces list stored measurements/entries/photos only (no fake charts)
- Key paths: `packages/contracts/src/progress.ts`, `packages/core/src/{progress,meal}.ts`, `apps/api/drizzle/0008_progress_media.sql`, `apps/api/src/routes/{progress,files}.ts`, `apps/api/src/lib/{files,memory-r2}.ts`, `apps/api/wrangler.toml` (`MEDIA` R2), `packages/api-client` progress/file methods, `apps/trainer-web/src/pages/ClientProgressPage.tsx`, `apps/mobile/src/trainee/{ProgressTab,DietTab}.tsx`
- Checks: contracts/core/api/api-client/trainer-web/mobile lint+typecheck+test; `progress.test.ts` + meals photo R2 association; local D1 applied `0008_progress_media.sql`
- Risks / follow-ups: Local R2 is wrangler-simulated under `.wrangler/state`. Production needs a real `fitbud-media` bucket. Mobile uses minimal PNG upload (no camera picker). History assembly is D2. Offline file upload is D3. Signed file URLs must stay out of logs.

### 2026-09-26 — D2
- Status: done
- Outcome: Trainer can open client workspace History and see chronological readable entries projected from real domain records (intake, onboarding, config, plans, workouts, meals, check-ins, progress, exceptions, notes/interventions); wrong trainer gets 404; trainee gets 403
- Key paths: `packages/contracts/src/history.ts`, `packages/core/src/history.ts`, `apps/api/src/domain/history.ts`, `apps/api/src/routes/history.ts`, `apps/api/src/routes/history.test.ts`, `packages/api-client` `listHistory`, `apps/trainer-web/src/pages/ClientHistoryPage.tsx`
- Checks: contracts/core/api-client/api/trainer-web lint+typecheck+test; `history.test.ts` 401/404/403/assembly; trainer-web build; no migration (projection only)
- Risks / follow-ups: Mobile history not added (trainee IA has no History destination). Source fetch capped at 100/table before merge+cursor — fine for MVP; revisit if histories grow large. D3 offline sync next.

### 2026-09-26 — D3
- Status: done
- Outcome: Trainee offline-capable actions write to local store/outbox first with stable mutation UUID + idempotency key; sync push/pull with authz; cursor advances only after local apply; per-entity conflict rules documented (published/effective plans never edited); file uploads remain separate
- Key paths: `packages/contracts/src/sync.ts`, `packages/core/src/sync.ts`, `apps/api/drizzle/0009_sync.sql`, `apps/api/src/domain/sync.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/routes/sync.test.ts`, `packages/api-client` pushSync/pullSync, `apps/mobile/src/sync/{engine,actions,SyncProvider}.ts(x)`, wired Workout/Diet/Checkin/Progress flows
- Checks: contracts/core/api-client/api/mobile lint+typecheck+test; `sync.test.ts` 401/403/push-pull/duplicate/immutable-plan; `engine.test.ts` airplane create, restart recover, reconnect cursor, retry same keys, file-upload separation; local D1 has `change_log` + `sync_mutations`
- Risks / follow-ups: Mobile store is in-memory (not native expo-sqlite) — no cold-kill persistence until SQLite adapter. Offline claim covers tested paths only. Device airplane e2e not run (no harness). D4 push/reminders next.

### 2026-09-26 — D4
- Status: done
- Outcome: Trainees register device tokens with ownership; cron/queue evaluates due workout/meal/check-in reminders from authoritative schedules + completion; push payloads are routing-only; dedupe prevents duplicate sends; provider acceptance stored separately from domain completion
- Key paths: `packages/contracts/src/notification.ts`, `packages/core/src/reminder.ts`, `apps/api/drizzle/0010_notifications.sql`, `apps/api/src/domain/reminders.ts`, `apps/api/src/routes/notifications.ts`, `apps/api/src/jobs/reminders.ts`, `apps/api/wrangler.toml` (cron + REMINDER_QUEUE), `packages/api-client` device/notification methods, `apps/mobile/src/notifications/*` + AuthProvider registration + TraineeShell deep-link routing
- Checks: contracts/core/api/api-client/mobile lint+typecheck+test; `notifications.test.ts` 401/ownership/dedupe/safe-payload/provider≠completion; core `reminder.test.ts`; mobile `routing.test.ts`; local D1 applied `0010_notifications.sql`
- Risks / follow-ups: PUSH_PROVIDER_MODE=test local FCM double only — production FCM not wired. Real Expo push permission/native listener not integrated (routing handlers + synthetic token registration). Quiet hours suppress delivery. D5 realtime next.

### 2026-09-26 — D5
- Status: done
- Outcome: Authorized relationship WebSocket channels fan out compact change hints (effective plan, workout execution, meal compliance, check-in submit/review, exception created/acknowledged/resolved); clients refetch/sync on hint; workflows remain correct when the DO/socket path is unavailable
- Key paths: `packages/contracts/src/realtime.ts`, `packages/core/src/realtime.ts`, `apps/api/src/realtime/{relationship-room,emit}.ts`, `apps/api/src/routes/realtime.ts`, `apps/api/wrangler.toml` (`RELATIONSHIP_REALTIME` → `RelationshipRealtimeRoom`, migration tag `v1-realtime`), emit hooks in plans/workouts/meals/checkins/exceptions, `packages/api-client` `getRealtimeConnection` / `realtimeWebSocketUrl` / `subscribeRealtime`, trainer-web + mobile `useRealtimeHints` (Home/workspace/TraineeShell)
- Checks: contracts/core/api-client/api lint+typecheck+test (incl. `realtime.test.ts` 401/404/426/503/connection target/safe hint/plan-publish emit); trainer-web + mobile lint/typecheck/test; no new D1 migration
- Risks / follow-ups: Node vitest cannot complete WS 101 (no WebSocketPair) — upgrade path covered through authz + 426/503. Production needs Cloudflare DO migration applied once per environment. Home opens one socket per owned relationship. D6 templates/libraries next.
- DO/wrangler: `[[durable_objects.bindings]] name = "RELATIONSHIP_REALTIME" class_name = "RelationshipRealtimeRoom"`; `[[migrations]] tag = "v1-realtime" new_classes = ["RelationshipRealtimeRoom"]`; export `RelationshipRealtimeRoom` from `apps/api/src/index.ts`

### 2026-09-26 — D6
- Status: done
- Outcome: Trainers save templates and create client plan drafts by copying template JSON (`creationSource: template`); exercise + Indian food libraries are copy-sources in Templates and Plan editor; template edits do not mutate existing client plans; wrong trainer cannot read/update another’s templates
- Key paths: `packages/contracts/src/template.ts`, `packages/core/src/template.ts`, `apps/api/drizzle/0011_templates_libraries.sql`, `apps/api/src/routes/{templates,libraries}.ts`, `apps/api/src/routes/plans.ts` (`POST .../from-template`), `apps/api/src/routes/templates.test.ts`, `packages/api-client` template/library methods, `apps/trainer-web/src/pages/{TemplatesPage,ClientPlanPage}.tsx`
- Checks: contracts/core/api-client/api/trainer-web lint+typecheck+test; `templates.test.ts` 401/403/isolation/copy/reapply/seeded libraries; local D1 has template/library tables (0011); trainer-web build
- Risks / follow-ups: D7 trainer mobile next. Templates nav shows truncated relationship ids when applying (no display-name join). Trainer-owned library CRUD exists but UI primarily uses global seeds + insert-into-form. Mobile e2e / browser e2e not run.

### 2026-09-26 — D7
- Status: done
- Outcome: Trainer can sign in on mobile and use Attention, Clients lookup, Check-ins inbox, plus acknowledge/resolve and check-in review quick actions; dual-role accounts pick a mode; trainee mode still works; no plan builder on mobile
- Key paths: `apps/mobile/src/navigation/{resolveRoute,AppRouter}.{ts,tsx}`, `apps/mobile/src/auth/AuthProvider.tsx`, `apps/mobile/src/screens/RoleSelectScreen.tsx`, `apps/mobile/src/trainer/{TrainerShell,AttentionTab,ClientsTab,ClientStatusScreen,CheckinsTab,CheckinReviewScreen,ExceptionReviewScreen,clients,whatsapp,labels}.*`, `apps/mobile/src/trainee/TraineeShell.tsx` (role switch)
- Checks: `pnpm --filter @fitbud/mobile` lint, typecheck, test (21), build — all pass; `pnpm --filter @fitbud/ui-mobile` lint, typecheck, test, build — all pass; mobile e2e not run (no harness)
- Risks / follow-ups: **D8 hardening next.** No phone numbers on profiles — WhatsApp opens generic `wa.me`. Client names come from invitation join when available. Dual-role selection is session-only (not persisted). Production Firebase still unwired.

### 2026-09-26 — D8
- Status: done
- Outcome: Hardening complete — cross-domain authorization matrix (401 / trainer isolation 404 / trainee 403); structured request logs with redaction (tokens, intake, notes, signed URLs); SLO guardrail comments only (no dashboards); trainer-web a11y + responsive breakpoints; mobile tab/button/list labels; configuration wrong-owner aligned to 404
- Key paths: `apps/api/src/routes/authorization-matrix.test.ts`, `apps/api/src/lib/log.ts`, `apps/api/src/middleware/request-log.ts`, `apps/api/src/index.ts`, `apps/api/src/routes/configurations.ts`, `apps/api/wrangler.toml`, `packages/config/slo-guardrails.js`, `apps/trainer-web/src/{styles.css,pages/HomePage,ClientsPage,layout/AppShell}`, `apps/mobile/src/{components/Screen,PrimaryButton,trainee/TraineeShell,trainer/TrainerShell,ClientsTab}`
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` — all pass (API 80 tests incl. matrix + log redaction); `pnpm db:migrate:local` — no pending; browser/mobile e2e not run (no harness)
- Risks / follow-ups: **Phase D / MVP loop slices A1–D8 are complete.** Non-blockers: production Firebase/FCM; native Expo push; mobile SQLite adapter (in-memory offline store); e2e harness; realtime WS 101 not in Node vitest; WhatsApp without phone numbers. No stop-and-ask items.

### Template

```
### YYYY-MM-DD — Slice ID
- Status: done | blocked
- Outcome:
- Key paths:
- Checks:
- Risks / follow-ups:
```
