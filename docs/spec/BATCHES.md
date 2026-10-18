# Batch plan

70 screen files · 717 acceptance checks · plus Batch 0 (shared and backend). Run the batches **in order**. Within a batch, screens are listed in dependency order. One agent run per batch. Each run produces one report in the README format and the evidence files.

**Every batch:**
- Read `README.md`, `00-foundations.md` and `01-product-rules.md`, then **only** the batch's files, IN FULL.
- `pnpm db:reset` before evidence. Run the banned-strings check.
- Done = every check PASS with cited evidence.

## Dependency order

```
Batch 0 (API/seed fixes, packages/core labels+format, tokens, Satoshi, Button/Overflow/StatusChip, Screen PTR, banned-strings test)
  ├─▶ TW-A shell+Home+drawer ─▶ TW-B entry/roster ─▶ TW-C workspace frame ─▶ TW-D plan/builders ─▶ TW-E activity/check-ins ─▶ TW-F templates (reuses TW-D builders) ─▶ TW-G settings/ended/misc
  └─▶ M-1 trainee entry ─▶ M-2 Today/diet ─▶ M-3 workout ─▶ M-4 progress/check-in/inbox ─▶ M-5 settings/sync ─▶ M-6 ended/widget/steps
                        └─▶ M-7 trainer mobile triage ─▶ M-8 trainer mobile check-ins/More
```
The mobile track can run in parallel with the web track once Batch 0 is merged, because they share only `packages/*`. Within each track the order is strict.

## Batch 0: backend and shared fixes (no screen redesign)

Files: `03-api-changes.md` (part A plus "Batch 0 shared-code deliverables"), `00-foundations.md` (Implementation notes), `01-product-rules.md` §B and §C.

