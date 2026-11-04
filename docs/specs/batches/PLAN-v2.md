# PLAN v2 · Beta batch plan W5–W13 (redesign in the beta)

**Status:** Decided by Firoz, 4 Nov 2026; written by FitBud UI (planning bot) the same day. Docs only. Supersedes PR #148's sequence and IDs (PR #148's spec content is carried here, renumbered). Read this before any batch W5–W14.

## Decisions (Firoz, 4 Nov 2026 unless noted)
- **D-P2-1 The full v3 redesign is in the closed beta.** *"Without proper UI there's no proper beta opinion and without proper beta there's no product fit."* *"It's fine to push the beta date."* *"All of this can be considered in scope for beta."* The beta date moves to after the redesign; the 12 Nov rehearsal and 15 Nov invites are cancelled. Supersedes D-W4-9 (no W5–W11 until after the beta) and v14's rule that anything outside beta-tasklist v14 is post-beta, for these batches.
- **D-P2-2 Sequential renumbering.** *"You can rename the tasks sequentially that completely fine, W5b after W6-10 sounds confusing for implementer."* Batches run W5 → W13 in number order. Task IDs encode the batch: `Z<batch>-<n>` (e.g. Z6-9 = W6 task 9). Each spec keeps its old ID in a `formerly:` front-matter line. Mapping table below.
- **D-P2-3 Account deletion and step tracking are part of the beta.** (Z6-14, Z6-16, Z6-17, Z12-29, Z12-30; Z6-4, Z6-9, Z9-9, Z9-10.)
- **D-P2-4 Sequence.** W5 = old W5's activation lane first, because W6 backend and W8 coaching setup depend on it; then old W6–W10; then the rest of old W5; then old W11; then launch. W4 keeps agent engineering (BT1, BT2, BT2b, BT5 checklist) plus the QA items handed over from W3b (D-W4-13, D-W4-14); the launch steps move to W13.
- **D-P2-5 Rules struck** where they conflict with implementing this work (list in the PR body and below). All other standing rules stay: one task per PR, `files_owned`, two lanes never own one file, frames locked, never-misleading errors, no agent cap, agents-only code review, product rules in AGENTS.md.
- **D-P2-6 Splits (planner, 4 Nov 2026).** Task size checked against W3/W3b (S/M, one PR, ~45–75-line spec). Two specs split: ZB14 → **Z6-14** (archive, reactivate, middleware, public page) + **Z6-17** (purge job + runbook); ZG29 → **Z12-29** (trainee app + shared copy) + **Z12-30** (trainer web), because web and mobile never share a spec. Z5-2 (AC1b, 23 files) and Z5-4 (22 stub files) are large but stay whole: Z5-2 is the existing PR #57 refreshed by merging `main`, and Z5-4 is mechanical scaffolding whose point is one owner for the shared index files.
- **D-P2-7 Design-review interim rule (planner, pending Q-P2-2).** Z11-1 (the `diff.mjs` design-review tool) now runs after W7–W10. Every UI spec that ran it now says: until Z11-1 is on `main`, the reviewer compares captures with frames side by side and the PR says "design-review tool not on main yet".
- **D-P2-8 Old W12 (Phase 10: sessions, attendance, calls, coach-logged sets) is parked as W14**, not in the beta sequence: Firoz's 4 Nov sequence lists W5–W13 only, and the in-person phase is on hold. Specs kept, renumbered Z14-1–Z14-20. Firoz decides (Q-P2-3).
- **D-P2-9 W3b scope** (Firoz, recorded as D-W3b-36/D-W3b-37 in PR #211): W3b finishes only CU19 (#208, merged), #211, CU24, CU23 and the `qa-staging` starvation fix. CU25, CU21, the `QA_GUARANTEES` invariant and CU8 move to W4. D-W3b-31's v3 frame visual pass on trainee Today is absorbed by W9 (Z9-1–Z9-4). Tasks an agent should **ignore** in W3b: CU25, CU21, QA_GUARANTEES, CU8 (and anything else not in the finish list).
- **D-P2-10 Z10-3 dropped (Firoz, 4 Nov 2026).** No sessions in the MVP, so no Sessions tab stub in trainer mobile. Payments are tracking only: payment dates, subscription due dates, plan type, reminders and user confirmations. Z10-8 and Z10-12 no longer depend on Z10-3; the current `TrainerShell.tsx` tab bar stays (any v3 restyle of the four remaining tabs goes to W12 gap work). Answers the Z10-3 part of Q-P2-3. W10 is now 13 tasks.
- **D-P2-11 Z6-13 (automated D1 backups, BP2) moves to post-beta (Firoz, 4 Nov 2026).** The beta keeps D1 Time Travel + the documented restore (v14 D-B1). The spec stays in `docs/specs/` for after the beta; the W6 `ops` lane and the manual BP2 step are not run. W6 is now 16 tasks.
- **D-P2-12 Payment tasks kept as tracking only (Firoz, 4 Nov 2026).** Z6-3, Z6-8, Z8-3, Z8-4 and Z7-10 stay. They are date and confirmation based tracking only: payment dates, subscription due dates, plan type, reminders and the trainer's or client's confirmation that a payment was made. No collection, no gateway, no invoices, no session counts.
- **D-P2-13 Z8-7 in-person coaching: NOT final, pending Firoz.** Z8-7 as specced (coaching mode field: online / in-person / hybrid, tracking only) stays in W8. Firoz will add trainer-logged in-person workouts only if they are small. Desired scope: a trainer starts a workout on behalf of a client in one of two modes: (a) **live logging**, where two or more clients' workouts are logged in parallel in one in-person session, or (b) a **log-workout form**, where the trainer fills in the values afterwards. Planner estimate (checked against `main` at c398f67, 4 Nov 2026):
  - **Reusable:** the workout data model (`workout_assignments`, `workout_executions`, `exercise_executions`, `set_executions`, migration 0004) and the execution flow in `apps/api/src/routes/workouts.ts` (start, pause, resume, set complete/skip, complete, read); the routes already authorise trainers for reads via `canAccessRelationship`. Trainee `ActiveWorkoutScreen.tsx` (~1,450 lines), `workoutSession.ts`, `workoutDisplay.ts`, the kg keypad (Z9-7) and numeric `load_kg` (Z6-1, Z6-15) give the set-entry UI. Trainer web `WorkoutPanel.tsx` already shows a logged workout. W14 Z14-5 / Z14-14 / Z14-15 / Z14-20 specs already describe coach-logged sets, group logging and the trainee read-only view and can be cut down rather than rewritten.
  - **Not reusable as is:** start, set complete and complete are `requireRole("trainee")` and check `relationship.traineeUserId === actor.userId`; there is no "logged by" field; the trainee screen is tied to one execution, its offline queue and the Live Activity; trainer mobile has no workout screens at all.
  - **Estimate: about 8 tasks of the standard size (S/M, one PR, D-P2-6)** — W6: (1) migration `logged_by_user_id` + `logged_by_role` on workout executions; (2) API: trainer may start / log sets / complete for own clients, plus a one-call "log a past workout" endpoint. W9: (3) trainee read-only "logged by your coach" view. W10: (4) extract the set-entry row and keypad into a shared mobile component (no behaviour change for the trainee); (5) trainer mobile "Start workout for client" with mode choice and single-client live logging; (6) parallel live logging, switching between 2+ clients in one session; (7) log-workout form (fill values after). W8: (8) trainer web log-workout form in the client workspace. No sessions, attendance, calendar or reminders (those stay in parked W14).
  - **Risks:** trainee and trainer editing the same execution (`record_version` conflicts, needs a rule such as "trainer-started executions are read-only to the trainee"); Z6-11 log-time bounds would reject late form entries unless trainers are exempt; adherence, streaks and exceptions must not mis-attribute or double-fire for coach-logged workouts; parallel logging keeps several executions in local state on one phone (offline queue was built for one); the trainee screen refactor risks regressions in the shipped workout flow; new trainer mobile screens have no approved frames (FitBud UI would need to draw them, Firoz reviews) — the largest schedule risk.
  - Firoz decides: add these ~8 tasks to the beta (W6/W8/W9/W10), or keep in-person logging post-beta. Until then nothing is added.
- **D-P2-14 Phase 10 (W14) stays parked; task list for Firoz (4 Nov 2026).** Firoz asked what Phase 10 contains; the 20 tasks are listed in plain words in the W14 section of the mapping below and in the reply on PR #212. Source for all of them: master list v13 Phase 10 rows S1a–S7 (`docs/tasks/fitbud-tasklist-v13.md`, branch `claude/nifty-curie-ralrce`, commit c5271ae), carried in `docs/specs/batches/W14.md` and specs `docs/specs/Z14-1.md`–`Z14-20.md`. With D-P2-10 (no sessions in the MVP), W14 does not run before the beta; Z14-12 no longer has a Z10-3 stub to replace.

## Sequence

| Batch | Name | Agent tasks | Depends on | From |
|---|---|---|---|---|
| W3b | Cleanup (closing) | 4 left: #211 spec PR, CU24, CU23, starvation fix | — | D-W3b-36 |
| W4 | Release engineering + QA debts | 14: BT1, BT2, BT2b, BT5 (doc), BT6, BT7–BT12, CU25, CU21, CU8 | W3b | W4 + W3b hand-over |
| W5 | Activation | 4 | W4 | old W5 (ZA4, ZA5, ZA6, ZA11) |
| W6 | Backend | 16 (Z6-13 post-beta, D-P2-11) | W5 (Z5-1, Z5-4) | old W6 (+1 split) |
| W7 | Trainer web Home and side panel | 15 | W5; Z7-8 needs Z6-10 | old W7 |
| W8 | Trainer web client workspace | 14 | W6, W7 | old W8 |
| W9 | Trainee mobile (Today v3, steps) | 10 | W6, W8; Z9-6 needs CU23 | old W9 |
| W10 | Trainer mobile | 13 (Z10-3 dropped, D-P2-10) | W9 | old W10 |
| W11 | Polish and QA tooling | 7 | W10 | old W5 (ZA1–3, ZA7–10) |
| W12 | Gap buckets + account deletion UI | 30 | W11 (Z11-2), W6 (Z6-14) | old W11 (+1 split) |
| W13 | Launch | 1 docs task + human steps | W12 | W4 human items |
| W14 | Phase 10 (parked) | 20 | not scheduled | old W12 |

W5–W12: **109 agent tasks** (111 less Z10-3 and Z6-13; plus ~8 if Firoz adds Z8-7 in-person logging, D-P2-13), plus W13's checklist refresh.

**W5 Activation.** AC1a (Z5-1, PR #50) removes the `configured` status with the next free migration; AC1b (Z5-2, PR #57) adds atomic Activate from draft, immediate schedule and discard; Z5-3 removes raw enum labels on web and mobile; Z5-4 mounts the contract, API-client and API stubs for every W6 module once so the W6 lanes never touch a shared index. One serial lane. It goes first because W6 needs the migration slot and stubs, and W8's coaching setup builds on Activate / Save as vN+1.

**W6 Backend.** One serial migration lane (load_kg, check-in form v2, subscription tracking fields, daily steps + target, archived account state), then parallel module lanes: strength read model, progress metrics by question key, client settings and payment records (tracking only), steps API (Z6-9), bulk resolve, log-time bounds, reactivation rules, ~~automated D1 backups~~ (post-beta, D-P2-11), numeric load on set save, and account deletion (Z6-14 archive/reactivate, Z6-17 purge + runbook).

**W7 Trainer web Home and panel.** Targeted Home refresh, row targets and count cards (DS4), all-clear and iPad Home, the v3 side panel (per-client list, resolve form, read-only states, multi-select bulk actions on Z6-10), the full views (Needs attention, Renewals due, Asked you on WhatsApp), and ended-client read-only presentation (DS7).

**W8 Trainer web client workspace.** Client ⋯ menu and client settings (basic details, subscription edit, payment records — tracking only), coaching setup without basics, footer Activate / Save as vN+1 (DS3), coaching mode, Plan tab, Check-ins tab, check-in form builder with standard keys, Reminders card, and Progress (metrics, compare, strength, photos).

**W9 Trainee mobile.** Today v3 (kcal ring, macro bars, chips, done/rest/past/offline states, banners) — this absorbs D-W3b-31 — Diet buttons back, Workout current week and kg keypad, Check-in with picked measurements, and steps from HealthKit / Health Connect (Z9-9) with setup screens (Z9-10).

**W10 Trainer mobile.** Needs-you cards with Undo and states, v3 tab bar, exception sheets and review states, nudge logging, Clients list and status, check-in review and list, More / notifications / profile / help / role select.

**W11 Polish and QA tooling.** Design-review diff step (Z11-1), P1 full UI audit feeding W12 (Z11-2), trainee civil dates and kcal that add up (Z11-3), demo seed timezones and invariants (Z11-4, Z11-5), drink servings (Z11-6), dependency advisories (Z11-7).

**W12 Gaps and account deletion UI.** Gap buckets G1–G7, G9–G11 across web auth, roster, client, plan, templates, shell, mobile onboarding, diet, progress, settings and ended states (2–5 frames each), then the account deletion and reactivation screens on mobile (Z12-29) and web (Z12-30) with the BP1 frames from PR #153.

**W13 Launch.** Checklist refresh for v3, BT5 dress rehearsal on staging, I6b production deploy with all W5–W12 migrations, store submission with in-app deletion and health declarations, invites on the date Firoz sets.

## Rules struck (D-P2-5)
- `docs/specs/batches/W4.md`: D-W4-9; the Goal's "BT5 on Thu 12 Nov; invites out Sun 15 Nov"; Order step 4 (dates, launch steps → W13); D-W4-11's "Thu 12 Nov"; the human lane row.
- `docs/tasks/manual-steps.md`: "There are no W5–W11 batches…" (header), "invites Sun 15 Nov", step 10 "Thu 12 Nov", step 13 "Thu 12 Nov", step 16 "Sat 14 Nov" / "Sun 15 Nov", step 18.
- `docs/tasks/beta-tasklist-v14.md`: rev 5 "No W5–W11 until after the beta ships"; "What it is not… Don't schedule those until the beta ships"; "Beta target: Sun 15 Nov 2026"; D-B1 "Post-beta: in-app account deletion (BP1), automated backups (BP2)"; §"Post-beta, before public release: BP1, BP2"; "#50 AC1a and #57 AC1b" post-beta; §7 W4 row's 12 Nov / 15 Nov.
- `docs/specs/README.md`: "Task list v13 stays the master list for post-beta work."
- Every W5–W14 batch file and the manual list from PR #148: "DO NOT START: … planning only, kept ready for after the beta ships" statuses (W14 keeps a parked status); "Order (3 implementer slots, one Max seat)" headings and "Run at most 3 implementer sessions" (conflict with the no-cap rule, CLAUDE.md 3 Nov); D-W5-9's "planning only" premise; Z6-14's "not needed for the closed beta".
- PR #148 and PR #153 titles still say "[DO NOT START]"; titles were not edited (outside this PR). This PR replaces #148.
- `CLAUDE.md`, `AGENTS.md`: no line forbids W5–W11 before the beta; unchanged.

## MVP / out-of-scope conflicts (listed, not removed)
| Task | What it does | Conflicts with |
|---|---|---|
| Z14-1–Z14-20 (W14, parked) | Phase 10: sessions and check-in calls tables and API, attendance roll-call incl. late cancel, session/call reminders, coach-logged sets, web/iPad/trainer-mobile Sessions screens, trainee coach-logged view | In-person phase on hold (Firoz). PR #148 recorded "Firoz took Phase 10 off hold, 3 Nov" — contradictory; Q-P2-3. D-W14-2 already drops package/session-count rules (AGENTS.md: "no session counting"). |
| Z10-3 (W10) | v3 trainer tab bar with a **Sessions** tab stub ("coming") | **Dropped** (D-P2-10): no sessions in the MVP. |
| Z8-7 (W8) | Coaching mode section: online / in-person / hybrid | Tracking field stays. Trainer-logged in-person workouts estimated at ~8 tasks, **pending Firoz** (D-P2-13). |
| Z6-3, Z6-8, Z8-3, Z8-4, Z7-10 | Subscription and payment **tracking** (dates, due dates, plan type, paid/unpaid confirmation, method; Renewals due view) | **Kept** (D-P2-12): date and confirmation based tracking only, no collection. |
| Z6-13 (W6) | Automated D1 backups to R2 (BP2) | **Post-beta** (Firoz, 4 Nov 2026, D-P2-11). |

## Questions for Firoz
- **Q-P2-1 Move account deletion UI earlier?** Recommend yes: move Z12-29 + Z12-30 into W10 (or right after W6) so deletion is complete end to end early. Z6-14/Z6-17 land in W6, the BP1 frames are approved (PR #153), and stores require in-app deletion, so leaving the UI to W12 leaves a backend-only feature for four batches. Cost: Z12-29 depends on Z12-27 (trainee settings) — moving it needs that dependency rewritten to the current settings screen. Not decided.
- **Q-P2-2 Run Z11-1 (design-review tool) and Z11-3 (trainee kcal/dates) earlier?** Recommend running both inside W5 as extra lanes (no file overlap with the activation lane): Z11-1 is a step every W7–W10 UI spec was written to use, and Z11-3 was a W9 prerequisite that W9's Diet task (Z9-5) assumes. Under the current order they run after the screens they were meant to guard. Not decided.
- ~~**Q-P2-3**~~ Answered 4 Nov 2026: no sessions in the MVP, Z10-3 dropped (D-P2-10); W14 stays parked (D-P2-14). Was: **Phase 10 (W14):** on hold (as in the 4 Nov brief) or off hold (as PR #148 recorded for 3 Nov)? If on hold, should Z10-3 drop the Sessions tab stub?
- **Q-P2-4 Live Activity cut-line:** v14 D-B7 ties it to Thu 12 Nov. Recommend "before the W13 rehearsal"; "LA never blocks BT1" unchanged.
- **Q-P2-5 New beta date** (after W12).
- **Q-P2-6 Z8-7 in-person logging:** add the ~8 tasks in D-P2-13 to the beta, or post-beta?

## Mapping old → new
| Old (PR #148) | New | Batch | Title |
|---|---|---|---|
| ZA4 | Z5-1 | W5 | Refresh AC1a (PR #50): remove the configured status, migration renumbered to the next free number |
| ZA5 | Z5-2 | W5 | Refresh AC1b (PR #57): atomic Activate from draft, immediate schedule, discard |
| ZA6 | Z5-3 | W5 | No raw enum labels: guard tests on web and mobile, and fix the remaining call sites |
| ZA11 | Z5-4 | W5 | API scaffolding for W6: empty contract, client and route modules, mounted once |
| ZB1 | Z6-1 | W6 | Migration: numeric load_kg and load_kind on sets, with a label parser and backfill |
| ZB2 | Z6-2 | W6 | Migration: global check-in form v2 (insert-only), new assignments use v2 |
| ZB3 | Z6-3 | W6 | Migration: payment records and subscription tracking fields (tracking only) |
| ZB4 | Z6-4 | W6 | Migration: daily_steps and a per-client steps target (default 8,000) |
| ZB5 | Z6-5 | W6 | Strength read model API: top set per exercise and workouts per week |
| ZB6 | Z6-6 | W6 | Check-in form: standard question keys in the schema and validation |
| ZB7 | Z6-7 | W6 | Progress metrics API by question key: series, ranges and compare |
| ZB8 | Z6-8 | W6 | Client settings API: basic details, subscription edit and payment records |
| ZB9 | Z6-9 | W6 | Steps API: trainee daily upsert and read, trainer read, per-client target |
| ZB10 | Z6-10 | W6 | Bulk Reviewed / Resolve for one client's compatible exceptions, with undo |
| ZB11 | Z6-11 | W6 | Client log-time bounds: reject logs in the future or before the window opens |
| ZB12 | Z6-12 | W6 | Reactivation: logs dated before ended_at never reopen or count against closed exceptions |
| ZB13 | Z6-13 | W6 | Automated D1 backups: scheduled export to R2 with retention, and a restore test |
| ZB14 | Z6-14 | W6 | Account deletion API: archive for 6 months and reactivate on sign-in (purge split to Z6-17) |
| ZB15 | Z6-15 | W6 | Set numeric load on every set save (direct and sync) |
| ZB16 | Z6-16 | W6 | Migration: archived account state with a purge date on users |
| ZC1 | Z7-1 | W7 | Home: targeted section updates instead of whole-page refetch, 45 s poll paused when hidden |
| ZC2 | Z7-2 | W7 | Home: whole-row click targets, count cards per DS4, renewal row destination |
| ZC3 | Z7-3 | W7 | Home: drawer close is idempotent, check-ins card opens To review, names on activity lines |
| ZC4 | Z7-4 | W7 | Home: all-clear state and iPad Home match frames 135 and 191 |
| ZC5 | Z7-5 | W7 | Side panel v3: per-client list, arrows and n of m, Resolved with Undo and Next, iPad portrait |
| ZC6 | Z7-6 | W7 | Side panel: resolve form with outcome chips, nudge limited, quiet-hours wait |
| ZC7 | Z7-7 | W7 | Side panel: read-only from Reviewed, item gone, and no write actions for ended clients |
| ZC8 | Z7-8 | W7 | Side panel: multi-select with bulk Reviewed / Resolve and Undo |
| ZC9 | Z7-9 | W7 | Home full view: Needs attention |
| ZC10 | Z7-10 | W7 | Home full views: Renewals due and Asked you on WhatsApp |
| ZC11 | Z7-11 | W7 | Ended client: Configure page title, copy and status read as ended |
| ZC12 | Z7-12 | W7 | Ended client: Configure page switches to read-only when coaching ends while it is open |
| ZC13 | Z7-13 | W7 | Read-only presentation for ended setups and non-editable fields (frame 179 style) |
| ZC14 | Z7-14 | W7 | Client header ⋯ menu: Escape returns focus, arrow keys, stays on screen at 393 px |
| ZC15 | Z7-15 | W7 | Copy: View reminder history; ended clients' onboarding draft and reminders footer |
| ZD1 | Z8-1 | W8 | Client ⋯ menu: Client settings first, then the actions in the frame |
| ZD2 | Z8-2 | W8 | Client settings overview and Edit basic details drawer |
| ZD3 | Z8-3 | W8 | Client settings: edit subscription with validation, ended read-only, renewal rows point here |
| ZD4 | Z8-4 | W8 | Client settings: payment records (tracking only) |
| ZD5 | Z8-5 | W8 | Coaching setup without basics or subscription, with editable targets and a steps target |
| ZD6 | Z8-6 | W8 | Coaching setup footer: Save draft, Activate with confirmation, Save as vN+1 |
| ZD7 | Z8-7 | W8 | Coaching setup: coaching mode section (online, in-person, hybrid) |
| ZD8 | Z8-8 | W8 | Plan tab: one current program card with workout, nutrition and versions |
| ZD9 | Z8-9 | W8 | Client Check-ins tab: summary, status chips with counts, ended and iPad |
| ZD10 | Z8-10 | W8 | Check-in form builder: fixed standard questions and the measurement picker |
| ZD11 | Z8-11 | W8 | Overview: Reminders card and the Reminders drawer over Overview |
| ZD12 | Z8-12 | W8 | Progress: metric picker, weight, ratings and measurements |
| ZD13 | Z8-13 | W8 | Progress: compare two metrics and strength from logs |
| ZD14 | Z8-14 | W8 | Progress: photos compare, sparse, empty, ended and loading |
| ZE1 | Z9-1 | W9 | Today v3: empty and partial days with the kcal ring, macro bars and chips (iOS and Android) |
| ZE2 | Z9-2 | W9 | Today v3: done and rest-day states (iOS and Android) |
| ZE3 | Z9-3 | W9 | Today v3: past day with Back to today, skeleton, and offline with logs waiting |
| ZE4 | Z9-4 | W9 | Today v3: meal and coach-note banners, check-in reviewed banner, reminders paused, next check-in |
| ZE5 | Z9-5 | W9 | Diet: Eaten as planned and Something different buttons back; offline adds planned kcal and reconciles |
| ZE6 | Z9-6 | W9 | Workout tab: current week shows the day's workout summary and the missed card |
| ZE7 | Z9-7 | W9 | Set entry: kg keypad with ±2.5 and a Bodyweight toggle; light rest timer |
| ZE8 | Z9-8 | W9 | Check-in: only the picked measurements with last value and keypad, and four 1–5 ratings |
| ZE9 | Z9-9 | W9 | Steps: read daily totals from HealthKit and Health Connect and sync them |
| ZE10 | Z9-10 | W9 | Steps setup screens: Apple Health permission (iOS) and install Health Connect (Android) |
| ZF1 | Z10-1 | W10 | Needs you cards: client names, "since" from the oldest open item, Mark answered with a 5 s Undo |
| ZF2 | Z10-2 | W10 | Needs you: all clear, offline cached, and couldn't load with Retry |
| ZF3 | Z10-3 | W10 | v3 trainer tab bar: Needs you, Sessions (stub), Clients, Check-ins, More |
| ZF4 | Z10-4 | W10 | Exception sheets: resolve confirm with outcome chips and note, nudge sheet with WhatsApp prefill |
| ZF5 | Z10-5 | W10 | Exception sheets: ⋯ actions and Add note (visible to the client) |
| ZF6 | Z10-6 | W10 | Exception review: resolved read-only, ended client banner, loading, no longer available, offline |
| ZF7 | Z10-7 | W10 | Log "Nudge opened in WhatsApp" in Recent activity and include the Today link in the prefill |
| ZF8 | Z10-8 | W10 | Clients list: one-row state chips, weeks per client, Ended only under Ended |
| ZF9 | Z10-9 | W10 | Client status: v3 header, plan kcal, Reminders card, Recent activity; ended summary with Reactivate |
| ZF10 | Z10-10 | W10 | Check-in review: scales, measurements, photos and three summary tiles; saved read-only |
| ZF11 | Z10-11 | W10 | Check-ins quick list: To review and Overdue, empty, loading, Android |
| ZF12 | Z10-12 | W10 | More, notification settings with rollback, Android 13 permission prompt |
| ZF13 | Z10-13 | W10 | Profile with sign-out confirm, and Help with the no-mail-app sheet |
| ZF14 | Z10-14 | W10 | Role select with Remember my choice, switch-role sheet, unsupported role |
| ZA1 | Z11-1 | W11 | Visual-diff and design-review step on the QA1 nightly screenshots |
| ZA2 | Z11-2 | W11 | P1 full UI audit on main: per-screen gap lists for G1–G11 and the W7–W10 screens |
| ZA3 | Z11-3 | W11 | Trainee Today and Diet: civil dates and Diet kcal that add up to the meals |
| ZA7 | Z11-4 | W11 | Demo seed: remove the hard-coded Asia/Kolkata literals in history.ts and test close−30 min |
| ZA8 | Z11-5 | W11 | Demo seed: timestamp invariants for relationships, check-ins, measurements, plans and subscriptions |
| ZA9 | Z11-6 | W11 | Library: cup and glass servings for the 15 drinks capped at 100 ml, and black tea's label |
| ZA10 | Z11-7 | W11 | Dependency advisories: patch within semver, list what is left |
| ZG1 | Z12-1 | W12 | Web and iPad sign in |
| ZG2 | Z12-2 | W12 | Trainer first run: profile, templates, invite, done |
| ZG3 | Z12-3 | W12 | Clients roster: default, filtered empty, empty, error, ended |
| ZG4 | Z12-4 | W12 | Add client: form, success, reactivate; iPad clients |
| ZG5 | Z12-5 | W12 | Invite detail and revoke |
| ZG6 | Z12-6 | W12 | Client overview: full, previous week, iPad |
| ZG7 | Z12-7 | W12 | Intake review: submitted and not submitted; note composer and delete |
| ZG8 | Z12-8 | W12 | Activity and meal panel; check-in review and reviewed; iPad review |
| ZG9 | Z12-9 | W12 | History and search |
| ZG10 | Z12-10 | W12 | Plan empty, assign, diet scope, partial failure |
| ZG11 | Z12-11 | W12 | Workout builder, conflict, nutrition builder |
| ZG12 | Z12-12 | W12 | iPad builder, read-only builder, plan-filtered calendar |
| ZG13 | Z12-13 | W12 | Templates hub, mine empty, use and fork |
| ZG14 | Z12-14 | W12 | Intake form builder; food and exercise libraries |
| ZG15 | Z12-15 | W12 | Settings: profile and notifications |
| ZG16 | Z12-16 | W12 | Asked drawer and pain flag |
| ZG17 | Z12-17 | W12 | System states: error, not found, offline, forbidden |
| ZG18 | Z12-18 | W12 | Trainee sign in: email, code, error |
| ZG19 | Z12-19 | W12 | Invite, intake, waiting, reminder setup |
| ZG20 | Z12-20 | W12 | Meal plan, Ask coach, item unavailable |
| ZG21 | Z12-21 | W12 | Diet photo, Something different, portion change, ate out |
| ZG22 | Z12-22 | W12 | Food search, check-in sent, diet error |
| ZG23 | Z12-23 | W12 | Workout day, summary, not today |
| ZG24 | Z12-24 | W12 | Progress and notifications inbox (with empty and answered) |
| ZG25 | Z12-25 | W12 | More and reminder settings (denied, paused, Android) |
| ZG26 | Z12-26 | W12 | Quiet hours and meal times with errors and saved |
| ZG27 | Z12-27 | W12 | Sync status, sync conflict, sign out with unsent logs |
| ZG28 | Z12-28 | W12 | Ended Today and reactivation (conflict, expired) |
| ZG29 | Z12-29 | W12 | Account deletion and reactivation screens, trainee app (web split to Z12-30) |
| ZH1 | Z14-1 | W14 | Migration: sessions, attendance and check-in calls tables |
| ZH2 | Z14-2 | W14 | Sessions and check-in calls API: create, list by range, edit, cancel |
| ZH3 | Z14-3 | W14 | Attendance API: roll-call statuses, late cancel and trainer override |
| ZH4 | Z14-4 | W14 | Session and call reminders: push 45 min before sessions and 15 min before calls |
| ZH5 | Z14-5 | W14 | Migration and API: coach-logged sets for one or many present clients, with Undo |
| ZH6 | Z14-6 | W14 | Trainee suggest-a-change API for coach-logged sets |
| ZH7 | Z14-7 | W14 | Trainer web Sessions: week calendar (6 am–9 pm, calls dashed) |
| ZH8 | Z14-8 | W14 | Trainer web Sessions for an online-only coach: calls only |
| ZH9 | Z14-9 | W14 | Schedule-a-call prompts after a check-in review and when assigning a check-in |
| ZH10 | Z14-10 | W14 | iPad group session by exercise: log sets for present clients, with Undo |
| ZH11 | Z14-11 | W14 | Log during or after a session on web and iPad (DS6 frames) |
| ZH12 | Z14-12 | W14 | Trainer mobile Sessions tab: today's sessions and calls |
| ZH13 | Z14-13 | W14 | Trainer mobile batch roll-call: expected → present, late or absent |
| ZH14 | Z14-14 | W14 | Trainer mobile group logging: same exercise for present clients, with Undo |
| ZH15 | Z14-15 | W14 | Trainer mobile single-client log during a session and after-session quick log |
| ZH16 | Z14-16 | W14 | Trainer mobile day agenda |
| ZH17 | Z14-17 | W14 | Trainer mobile add session and add call |
| ZH18 | Z14-18 | W14 | Trainer mobile Sessions tab for an online-only coach, with empty state |
| ZH19 | Z14-19 | W14 | Session and call reminder notification on the trainer phone: copy and deep link |
| ZH20 | Z14-20 | W14 | Trainee: coach-logged workout read-only, with suggest a change |
| (split from ZB14) | Z6-17 | W6 | Account purge job after 6 months and the immediate-deletion runbook |
| (split from ZG29) | Z12-30 | W12 | Account deletion and reactivation screens, trainer web |

PR #148's batch files map as: old W5 → W5 + W11; old W6–W10 → W6–W10 (same numbers); old W11 → W12; old W12 → W14 (parked). Decisions follow their batch: D-W5-2/3/5/6/7/9/10 → D-W11-*; old D-W11-* → D-W12-*; old D-W12-* → D-W14-*. `manual-steps-w5-w11.md` is folded into `docs/tasks/manual-steps.md`.
