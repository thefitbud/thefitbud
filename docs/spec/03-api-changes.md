# 03 · API, seed and helper changes

This file has three parts. **A** lists the known bugs (all fixed in **Batch 0** before any screen batch). **B** extracts every API-NEW/API-CHG line from the guide, verbatim, by screen. **C** lists the route modules that exist. Sources: `/workspace/fitbud-rca/USAGE.md`, `RCA.md`, the QA checklist and the mobile capture index (18 Oct 2026), all checked against the repo at `7f74108`.

## A. Known bugs to fix in Batch 0 (with file:line)

| # | Bug | Where | Fix (expected behaviour) | Proven by |
|---|---|---|---|---|
| A1 | **Needs attention: the limit is applied before grouping.** `?groupBy=relationship` returns 1 group (Ishita, 20 items). Even `limit=100` gives 50 items from Ishita only. | `apps/api/src/routes/exceptions.ts:115–150` (`listAttentionExceptionsForTrainer(db, userId, limit, now)`, then the group loop) | Group by relationship **first**. `limit` counts **groups** (clients). Each group returns `itemCount`, `mostSevere`, `oldestDetectedAt` and the top items. Ordering: severity, then oldest age, then name. | API test: the seed returns Rohan, Meera (acknowledged list) and Ishita as separate groups; TW-04.2 |
| A2 | **Ended clients leak into active lists.** The check-in inbox `?view=submitted` returns 18 items, 3 each from Kavya `b9f01670…` and Nikhil `8919b5c0…`. The seed leaves 13 active exceptions on each ended relationship. | `apps/api/src/routes/checkins.ts` (`/inbox`), the attention query, the re-engage candidates and `routes/activity-feed.ts` | Filter `relationship.status = 'ended'` out of the inbox, attention, re-engage, activity feed (unless explicitly picked) and Home. The seed resolves or omits exceptions on ended relationships. | API tests; TW-22 #4; TW-04 |
| A3 | **Seed `detected_at` is date-only.** `GET /exceptions/f588…` (Meera) gives `LOCAL_DEV_ERROR "Invalid datetime" detectedAt`. | `apps/api/src/seed/demo/history.ts:338` (`addDaysFromLocalDate(refDate,-2)` for `detected_at` and `acknowledged_at`) | Write full ISO instants. Make the exception mapper (`domain/mappers.ts`) tolerate date-only values (treat them as local midnight). | API test on the Meera exception; TW-05 check |
| A4 | **Exceptions are re-detected at API start**, so the age reads "1m" and the seed holds ~108 overdue-meal items per client (466 total). | the evaluation/seed jobs | Detection is idempotent per (relationship, source entity, type). `detected_at` keeps the first detection time. The seed volume is realistic (a few per client). | TW-04 age column; API count test |
| A5 | **ISO date baked into the exception summary**: "Required meal still unlogged: Breakfast (2026-09-21)". | `packages/core/src/exception.ts:140` | Return structured `details` (meal name, `localDate`, item title) and build the `ReasonLine` on the client with the shared formatter. Old summaries must not be rendered raw. | Banned-strings check on Home/TM-01/TM-04 |
| A6 | **WhatsApp number from the trainer.** The re-engage `waMeUrl` uses `trainerProfile.whatsappE164`. The web workspace header WhatsApp uses `header.trainerWhatsappE164`. The workspace header contract has **no client number**. | `apps/api/src/domain/responsiveness.ts:183–186`; `apps/api/src/domain/workspace.ts:678`; `apps/trainer-web/src/components/workspace/WorkspaceHeader.tsx:76–77`; `packages/contracts/src/workspace.ts` | API-CHG: add `clientWhatsappE164` (nullable) to the workspace header and to re-engage candidates. Every trainer-side `wa.me` uses the **client's** number. When it's missing, the button is disabled with a tooltip. Trainee asks (TR-18) use the trainer's number. | TW-09a, TW-04 re-engage, TW-31 |
| A7 | **Web `http-api.ts` doesn't unwrap the `{data}` envelope**, so Templates shows "Could not load this list". | `apps/trainer-web/src/lib/http-api.ts:30–31` (`return parse(json)`) | `parse(json.data ?? json)`, or better, route every call through `packages/api-client`, which already unwraps. Add a unit test with a real envelope. | TW-23 check |
| A8 | **RequireAuth has no role check.** A trainee-only account is sent to `/welcome`. | `apps/trainer-web/src/layout/RequireAuth.tsx:46` | If `me.permittedRoles` doesn't include `trainer`, show the TW-01 client message ("This account is set up as a client. Open the FitBud app on your phone."). Only trainers with no display name go to `/welcome`. | TW-01.x (sneha.review) |
| A9 | **Activity feed kcal is unscaled**: "400000000 kcal" on every row. | `apps/api/src/routes/activity-feed.ts:86` (`kcal: row.kcalScaled`); seed `history.ts:208` writes `kcal_scaled 400000000` | Divide by `NUTRIENT_SCALE` (1,000,000, `packages/contracts/src/nutrition.ts:8`) and round. Audit every `*_scaled` field that reaches a contract. | TM-09 check |
| A10 | **Workout summary duration 29068 min.** | `apps/mobile/src/trainee/WorkoutSummaryScreen.tsx:25–33` (computed from `startedAt` with no bound); capture stub data | Compute from execution events minus paused time, from the server or the outbox. If the execution isn't completed, don't show a duration. Fix the capture stub so it creates a fresh execution. | TR-12 check |
| A11 | **Future-dated activity**: TM-09 items dated Mon 19 Oct (tomorrow in IST). | seed history / feed `occurredAt` conversion | Seed events at or before "now" in the trainee's timezone. The feed converts with the shared formatter. | TM-09 check |
| A12 | **Role mismatch on mobile**: sneha.review (trainee-only) lands on "Choose mode", because `/me` returned trainee+trainer in the Expo session. USAGE.md saw `permittedRoles:["trainee"]` on web. | `/me` (auth routes), `apps/mobile/src/navigation/resolveRoute.ts` | Investigate. Role select only appears when `permittedRoles` has both roles. | TR-04, TM-08 |
| A13 | **Lowercase seed names** ("ishita pushoff", "rahul coach") and raw enums (`overdue_meal`, `portion_size`, `upper_back`) in the UI. | seed `apps/api/src/seed/demo/*`; mobile `trainer/labels.ts`; web `HomePage.tsx:275` | Seed proper display names. Add `formatPersonName()` (title case, leaves "McX"/initials alone) and `packages/core/src/labels.ts` for **every** enum the API returns. | Banned-strings check |
| A14 | **Token hex off by one**: `#1A1249`/`#FF5B7D`. | `packages/tokens/src/tokens.ts:7–8` → `tokens.css` | `#1A1248`/`#FF587D`; regenerate. | Token unit test |