| # | Item | Where | Acceptance (prove with a test or screenshot) |
|---|---|---|---|
| 0.1 | Attention: group by client **before** limiting | `apps/api/src/routes/exceptions.ts:115–150` | API test: `groupBy=relationship` returns separate groups for Rohan, Ishita and others; `limit` counts groups |
| 0.2 | Ended relationships excluded from inbox, attention, re-engage, feed and Home; seed cleanup | `routes/checkins.ts`, exceptions, `routes/activity-feed.ts`, seed | API tests: Kavya `b9f01670…` and Nikhil `8919b5c0…` absent |
| 0.3 | Seed `detected_at`/`acknowledged_at` as full instants; mapper tolerant | `seed/demo/history.ts:338`, `domain/mappers.ts` | `GET /exceptions/f588b76a-…` returns 200 |
| 0.4 | Idempotent detection; realistic exception volume | evaluation jobs, seed | Age of the oldest open item survives an API restart; ≤ ~10 open items per client in the seed |
| 0.5 | Structured exception details; no ISO date in `summary` | `packages/core/src/exception.ts:140` | Unit test; banned-strings `iso-date` passes on Home |
| 0.6 | `clientWhatsappE164` in the workspace header and re-engage; every trainer `wa.me` uses it | `domain/responsiveness.ts:183–186`, `domain/workspace.ts:678`, `packages/contracts/src/workspace.ts`, `WorkspaceHeader.tsx:76–77` | Contract test; the URL contains the client number |
| 0.7 | Web `{data}` envelope unwrapped (or use `packages/api-client`) | `apps/trainer-web/src/lib/http-api.ts:30–31` | Unit test; `/templates` lists templates |
| 0.8 | RequireAuth role check (trainee-only → client message) | `layout/RequireAuth.tsx:46` | E2E with `sneha.review` |
| 0.9 | Activity feed kcal ÷ NUTRIENT_SCALE; audit `*_scaled` | `routes/activity-feed.ts:86`, seed `history.ts:208` | API test returns 400 not 400000000 |
| 0.10 | Workout duration from events; capture stub fix | `WorkoutSummaryScreen.tsx:25–33` | Unit test |
| 0.11 | No future-dated seed events; `/me` roles investigated for sneha.review | seed, auth `/me`, `resolveRoute.ts` | API test |
| 0.12 | Seed display names title-cased; `formatPersonName()` | seed, `packages/core` | banned-strings `lowercase-demo-name` passes |
| 0.13 | **`packages/core/src/labels.ts`** for every API enum; delete `replace('_',' ')` helpers | new file; `apps/mobile/src/trainer/labels.ts`, `HomePage.tsx:275` | Unit test covering every enum in `packages/contracts` |
| 0.14 | **Date/time formatter** in `packages/core/src/format.ts` (product rules §C) used by web `lib/format.ts` and mobile `lib/dates.ts` | `packages/core` | Unit tests: 'Thu 15 Oct', '7:30 am', clamped relative times, client time zone |
| 0.15 | **Token hex fixes** `#1A1249→#1A1248`, `#FF5B7D→#FF587D`; regenerate tokens.css; web `--radius` 16 | `packages/tokens/src/tokens.ts:7–8`, `styles.css:8` | Token unit test |
| 0.16 | **Satoshi**: one web import (drop `index.html:13` or `styles.css:1`); native 600 weight; mobile body 16, display 28; touch target 48 | `index.html`, `styles.css`, `FontsProvider.tsx`, `typography.ts`, `theme.ts` | Screenshot `evidence/B0-type.png` (web + mobile type specimen) |
| 0.17 | **Button hierarchy** (primary / secondary / tertiary / destructive, plus WhatsApp neutral secondary) on web (React component) and mobile (replaces `PrimaryButton`), plus an **OverflowMenu** (web ⋯ menu; mobile ⋯ sheet) | new in `apps/trainer-web/src/components/`, `packages/ui-mobile` | Specimen screenshots `evidence/B0-buttons-web.png`, `B0-buttons-mobile.png` |
| 0.18 | **StatusChip with Lucide icons** (web + mobile; attention = `#FFFBEB`/`#B45309`, not lavender); install `lucide-react` and `lucide-react-native` | `StatusChip.tsx`, `StatusBadge.tsx` | Specimen screenshot `evidence/B0-chips.png` |
| 0.19 | **Pull-to-refresh Screen wrapper**: `onRefresh` required for list screens; remove the 7 manual Refresh buttons | `components/Screen.tsx`; `ProgressTab:281`, `WorkoutTab:328`, `NotificationsScreen:148`, `AttentionTab:133`, `CheckinsTab:51`, `ClientsTab:135`, `ActivityFeedScreen:128` | roleCheck `manual-refresh-button` passes on all mobile screens |
| 0.20 | **Honest Week logo** component (web + mobile) from `packages/brand/logo/mark.svg` | `packages/brand`, `AppShell.tsx:63–72`, `BrandMark.tsx` | Screenshot `evidence/B0-logo.png` |
| 0.21 | **Banned-strings Playwright check** for both apps, reading `docs/spec/banned-strings.json` | `e2e/banned-strings.spec.ts` (web :5173 and Expo web :8081) | Runs in CI; Batch 0 report attaches the **current** failure list (expected to fail before the screen batches) |

Demo states: `pnpm db:reset`; rahul.coach for web, plus sneha.review (role), and Rohan, Meera, Ishita, Kavya and Nikhil IDs from `09-demo-data.md`.

## Screen batches

### TW-A: Trainer web · shell, Home triage, drawers, system states

The shell (sidebar, top bar, bottom nav, logo, command palette), Home triage rows, the exception drawer (Acknowledge ≠ Resolve), Asked-coach items, and system states. Every other web screen sits inside the shell and links to the drawer.

**5 screens · 78 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TW-03 App shell and navigation | P0 | `trainer-web/TW-03-app-shell-and-navigation.md` | 16 |
| 2 | TW-04 Home triage | P0 | `trainer-web/TW-04-home-triage.md` | 22 |
| 3 | TW-05 Exception detail: acknowledge and resolve drawer | P0 | `trainer-web/TW-05-exception-detail-acknowledge-and-resolve-drawer.md` | 16 |
| 4 | TW-32 Asked-coach items (trainer) | P1 | `trainer-web/TW-32-asked-coach-items.md` | 13 |
| 5 | TW-33 System states: errors, not found, offline, empty | P0 | `trainer-web/TW-33-system-states-errors-not-found-offline.md` | 11 |