## Batch 0 shared-code deliverables (not bugs, but every screen batch depends on them)

- `packages/core/src/labels.ts`: a label map for every API enum (adherence, lifecycle, severity, exception type, check-in state, meal and workout states, ask topics, history kinds, body parts such as `upper_back`). Unknown values fall back to sentence-cased text with underscores removed, plus a dev-only console warning.
- `packages/core/src/format.ts`: the §1.6.4 functions plus the date rule in `01-product-rules.md` §C, `formatPersonName`, and relative times that never go negative (clamp to "just now").
- A web `Button` (`primary | secondary | tertiary | destructive`, plus `whatsapp` = neutral secondary with the glyph) and a mobile `Button` with the same variants (replacing `PrimaryButton`), an `OverflowMenu` (web ⋯ menu; mobile ⋯ bottom sheet) and a `StatusChip` with Lucide icons on both platforms, all per `00-foundations.md` §1.6.1/§1.6.3/§1.6.6.
- A mobile `Screen` wrapper where `onRefresh` is **required** for list screens, and the 7 manual "Refresh" buttons removed.
- Fonts: one Satoshi import on web; add the Satoshi 600 weight on native; mobile body text at 16.
- `e2e/banned-strings.spec.ts` (Playwright), usable on both apps. It reads `docs/spec/banned-strings.json` and scans `document.body.innerText` on each visited route.


## B. API-NEW / API-CHG items by screen (verbatim lines from each screen section)

Many items marked API-NEW in the guide were built in Stage 1. **Before wiring, confirm the endpoint in `apps/api/src/routes/<area>.ts` (or the OpenAPI document) and call it through `packages/api-client`.** If an endpoint really is missing, stop and flag it in your report; don't build UI against a fake.

### TW-01 · Sign in  (`trainer-web/TW-01-sign-in.md`)

- **Header API:** `POST /auth/session`, `GET /me`, `DELETE /auth/session`; API-NEW `POST /auth/login`, `/auth/otp/start`, `/auth/otp/verify`, `/auth/password/reset`, `/auth/password/set` (§3.1a)
- - API-NEW (§3.1a): `POST /auth/login`, `POST /auth/otp/start`, `POST /auth/otp/verify`, `POST /auth/password/reset`, `POST /auth/password/set`.

### TW-02 · Trainer first-run onboarding  (`trainer-web/TW-02-trainer-first-run-onboarding.md`)

- **Header API:** `GET /me`, `PUT /me/trainer-profile` [API-NEW: display name, WhatsApp business number, timezone], `GET /templates?scope=global`
- - API-NEW: trainer profile fields `whatsappE164` and `timezone`. Check whether `users.timezone` already exists (it does per the data model: "Timezone is stored separately") and reuse it.

### TW-03 · App shell and navigation  (`trainer-web/TW-03-app-shell-and-navigation.md`)

- - Bell data: `GET /notifications?audience=trainer` [API-CHG: the list currently serves the recipient's own notifications, so check that trainer-recipient notifications exist for check-in submitted and asked-coach. If they don't, add those types, see §4.3].

### TW-04 · Home triage  (`trainer-web/TW-04-home-triage.md`)

- **Header API:** `GET /exceptions/attention` (limit 50), `GET /subscriptions/attention`, `GET /checkins/inbox` (trainer inbox route), `GET /relationships`, `GET /invitations`, plus `GET /coach-asks?status=open` [API-NEW, see TW-32]
- - API-NEW: `GET /exceptions/attention?groupBy=relationship` would be ideal (it returns counts per client). Without it, group on the client and show "50+".
- - API-NEW for Re-engage: `GET /notifications/reengagement-candidates`, returning clients with no trainee log for 48 h or more and 3 or more consecutive unanswered reminders, from the responsiveness read model (TW-31).

### TW-05 · Exception detail: acknowledge and resolve drawer  (`trainer-web/TW-05-exception-detail-acknowledge-and-resolve-drawer.md`)

- **Header API:** `GET /exceptions/:id`, `POST /exceptions/:id/acknowledge`, `POST /exceptions/:id/resolve`, `GET/POST /exceptions/:id/interventions`, plus nudge `{activityType, activityId}`
- - API-CHG: the detail response should embed a source summary (planned item title, window, logged result). Without that, fetch the source by `domainEntityType` and id.

### TW-06 · Client roster  (`trainer-web/TW-06-client-roster.md`)

- **Header API:** `GET /clients` (repeatable `status`, `adherenceState`, `goal`, plus `q`, `cursor`, `limit` 30/50)
- - **FilterBar:** a search box, then pills for Status (Invited, Onboarding, Ready to coach, Active), Adherence (On track, Needs attention, No recent data, Not available), Goal and Renewal (Upcoming, Due, Expired). Each option shows a live count once the API supports it (API-NEW: facet counts). Selected pills are filled lavender, and a **Clear** link resets them.
- - API-NEW: the `renewal` filter and facet counts.