**Demo states needed:** rahul.coach, rahul.coach (Rohan = slipping, Meera = acknowledged, Ishita = push off, Sneha = intake submitted, Anita = pending invite). Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### TW-B: Trainer web · sign-in, first run, roster and invites

Entry flows: sign-in (role check, WhatsApp OTP "Coming soon"), first run, roster (rows, 390 reflow), add client, pending invitation.

**5 screens · 70 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TW-01 Sign in | P0 | `trainer-web/TW-01-sign-in.md` | 21 |
| 2 | TW-02 Trainer first-run onboarding | P1 | `trainer-web/TW-02-trainer-first-run-onboarding.md` | 11 |
| 3 | TW-06 Client roster | P1 | `trainer-web/TW-06-client-roster.md` | 15 |
| 4 | TW-07 Add client (invite) | P1 | `trainer-web/TW-07-add-client.md` | 13 |
| 5 | TW-08 Pending invitation detail | P2 | `trainer-web/TW-08-pending-invitation-detail.md` | 10 |

**Demo states needed:** rahul.coach, rahul.coach (Anita), signed out; then rahul.coach. Email codes appear at `http://127.0.0.1:8787/dev/mail`. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### TW-C: Trainer web · client workspace header, overview, intake, configure, notes

The client workspace frame: header (client WhatsApp number), overview, onboarding review, coaching configuration, note composer. Every workspace tab depends on it.

**5 screens · 67 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TW-09a Client workspace header (shared by all workspace tabs) | P0 | `trainer-web/TW-09a-client-workspace-header.md` | 16 |
| 2 | TW-09 Client overview | P0 | `trainer-web/TW-09-client-overview.md` | 15 |
| 3 | TW-10 Onboarding review | P1 | `trainer-web/TW-10-onboarding-review.md` | 11 |
| 4 | TW-11 Coaching configuration ("Configure") | P1 | `trainer-web/TW-11-coaching-configuration.md` | 13 |
| 5 | TW-34 Trainer note composer (private or visible to client) | P1 | `trainer-web/TW-34-trainer-note-composer.md` | 12 |

**Demo states needed:** rahul.coach. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### TW-D: Trainer web · plan, builders, diet scope, assign

Plan tab, workout and nutrition builders (no "Library snapshot <uuid>"), diet change scope, assign modal.

**5 screens · 67 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TW-12 Plan tab (versions, current plan, consistency) | P1 | `trainer-web/TW-12-plan-tab.md` | 15 |
| 2 | TW-13 Workout plan builder (three-pane) | P1 | `trainer-web/TW-13-workout-plan-builder.md` | 15 |
| 3 | TW-14 Nutrition plan builder | P1 | `trainer-web/TW-14-nutrition-plan-builder.md` | 13 |
| 4 | TW-15 Diet change scope (Today onward vs Today only) | P1 | `trainer-web/TW-15-diet-change-scope.md` | 9 |
| 5 | TW-16 Assign plan: date window and replacement preview | P0 | `trainer-web/TW-16-assign-plan-date-window-and-replacement.md` | 15 |

**Demo states needed:** rahul.coach. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### TW-E: Trainer web · activity, progress, check-ins

Activity, Progress, client check-ins, check-in review, the check-ins inbox (no ended clients).

**5 screens · 61 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TW-17 Activity | P1 | `trainer-web/TW-17-activity.md` | 15 |
| 2 | TW-18 Progress | P1 | `trainer-web/TW-18-progress.md` | 12 |
| 3 | TW-19 Client check-ins list | P2 | `trainer-web/TW-19-client-check-ins-list.md` | 10 |
| 4 | TW-20 Check-in review | P0 | `trainer-web/TW-20-check-in-review.md` | 13 |
| 5 | TW-22 Check-ins inbox (all clients) | P0 | `trainer-web/TW-22-check-ins-inbox.md` | 11 |

**Demo states needed:** see the screen files, section (f). Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### TW-F: Trainer web · templates, form builders, libraries

Templates hub (the label is "Templates"; fixes the envelope bug), onboarding and check-in form builders, libraries, use/fork flows. Uses the TW-D builders in template mode.

**5 screens · 57 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TW-23 Templates hub (type tabs) | P1 | `trainer-web/TW-23-templates-hub.md` | 17 |
| 2 | TW-24 Onboarding form builder | P1 | `trainer-web/TW-24-onboarding-form-builder.md` | 11 |
| 3 | TW-25 Check-in form builder | P1 | `trainer-web/TW-25-check-in-form-builder.md` | 9 |
| 4 | TW-26 Libraries (exercises, foods) | P2 | `trainer-web/TW-26-libraries.md` | 12 |
| 5 | TW-27 Template use and fork flows (modal set) | P2 | `trainer-web/TW-27-template-use-and-fork-flows.md` | 8 |

**Demo states needed:** see the screen files, section (f). Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### TW-G: Trainer web · history, settings, notifications, ended, reminders panel

History, Settings (Help = mailto), notification settings (WhatsApp "Coming soon"), ended relationships and reactivation, reminder responsiveness panel.

**5 screens · 58 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TW-21 History | P2 | `trainer-web/TW-21-history.md` | 11 |
| 2 | TW-28 Settings (More) | P1 | `trainer-web/TW-28-settings.md` | 12 |
| 3 | TW-29 Trainer notification settings | P1 | `trainer-web/TW-29-trainer-notification-settings.md` | 10 |
| 4 | TW-30 Ended relationships: end, view, reactivate | P1 | `trainer-web/TW-30-ended-relationships-end-view-reactivate.md` | 13 |
| 5 | TW-31 Reminder responsiveness panel | P1 | `trainer-web/TW-31-reminder-responsiveness-panel.md` | 12 |

**Demo states needed:** see the screen files, section (f). Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### M-1: Trainee mobile · sign-in and onboarding flow

Trainee sign-in (no WhatsApp OTP claim), invite acceptance, intake, waiting screen (role resolution), reminder setup.

**5 screens · 37 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TR-01 Sign in / account activation | P0 | `mobile/TR-01-sign-in-account-activation.md` | 9 |
| 2 | TR-02 Invite acceptance | P0 | `mobile/TR-02-invite-acceptance.md` | 7 |
| 3 | TR-03 Intake form | P1 | `mobile/TR-03-intake-form.md` | 7 |
| 4 | TR-04 Waiting for coach | P1 | `mobile/TR-04-waiting-for-coach.md` | 6 |
| 5 | TR-05 Reminder setup (onboarding step) | P0 | `mobile/TR-05-reminder-setup.md` | 8 |

**Demo states needed:** (signed out), aarav.ontrack, anita.invite (test invite token), sneha.review, vikram.onboarding. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### M-2: Trainee mobile · Today and diet logging flow

Today (date navigator, rings, workout card, pull-to-refresh), diet logging, Something different, food search, assigned meal plan.

**5 screens · 48 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TR-06 Today | P0 | `mobile/TR-06-today.md` | 15 |
| 2 | TR-07 Diet: today's meals and logging | P0 | `mobile/TR-07-diet-today-s-meals-and-logging.md` | 11 |
| 3 | TR-08 "Something different" (meal change sheet, with food logging) | P0 | `mobile/TR-08-something-different.md` | 7 |
| 4 | TR-26 Food search and quantity (logging actual foods) | P1 | `mobile/TR-26-food-search-and-quantity.md` | 9 |
| 5 | TR-09 Assigned meal plan (read-only) | P2 | `mobile/TR-09-assigned-meal-plan.md` | 6 |

**Demo states needed:** aarav.ontrack, deepak.dubai, farhan.paused, lakshmi.foods, meera.ack, rohan.slipping. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### M-3: Trainee mobile · workout flow

Workout overview, active workout, workout summary (bounded duration, no dev subtitle).