### TW-07 · Add client (invite)  (`trainer-web/TW-07-add-client.md`)

- **Header API:** `POST /invitations` (email, displayName, WhatsApp digits, optional `onboardingFormTemplateId`), `GET /onboarding/form-templates`
- - Losing the token: if the trainer navigates away before sharing, TW-08 offers "Create a new link" (API-NEW: re-issue the token, invalidating the old one).
- 8. **Deep links.** The invite link is `https://{appHost}/i/{token}` [API-NEW host, OQ-2]. It opens the app if installed (TR-02); otherwise a web landing page with store links that carries the token through install (deferred deep link, or manual paste as a fallback).
- - API-NEW: return an `inviteUrl` (built on the server from a configured host) instead of making the client concatenate it.

### TW-08 · Pending invitation detail  (`trainer-web/TW-08-pending-invitation-detail.md`)

- **Header API:** `GET /invitations/:invitationId`; re-issue or revoke [API-NEW]
- 11. **Implementation.** API-NEW: `POST /invitations/:id/reissue` and `POST /invitations/:id/revoke`.

### TW-09a · Client workspace header (shared by all workspace tabs)  (`trainer-web/TW-09a-client-workspace-header.md`)

- **Header API:** `GET /workspaces/relationships/:relationshipId` (header: display name, onboardingStatus, goalShort, adherenceState, traineeProfile age/gender, effective plan, renewal state)
- - API-CHG: the workspace header adds `traineeTimezone` (IANA name) and `hasCustomMealTimes` (boolean). The trainer's timezone comes from `GET /me`.

### TW-09 · Client overview  (`trainer-web/TW-09-client-overview.md`)

- **Header API:** the workspace read (overview: plan, renewal, one open exception, next check-in, ≤5 recent activity, progress summary)
- - Weekly consistency needs API-NEW `GET /workspaces/relationships/:rid/week?start=YYYY-MM-DD` returning `{workouts:{assigned,completed}, meals:{assigned,logged}, days:[{date, state}]}`, or derive it from the activity pages. A server read model is preferred so trainee and trainer always agree.

### TW-10 · Onboarding review  (`trainer-web/TW-10-onboarding-review.md`)

- **Header API:** `GET /onboarding/relationships/:rid`, `POST /onboarding/relationships/:rid/review` (outcome `coaching_ready`)
- - **"Worth noting" summary at the top:** answers to questions the template flags as `highlight` (for example injuries or medications), shown verbatim. API-NEW: a per-question `highlight` flag in the form schema. Without it, show nothing; never infer.

### TW-11 · Coaching configuration ("Configure")  (`trainer-web/TW-11-coaching-configuration.md`)

- **Header API:** `GET/PUT /configurations/relationships/:rid[/draft]`, `POST …/configure`, `POST …/activate`, `POST …/versions`; `GET/PUT /relationships/:rid/subscription`; `GET/PUT` reminder rules (notifications routes)

### TW-12 · Plan tab (versions, current plan, consistency)  (`trainer-web/TW-12-plan-tab.md`)

- **Header API:** `GET /plans/relationships/:rid[?versionStatus&effectiveFrom&effectiveTo]`, `GET …/effective`, `POST …/from-template`, `POST /plans/:planId/versions`, `PUT/POST …/publish`, preview
- - `WeekStrip` reads the weekday-to-session mapping from the version content. API-CHG: the contract (decision B) requires an explicit weekday-to-session mapping, but the current generation derives weekdays from sessions per week. That needs a content schema change (see TW-13).

### TW-13 · Workout plan builder (three-pane)  (`trainer-web/TW-13-workout-plan-builder.md`)