**3 screens · 24 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TR-10 Workout overview | P1 | `mobile/TR-10-workout-overview.md` | 9 |
| 2 | TR-11 Active workout | P0 | `mobile/TR-11-active-workout.md` | 9 |
| 3 | TR-12 Workout summary | P1 | `mobile/TR-12-workout-summary.md` | 6 |

**Demo states needed:** aarav.ontrack. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### M-4: Trainee mobile · progress, check-in, inbox, ask coach, deep links

Progress (no %), check-in, notifications inbox, Ask coach on WhatsApp (trainer number, text only), deep-link router.

**5 screens · 36 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TR-13 Progress | P1 | `mobile/TR-13-progress.md` | 9 |
| 2 | TR-14 Check-in | P0 | `mobile/TR-14-check-in.md` | 8 |
| 3 | TR-15 Notifications inbox | P1 | `mobile/TR-15-notifications-inbox.md` | 7 |
| 4 | TR-18 Ask coach on WhatsApp | P1 | `mobile/TR-18-ask-coach-on-whatsapp.md` | 7 |
| 5 | TR-23 Deep-link router and "item unavailable" | P0 | `mobile/TR-23-deep-link-router-and-item-unavailable.md` | 5 |

**Demo states needed:** aarav.ontrack. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### M-5: Trainee mobile · reminders, quiet hours, meal times, sync, More

Reminder settings (WhatsApp "Coming soon"), quiet hours, meal times, offline and sync status, More (Help = mailto).

**5 screens · 36 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TR-16 Reminder settings | P0 | `mobile/TR-16-reminder-settings.md` | 10 |
| 2 | TR-17 Quiet hours | P1 | `mobile/TR-17-quiet-hours.md` | 5 |
| 3 | TR-24 My meal times | P1 | `mobile/TR-24-my-meal-times.md` | 7 |
| 4 | TR-19 Offline and sync status | P0 | `mobile/TR-19-offline-and-sync-status.md` | 7 |
| 5 | TR-20 More: profile and settings | P1 | `mobile/TR-20-more-profile-and-settings.md` | 7 |

**Demo states needed:** aarav.ontrack, deepak.dubai, farhan.paused, ishita.pushoff. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### M-6: Trainee mobile · ended coaching, widget, steps

Ended coaching and reactivation, widget/Live Activity (no placeholder copy), steps (flag off).

**3 screens · 21 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TR-22 Ended coaching, reactivation and a new coach | P1 | `mobile/TR-22-ended-coaching-reactivation-and-a-new.md` | 8 |
| 2 | TR-21 Lock-screen widget and Live Activity | P2 | `mobile/TR-21-lock-screen-widget-and-live-activity.md` | 6 |
| 3 | TR-25 Steps (optional, Health Connect / HealthKit) | P1 if the spike is Go; otherwise P2, after MVP | `mobile/TR-25-steps.md` | 7 |

**Demo states needed:** aarav.ontrack, kavya.ended, nikhil.reactivate. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### M-7: Trainer mobile · attention, clients, client status, exception review, activity

Trainer mobile triage: Attention cards, clients, client status (no UUID titles), exception review (Acknowledge ≠ Resolve), activity feed (scaled kcal, no future dates).

**5 screens · 36 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TM-01 Attention (trainer mobile home) | P1 | `mobile/TM-01-attention.md` | 9 |
| 2 | TM-02 Clients (search and list) | P2 | `mobile/TM-02-clients.md` | 6 |
| 3 | TM-03 Client status | P1 | `mobile/TM-03-client-status.md` | 6 |
| 4 | TM-04 Exception review (mobile) | P1 | `mobile/TM-04-exception-review.md` | 4 |
| 5 | TM-09 Activity feed (inside the Clients tab) | P1 | `mobile/TM-09-activity-feed.md` | 11 |

**Demo states needed:** rahul.coach. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

### M-8: Trainer mobile · check-ins, review, More, role select

Trainer mobile check-ins and review, More, role select (only when both roles are present).

**4 screens · 21 acceptance checks**

| Order | Screen | Priority | File | Checks |
|---|---|---|---|---|
| 1 | TM-05 Check-ins (mobile inbox) | P2 | `mobile/TM-05-check-ins.md` | 6 |
| 2 | TM-06 Check-in review (mobile, lite) | P1 | `mobile/TM-06-check-in-review.md` | 4 |
| 3 | TM-07 More (settings, notifications, profile) | P1 | `mobile/TM-07-more.md` | 6 |
| 4 | TM-08 Role select (dual-role users) | P2 | `mobile/TM-08-role-select.md` | 5 |

**Demo states needed:** karan.dual, rahul.coach. Full routes and seed IDs are in each screen file's section (f) and in `09-demo-data.md`.

## Totals

| Track | Batches | Screens | Checks |
|---|---|---|---|
| Trainer web | TW-A…TW-G (7) | 35 | 458 |
| Trainee mobile | M-1…M-6 (6) | 26 | 202 |
| Trainer mobile | M-7…M-8 (2) | 9 | 57 |
| **All** | 15 + Batch 0 | 70 | 717 |


## Spec questions (ambiguous or contradictory guide sections: NOT resolved here)

These are listed so agents don't silently pick one side. When your batch touches one of them, follow `01-product-rules.md` where it speaks. Otherwise follow the screen file, and repeat the question in your report.