- **Header API:** `GET/PUT /plans/:planId/versions/:versionId`, preview, publish; `GET /libraries/exercises?q&muscleGroup&equipment&difficulty`
- - API-CHG: version content gains `schedule: { [weekday]: sessionId | 'rest' }`. Generation must use it (gap: it currently derives from frequency).

### TW-14 · Nutrition plan builder  (`trainer-web/TW-14-nutrition-plan-builder.md`)

- **Header API:** plan version get and put; `GET /libraries/foods?q`
- - API-CHG: a meal slot gains `type`, `label` and `time` (HH:MM local) as separate attributes (decision B).

### TW-15 · Diet change scope (Today onward vs Today only)  (`trainer-web/TW-15-diet-change-scope.md`)

- **Header API:** API-NEW publish option `dietChangeScope: 'today_onward' | 'today_only'`
- 11. **Implementation.** The modal step is in `PublishModal`. API-NEW: a scope parameter and a dry-run preview endpoint.

### TW-16 · Assign plan: date window and replacement preview  (`trainer-web/TW-16-assign-plan-date-window-and-replacement.md`)

- **Header API:** publish, plus `POST /workouts/…/assignments/generate` and `POST /meals/…/assignments/generate` (`fromDate`, `toDate`). API-NEW combined `POST /plans/:planId/versions/:vid/assign {window, effectiveFrom, effectiveTo?, dietChangeScope?}` with a dry-run
- 11. **Implementation.** API-NEW combined assign endpoint (preferred), so workouts and meals succeed or fail as a unit. If the endpoint isn't built yet, call publish, then both generate endpoints in sequence with idempotency keys, and surface partial failures.

### TW-17 · Activity  (`trainer-web/TW-17-activity.md`)

- **Header API:** `GET /workspaces/relationships/:rid/activity` (one activity type per page, derived state, civil date range), nudge

### TW-18 · Progress  (`trainer-web/TW-18-progress.md`)

- **Header API:** progress summary, `GET /progress/…/measurements`, entries, file download

### TW-19 · Client check-ins list  (`trainer-web/TW-19-client-check-ins-list.md`)

- **Header API:** check-in list (cursor), schedule, schedule-next

### TW-20 · Check-in review  (`trainer-web/TW-20-check-in-review.md`)

- **Header API:** get check-in, review context, `POST …/review` (acknowledged, needs follow-up, adjust coaching), notes, schedule-next
- - The review note is a `trainer_notes` row linked to the check-in (`subjectType: 'checkin'`) with `visibility` (API-CHG, see TW-34).

### TW-21 · History  (`trainer-web/TW-21-history.md`)

- **Header API:** `GET /history/relationships/:rid` (paged 30/50, kind, occurredFrom, occurredTo)

### TW-22 · Check-ins inbox (all clients)  (`trainer-web/TW-22-check-ins-inbox.md`)

- **Header API:** check-in trainer inbox

### TW-23 · Templates hub (type tabs)  (`trainer-web/TW-23-templates-hub.md`)

- **Header API:** `GET/POST /templates` (`templateType` workout, nutrition or combined), get, put (with `expectedVersion`), delete; onboarding form templates; check-in form templates (`/checkins/form-templates`); `/libraries`

### TW-24 · Onboarding form builder  (`trainer-web/TW-24-onboarding-form-builder.md`)

- **Header API:** onboarding form templates and versions
- - **Two panes.** Left: a question list with drag handles (add, choose type, reorder, duplicate, delete). Each question has a label, help text, required toggle, type-specific settings (choices with stable ids, number min, max and unit) and **Highlight for coach** (API-NEW).

### TW-25 · Check-in form builder  (`trainer-web/TW-25-check-in-form-builder.md`)

- **Header API:** `/checkins/form-templates` (route mounted in `apps/api/src/index.ts`; confirm its operations)
- 11. **Implementation.** API-CHG: the check-in definition must support the measurement and photo block types if it doesn't already. Verify against `routes/checkin-forms.ts`.