1. **Date format.** §1.6.4 `formatCivilDate` gives "Mon, 12 Oct" (with a comma), as do the TW-04 caption "Wed, 14 Oct" and checklist "Sun, 18 Oct". TR-06 ("Today · Wed 14 Oct") and the ReasonLine examples ("Mon 12 Oct") have no comma, and neither does the product rule ("Thu 15 Oct").
2. **TM-01 title.** The target large title is "Today", but the tab and screen are named "Attention" (the 18 Oct capture index flags this mismatch).
3. **TM-01 card radius** is 12 dp, while §1.6.1 says mobile cards are 20.
4. **Template-mode routes.** TW-13/TW-14 use `/templates/workout/:tid` and `/templates/nutrition/:tid`; the §1.7 route table uses `/templates/workouts/:tid` and `/templates/diets/:tid`.
5. **TR-25 Steps priority.** One place says "MVP (P1) only if the spike passes", while TR-06 and §5.2 say P2 (backlog #63: "P1 if Go, else P2"). The `steps_enabled` flag is off either way.
6. **Help mailto subject and fallback.** TR-20 uses "FitBud help · Trainee · v1.4.0 (212)", while §1.6.10 uses "FitBud support · <app> · <screen ID>". With no mail app, TR-20/TM-07 copy the address, but §1.6.10 shows a sheet with "Copy address" and "Copy details". (Screen IDs in the subject are fine because they aren't rendered UI.)
7. **Broken cross-references.** §1.1 points to a "copy catalogue (§1.9)", which doesn't exist (it's §1.6.9). TR-06 points to ring tokens in "§1.2" (they're in §1.6.1).
8. **Stale baselines.** §1.6.2 and the TR platform baseline say mobile doesn't load Satoshi, but it does (only 600 is missing on native). §1.6.1 says the tokens are already correct at #1A1248/#FF587D, but the code has #1A1249/#FF5B7D (see 00-foundations Implementation notes).
9. **TR platform prerequisites** are numbered 1–5, 7, 8, 6 (out of order). Check that none was dropped.
10. **TR-01 WhatsApp OTP copy.** "Sent to WhatsApp ••••1234 and p•••@gmail.com" and the "two channels at once" rationale lack the `wa_otp`-off caveat that TW-01 has. Product rule 3 says WhatsApp OTP shows "Coming soon".
11. **24 h times.** Quiet hours appear as "22:00–07:00" in the TR-05/TR-17 acceptance criteria and checklist TW-29, while UI copy elsewhere uses "10:00 pm – 7:00 am" and the product rule requires h:mm am/pm. (The banned-strings check treats 24 h times as a warning only.)
12. **TM-02 "Ended" filter chip** conflicts with TM-09 and the Home/attention rules that ended clients never appear in active lists.
13. **Guide file paths differ from the repo**: `pages/auth/SignInPage.tsx` is really `src/auth/SignInPage.tsx`; `AssignModal.tsx` is really `components/plan/AssignPlanModal.tsx`; `InvitationPage` is really `PendingInvitationPage.tsx`; and `src/trainee/food/FoodSearchScreen.tsx` is really `src/trainee/FoodSearchScreen.tsx`. Screen headers show the nearest real file.
14. **TW-22 views.** The route views are `due|overdue|submitted|reviewed`, but the tabs read "To review · Due · Overdue · Reviewed" (submitted = "To review"?).
15. **Open questions still open in the guide.** OQ-18 (TR-11 rest default of 90 s), OQ-21, OQ-22 and OQ-32–OQ-34.
16. **Optional items.** Backlog #61 says "optional items only on their own day", while D34 says they aren't late-loggable. These are probably consistent but worded differently.
17. **Appendix C (07-code-map.md)** was written against commit ae1cfa6. Many paths have moved since.
18. **C-15 card guidance vs rows.** Generic card guidance in the components section vs D32 rows-not-cards for web Needs attention.
19. **Honest Week four-dot logo** isn't described in the guide. It comes from QA checklist G7 and `packages/brand/logo/mark.svg`. The guide mentions only the wordmark/brand colours.
20. **Mobile role resolution.** In the Expo session, `sneha.review` landed on "Choose mode" (`/me` returned trainee+trainer), while USAGE.md saw `permittedRoles:["trainee"]` on web. TR-04 and TM-08 both depend on which is right.

## Spec decisions (18 Oct, orchestrator) — these resolve the "Spec questions" above; follow them, do not re-ask
1. Dates: "Thu 15 Oct" (no comma); with year only when not current year ("Thu 15 Oct 2025"). Times "8:10 pm" in the viewer's timezone unless the screen says client time.
2. TM-01: title matches the tab, "Attention".
3. Mobile card radius: 20 (§1.6.1 wins over per-screen 12).
4. Template routes: use the route table (`/templates/workouts/:tid`, `/templates/diets/:tid`); keep redirects from the other form.
5. TR-25 Steps: P2, stays behind `steps_enabled=false`.
6. Help mailto: use §1.6.10 subject/body; no-mail-app fallback = sheet with "Copy address" and "Copy details".
7–9, 13, 17: doc typos / stale paths — use the real repo files listed in screen headers.
8. Tokens: fix code to the guide hex (#1A1248, #FF587D). Satoshi: add the missing 600 weight on native.
10. TR-01: WhatsApp OTP is disabled ("Coming soon"); show only the email copy "Sent to n•••n@…".
11. Quiet hours and all times: 12-hour am/pm ("10:00 pm – 7:00 am").
12. TM-02 / TW-06: Ended clients never appear in the default (Current) list; an explicit "Ended" filter/segment may show them.
14. TW-22: tabs are To review · Due · Overdue · Reviewed; map routes `?tab=to-review|due|overdue|reviewed`.
15. OQ-18: rest default 90 s. OQ-21/22/32–34: out of scope for this rework, leave as is.
16. Late logging: follow D34.
18. Web Needs attention = rows (one per client); cards elsewhere per C-15.
19. Logo: Honest Week four-dot mark from `packages/brand/logo/mark.svg` everywhere (web shell, sign-in, mobile).
20. sneha.review is trainee-only: fix seed/API so she has no trainer role; trainee-only accounts must never see "Choose mode" or trainer web.

## Approved visual target (18 Oct, founder-approved)
docs/spec/mockups/ is the binding visual target (png/ + html/ + DESIGN-NOTES.md). Where a mockup and a screen file differ in layout/styling, the mockup wins; content rules (product rules, banned strings) still apply. Founder picks:
21. Navy sidebar on trainer web (02, not 02c).
22. Home heading "Today" (no greeting; 02b is rejected).
23. Keep "Recent activity" feed on Home.
24. Add a "tinted" button variant (lavender) for repeated per-row/per-card actions; still one filled primary per card/screen.
25. Retitle demo seed people to realistic names (Rohan Mehta, Aarav Shah, Rahul Verma, etc., as in mockups).