### TW-26 · Libraries (exercises, foods)  (`trainer-web/TW-26-libraries.md`)

- **Header API:** `/libraries` exercises (q, muscleGroup, equipment, difficulty), foods (q); create, update, archive
- - API-CHG: foods gain `aliases: string[]` (search-indexed).
- - API-NEW: `GET /libraries/foods/custom-logged?rid=` (custom trainee entries) and `POST /libraries/foods/:id/relink-custom` (optional, P2).

### TW-28 · Settings (More)  (`trainer-web/TW-28-settings.md`)

- **Header API:** `GET /me`; trainer profile [API-NEW, see TW-02]; `DELETE /auth/session`

### TW-29 · Trainer notification settings  (`trainer-web/TW-29-trainer-notification-settings.md`)

- **Header API:** notification preferences (`pushEnabled`, category booleans, `quietHoursStart` and `quietHoursEnd`) for the trainer user [API-CHG: trainer categories]
- 11. **Implementation.** API-CHG: add the trainer notification types `trainer_ask_coach`, `trainer_checkin_submitted`, `trainer_intake_submitted`, `trainer_critical_digest`, `trainer_renewal`, `trainer_meal_times_changed`, `admin_whatsapp_budget` to `packages/contracts/src/notification.ts`, along with category booleans.

### TW-30 · Ended relationships: end, view, reactivate  (`trainer-web/TW-30-ended-relationships-end-view-reactivate.md`)

- **Header API:** API-NEW `POST /relationships/:rid/end`, `POST /relationships/:rid/reactivate`, `POST /relationships/:rid/reactivate/confirm` (trainee); workspace read (ended)
- - API-NEW `POST /relationships/:rid/end` and `POST /relationships/:rid/reactivate` (trainer: creates a `reactivation_request` with a 14-day expiry and sends trainee push P-REACT).
- - API-NEW `POST /relationships/:rid/reactivate/confirm` (trainee).

### TW-31 · Reminder responsiveness panel  (`trainer-web/TW-31-reminder-responsiveness-panel.md`)

- **Header API:** API-NEW `GET /notifications/relationships/:rid/responsiveness?days=14`
- - API-NEW route under `/notifications`.

### TW-32 · Asked-coach items (trainer)  (`trainer-web/TW-32-asked-coach-items.md`)

- **Header API:** API-NEW `coach_asks` (see TR-18): `GET /coach-asks?status=open`, `POST /coach-asks/:id/answer {note?}`, `POST /coach-asks/:id/notes`

### TW-34 · Trainer note composer (private or visible to client)  (`trainer-web/TW-34-trainer-note-composer.md`)

- **Header API:** notes (exists); API-CHG `visibility`, `subjectType`, `subjectId`
- - API-CHG `trainer_notes`: add `visibility: 'private' | 'client'` (default `private`), `subjectType: 'relationship' | 'checkin' | 'exception' | 'meal' | 'workout' | 'coach_ask'`, `subjectId`, `sharedAt` and `seenAt`.
- - API-NEW (trainee) `GET /me/coach-notes?since=` and `POST /me/coach-notes/:id/seen`.

### TM-01 · Attention (trainer mobile home)  (`mobile/TM-01-attention.md`)

- **Header API:** `GET /exceptions/attention`, coach asks [API-NEW], check-in inbox

### TM-02 · Clients (search and list)  (`mobile/TM-02-clients.md`)

- **Header API:** `GET /clients`

### TM-03 · Client status  (`mobile/TM-03-client-status.md`)

- **Header API:** workspace read, week read model [API-NEW], responsiveness [API-NEW]

### TM-04 · Exception review (mobile)  (`mobile/TM-04-exception-review.md`)

- **Header API:** as in TW-05

### TM-09 · Activity feed (inside the Clients tab)  (`mobile/TM-09-activity-feed.md`)

- **Header API:** API-NEW `GET /activity/feed?cursor=&limit=30&types=&rid=&since=`
- - API-NEW `GET /activity/feed`, a trainer-scoped union read model over assignment state changes, `meal_time_overrides` changes, check-in submissions, coach-note seen events and late logs. It returns `{events:[{id, rid, traineeDisplayName, type, subtype, occurredAt, traineeLocalTime, summary, kcal?, link}], nextCursor}`.

### TR-01 · Sign in / account activation  (`mobile/TR-01-sign-in-account-activation.md`)

- **Header API:** API-NEW `POST /auth/login`, `/auth/otp/start`, `/auth/otp/verify`, `/auth/password/reset`, `/auth/password/set` (§3.1a)

### TR-02 · Invite acceptance  (`mobile/TR-02-invite-acceptance.md`)

- **Header API:** `POST /invitations/accept`
- - Invalid or used token: "This invite link has expired or was already used. Ask Rahul for a new one." plus *Message Rahul on WhatsApp* (when the trainer's number is known from the invite preview API-NEW).
- - API-NEW: an invite preview `GET /invitations/preview?token=` (public, rate-limited) returning the trainer display name only. No PII beyond that.
- - API-CHG: `POST /invitations/accept` accepts `{token, displayName, mobileE164?, password, otpProof}` for new accounts.

### TR-03 · Intake form  (`mobile/TR-03-intake-form.md`)

- **Header API:** `GET /onboarding/forms/current`, `PUT …/draft`, `POST …/submit`; `PUT /me/trainee-profile` (DOB, gender)

### TR-05 · Reminder setup (onboarding step)  (`mobile/TR-05-reminder-setup.md`)

- **Header API:** notification preferences (PUT), device token registration; API-NEW fields `channelPreference: 'app'|'app_and_whatsapp'`, `whatsappOptIn: {granted, at, source, textVersion}`, `preferredWorkoutTime: HH:MM|null`, `traineeTimezone` (IANA), `locale`; meal-time overrides live in TR-24
- - Persist preferences through the existing preferences `PUT`, plus the new fields (API-NEW).

### TR-06 · Today  (`mobile/TR-06-today.md`)

- **Header API:** workout and meal assignments for today, the effective plan, check-ins, week read model [API-NEW], notifications unread count
- - The week read model is API-NEW (shared with TW-09). The day read model is `GET /me/day/:date` (API-NEW: assignments, logs, totals, the loggable flag).

### TR-07 · Diet: today's meals and logging  (`mobile/TR-07-diet-today-s-meals-and-logging.md`)

- **Header API:** meal assignments list, confirm, deviate, skip; files upload target, put, confirm

### TR-08 · "Something different" (meal change sheet, with food logging)  (`mobile/TR-08-something-different.md`)

- **Header API:** meal deviate (API-CHG: kind `logged_foods` with `items[]`); trainee food search (API-NEW)
- - API-CHG: add the deviation kind `logged_foods` with `items: [{foodId|null, customName?, servingId|null, unit, quantity, grams|null, kcal|null, protein|null, carbs|null, fat|null}]` and the computed `totals` (server recomputes from `foodId` and serving; client values are only for offline display).

### TR-09 · Assigned meal plan (read-only)  (`mobile/TR-09-assigned-meal-plan.md`)

- **Header API:** the effective plan (nutrition content)
- 7. **Edge cases.** The diff is computed against the previous effective version (API-NEW `GET /plans/:planId/versions/:vid/diff`, or a client-side diff of the content).

### TR-10 · Workout overview  (`mobile/TR-10-workout-overview.md`)

- **Header API:** workout assignments, get assignment, start, skip

### TR-11 · Active workout  (`mobile/TR-11-active-workout.md`)

- **Header API:** complete set, skip set, pause, resume, complete session, get execution
- - Previous values: from the local execution history (last execution of the same exercise), API-NEW if it isn't synced.

### TR-13 · Progress  (`mobile/TR-13-progress.md`)

- **Header API:** progress summary, measurements, entries, files

### TR-14 · Check-in  (`mobile/TR-14-check-in.md`)

- **Header API:** ensure-due, draft, submit, get check-in (pinned form version)

### TR-15 · Notifications inbox  (`mobile/TR-15-notifications-inbox.md`)

- **Header API:** notifications list, mark read

### TR-16 · Reminder settings  (`mobile/TR-16-reminder-settings.md`)

- **Header API:** notification preferences (`pushEnabled`, 4 category booleans, quiet hours) + API-NEW fields from TR-05

### TR-17 · Quiet hours  (`mobile/TR-17-quiet-hours.md`)

- **Header API:** `quietHoursStart` and `quietHoursEnd` (HH:MM)
- 11. **Implementation.** API-CHG in `apps/api/src/domain/reminders.ts`: the quiet-hours behaviour per type. Expire meal, workout and summary reminders. Defer check-in and plan reminders to quiet-hours end.

### TR-18 · Ask coach on WhatsApp  (`mobile/TR-18-ask-coach-on-whatsapp.md`)

- **Header API:** API-NEW `POST /coach-asks {relationshipId, itemType, itemId, topic}` (outbox-capable), the trainer WhatsApp number on the relationship read (API-NEW)

### TR-19 · Offline and sync status  (`mobile/TR-19-offline-and-sync-status.md`)

- **Header API:** `POST /sync/push`, `GET /sync/pull`

### TR-22 · Ended coaching, reactivation and a new coach  (`mobile/TR-22-ended-coaching-reactivation-and-a-new.md`)

- **Header API:** relationship read; API-NEW `POST /relationships/:rid/reactivate/confirm`

### TR-23 · Deep-link router and "item unavailable"  (`mobile/TR-23-deep-link-router-and-item-unavailable.md`)

- **Header API:** API-NEW `GET /links/resolve?kind=&id=` returning `{role, route, available, reason?}`

### TR-24 · My meal times  (`mobile/TR-24-my-meal-times.md`)

- **Header API:** API-NEW `GET/PUT /me/meal-times` (per relationship and slot key)
- - API-NEW table `meal_time_overrides` (relationship_id, slot_key, day_pattern|null, time HH:MM, updated_at) and a history kind `meal_times_changed`.

### TR-25 · Steps (optional, Health Connect / HealthKit)  (`mobile/TR-25-steps.md`)

- **Header API:** none (on-device only, never sent to FitBud, never shared with the trainer)

### TR-26 · Food search and quantity (logging actual foods)  (`mobile/TR-26-food-search-and-quantity.md`)

- **Header API:** API-NEW `GET /me/foods/search?q=&limit=20`, `GET /me/foods/recent`, `GET /me/foods/index?since=` (delta for offline), deviate `kind: logged_foods`
- - API-NEW trainee-scoped food endpoints return global foods plus the active trainer's foods (read-only) plus the trainee's custom foods.
- - API-NEW `trainee_custom_foods` (id, trainee_user_id, name, quantity_text, kcal|null, created_at).


## C. Route modules present at 7f74108

`activity-feed.ts`, `auth-login.ts`, `auth.ts`, `checkin-forms.ts`, `checkins.ts`, `clients.ts`, `coach-asks.ts`, `config.ts`, `configurations.ts`, `dev.ts`, `exceptions.ts`, `files.ts`, `history.ts`, `invitations.ts`, `libraries.ts`, `links.ts`, `me-coach-notes.ts`, `me-day.ts`, `me-foods.ts`, `me-meal-times.ts`, `me-steps.ts`, `meals.ts`, `notifications.ts`, `onboarding-templates.ts`, `onboarding.ts`, `plans.ts`, `progress.ts`, `realtime.ts`, `relationships.ts`, `subscriptions.ts`, `sync.ts`, `templates.ts`, `webhooks-whatsapp.ts`, `workouts.ts`, `workspaces.ts`
