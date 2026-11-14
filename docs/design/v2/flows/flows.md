# FitBud mobile flows (Phase C)

Personas: **Aarav Sharma** (trainee), **Karan Malhotra** (dual role, coached by Priya), **Coach Rahul Verma**. Demo date Sat 14 Nov 2026.

Nudge = push notification (decided 10 Nov). WhatsApp only for Ask Rahul and Reply on WhatsApp.

## Goal coverage

| Role | Goal | Flow |
|---|---|---|
| Trainee | First install, invite, intake, reminders | F01 |
| Trainee | Sign in / code / reset / auth errors | F02, F02b |
| Trainee | First workout, log sets, rest, PR, finish | F03, F05 |
| Trainee | Plan deviation: add set/exercise, swap, skip, note | F04 |
| Trainee | Interruptions, offline then sync | F06, F10 |
| Trainee | Diet day: as planned, changed portion, logged it myself, ate out, edit, delete, late log, locked | F07, F08, F09 |
| Trainee | Weekly check-in | F11 |
| Trainee | Progress and weight | F12 |
| Trainee | Notification deep links incl. Nudge push | F13 |
| Trainee | Ask Rahul (existing WhatsApp redirect) | F14 |
| Trainee | Settings, help, sign out | F15 |
| Trainee | Session expiry, errors, ended coaching | F16 |
| Karan (dual) | Role select and switch | F17 |
| Coach | Morning triage on Needs you + Nudge (push) | F20 |
| Coach | Resolve / mark reviewed / notes | F21 |
| Coach | Reply to a question | F22 |
| Coach | Review a check-in | F23 |
| Coach | Review a session with trainee-added sets and PRs; diet day | F24 |
| Coach | Client detail, activity | F25 |
| Coach | Ended / reactivated client | F26 |
| Coach | Offline, loading, errors | F27 |
| Coach | Settings, log in person, sign out | F28 |

## F01 · Trainee · First install: invite, intake, reminders, first Today

Sheet: `png/flows/F01.png`

1. `TR-02a-invite-accept` — Tap: Join Rahul
2. `TR-03-intake-form` — Tap: Send intake
3. `TR-04-waiting-for-coach` — Tap: Set reminders
4. `TR-05-reminder-setup` — Tap: Skip / Allow
5. `TR-06a-today-default` — System: Plan assigned → Today

## F02 · Trainee · Sign in, wrong password, code, reset

Sheet: `png/flows/F02.png`

1. `TR-01a-signin-password` — Tap: Sign in → lands on TR-06a-today-default
2. `TR-01e-signin-wrong-password` — Tap: Forgot password?
3. `TR-01b-signin-code-request` — Tap: Send code
4. `TR-01c-signin-code-entry` — System: Code typed
5. `TR-01d-set-new-password` — Tap: Save and sign in
6. `TR-06a-today-default` — System: Today

## F02b · Trainee · Auth errors: rate limit, expired code, invite expired

Sheet: `png/flows/F02b.png`

1. `TR-01f-signin-rate-limited` — Tap: Use a code → lands on TR-01b-signin-code-request
2. `TR-01g-signin-code-expired` — Tap: Send a new code
3. `TR-01c-signin-code-entry` — System: —
4. `TR-02b-invite-expired` — Tap: I have a code
5. `TR-01b-signin-code-request` — System: —

## F03 · Trainee · First workout: start, log, rest, PR, finish, summary

Sheet: `png/flows/F03.png`

1. `TR-06a-today-default` — Tap: Start workout
2. `W-02-active-start` — Tap: Tap kg cell
3. `W-04-active-keypad` — System: Log set
4. `W-05a-rest-running` — System: Rest runs
5. `W-05b-rest-ended` — System: Rest done
6. `W-03-active-mid` — System: Next set
7. `W-12-pr-moment` — System: PR set
8. `W-03b-active-end-of-list` — Tap: Finish
9. `W-16-finish-early` — Tap: Finish anyway
10. `W-17a-summary` — Tap: Save and share
11. `W-17b-summary-shared` — Tap: Done
12. `W-01c-workout-tab-done` — System: Workout tab: done

## F04 · Trainee · Plan deviation: add set, add exercise, replace, skip, edit set, note

Sheet: `png/flows/F04.png`

1. `W-03-active-mid` — Tap: Note
2. `W-10-exercise-note` — Tap: Save note → lands on W-03-active-mid
3. `W-03b-active-end-of-list` — Tap: Add exercise
4. `W-21a-add-exercise` — Tap: Add (1)
5. `W-21b-added-exercise` — System: ⋯ on an exercise
6. `W-09-exercise-menu` — Tap: Replace
7. `W-22-replace-exercise` — Tap: Replace for today → lands on W-03-active-mid
8. `W-08-swipe-set` — System: Swipe a set: Skip
9. `W-13-edit-logged-set` — System: Tap a logged set
10. `W-09b-exercise-skipped` — System: Skip exercise → Undo toast

## F05 · Trainee · Exercise detail and rest

Sheet: `png/flows/F05.png`

1. `W-03-active-mid` — Tap: Tap exercise name
2. `W-27-exercise-how-to` — System: How to
3. `W-26-exercise-history` — System: History tab
4. `W-05a-rest-running` — Tap: +15 / Skip
5. `W-05b-rest-ended` — System: Rest done

## F06 · Trainee · Interruptions: minimise, kill, pause, offline, discard

Sheet: `png/flows/F06.png`

1. `W-03-active-mid` — Tap: Minimise
2. `W-14-minimised-bar` — Tap: Resume → lands on W-03-active-mid
3. `W-18-resume-after-kill` — Tap: App reopened → Resume → lands on W-03-active-mid
4. `W-19-paused` — System: Paused banner
5. `W-20-active-offline` — System: Offline: sets saved
6. `TR-19a-sync-status` — System: Sync status
7. `W-15-discard-confirm` — Tap: Discard (confirm)

## F07 · Trainee · Diet day: as planned, changed portion, ate out

Sheet: `png/flows/F07.png`

1. `TR-07a-diet-day` — Tap: Eaten as planned
2. `TR-07b-eaten-as-planned-undo` — System: Undo toast
3. `TR-08a-something-different` — System: Something different
4. `TR-08b-changed-portion` — Tap: Changed the portion → lands on TR-07a-diet-day
5. `TR-08c-ate-out` — Tap: Ate out: exact kcal → lands on TR-07a-diet-day
6. `TR-07e-diet-over-budget` — System: Over budget

## F08 · Trainee · Diet: log it myself (search, katori/roti units)

Sheet: `png/flows/F08.png`

1. `TR-08a-something-different` — System: Log it myself
2. `TR-26a-food-search-default` — Tap: Tap a food
3. `TR-26c-food-detail-katori` — Tap: Add to evening snack
4. `TR-26b-food-search-results-added` — Tap: Save
5. `TR-07b-eaten-as-planned-undo` — System: Logged
6. `TR-26d-food-search-empty-offline` — Tap: No match → Ate out

## F09 · Trainee · Diet: edit, delete, planned meal, locked, late log

Sheet: `png/flows/F09.png`

1. `TR-07a-diet-day` — Tap: Tap logged lunch
2. `TR-07g-logged-meal-detail` — Tap: Delete this log
3. `TR-07h-delete-log-confirm` — Tap: Confirm → lands on TR-07a-diet-day
4. `TR-07j-planned-meal-detail` — System: Tap a planned meal
5. `TR-07f-diet-locked-and-missed` — System: Locked meal: no Change
6. `TR-06c-today-past-day` — Tap: Past day: Log late
7. `TR-08a-something-different` — System: Pick how

## F10 · Trainee · Offline then sync

Sheet: `png/flows/F10.png`

1. `TR-06e-today-offline` — System: Offline Today
2. `TR-07d-diet-offline` — System: Log offline
3. `TR-19a-sync-status` — Tap: Sync status
4. `TR-19b-sync-conflict` — Tap: Conflict
5. `TR-07a-diet-day` — System: Synced

## F11 · Trainee · Weekly check-in

Sheet: `png/flows/F11.png`

1. `TR-06a2-today-scrolled` — Tap: Start check-in
2. `TR-14a-checkin-questions` — Tap: Answers
3. `TR-14b-checkin-photos` — Tap: Photos
4. `TR-14c-checkin-review` — Tap: Send to Rahul
5. `TR-14d-checkin-sent` — Tap: Done
6. `TR-14e-checkin-offline-queued` — System: Offline variant
7. `TR-14f-checkin-overdue` — Tap: Overdue variant

## F12 · Trainee · Progress and weight

Sheet: `png/flows/F12.png`

1. `TR-13b-progress-empty` — Tap: Empty → Log weight
2. `TR-13c-log-weight-sheet` — Tap: Save weight
3. `TR-13a-progress-default` — Tap: Check-ins
4. `TR-13d-checkin-history` — Tap: Week 2
5. `TR-14g-checkin-reviewed` — System: Rahul’s reply
6. `TR-13e-progress-photos` — System: Progress photos

## F13 · Trainee · Notifications and deep links (incl. nudge)

Sheet: `png/flows/F13.png`

1. `TR-15c-lockscreen-push` — System: Tap nudge push
2. `TR-06h-today-inapp-banner` — System: In-app banner
3. `TR-15a-notifications-inbox` — Tap: Plan changed
4. `W-01d-plan-changed-banner` — System: Workout tab + banner
5. `TR-15a-notifications-inbox` — Tap: Check-in reply
6. `TR-14g-checkin-reviewed` — System: Read reply
7. `TR-15b-notifications-empty` — System: Empty inbox

## F14 · Trainee · Ask Rahul (WhatsApp)

Sheet: `png/flows/F14.png`

1. `W-09-exercise-menu` — Tap: Ask Rahul about this
2. `TR-18-ask-coach-sheet` — Tap: Open in WhatsApp
3. `TR-08a-something-different` — Tap: Ask about a meal
4. `TR-18-ask-coach-sheet` — System: Same sheet

## F15 · Trainee · Settings, account, help, sign out

Sheet: `png/flows/F15.png`

1. `TR-20a-more-root` — Tap: Profile
2. `TR-20b-profile-edit` — Tap: Save
3. `TR-20a-more-root` — Tap: Reminders
4. `TR-16a-reminders` — System: Toggles
5. `TR-16b-reminders-permission-off` — Tap: Push off
6. `TR-25-steps-settings` — System: Steps
7. `TR-20c-account` — Tap: Change password
8. `TR-20g-change-password` — System: Save
9. `TR-20e-help` — System: Help
10. `TR-20f-signout-unsent` — Tap: Sign out with unsent
11. `TR-19a-sync-status` — System: Send first

## F16 · Trainee · Session expiry, errors, ended coaching

Sheet: `png/flows/F16.png`

1. `TR-24-session-expired` — Tap: Sign in again → lands on TR-06a-today-default
2. `TR-01a-signin-password` — System: —
3. `TR-21-generic-error` — Tap: Generic error → lands on TR-06a-today-default
4. `TR-23-item-unavailable` — System: Item removed
5. `TR-07i-diet-load-error` — System: Load error
6. `TR-22a-ended-coaching` — System: Coaching ended
7. `TR-22b-reactivation-confirm` — Tap: Reactivated
8. `TR-06a-today-default` — System: Today

## F17 · Dual role · Karan: role select, coach ↔ client switch

Sheet: `png/flows/F17.png`

1. `TM-08a-role-select` — Tap: Continue as coach
2. `TM-01a-needs-you` — System: Coach home
3. `TM-07a-more-root` — Tap: Switch to client view
4. `TM-08c-switch-role-sheet` — Tap: Switch
5. `TR-06a-today-default` — System: Client Today
6. `TM-08d-trainee-more-switch` — Tap: More › Switch back
7. `TM-01a-needs-you` — System: Coach home
8. `TM-08b-unsupported-role` — System: Unsupported role

## F20 · Coach · Morning triage and Nudge (push)

Sheet: `png/flows/F20.png`

1. `TM-13a-trainer-lockscreen` — System: Tap push
2. `TM-01a-needs-you` — Tap: Review Rohan
3. `TM-04a-exception-review` — Tap: Nudge
4. `TM-04b-nudge-sheet` — Tap: Send nudge
5. `TM-04m-nudge-sent` — System: Nudged state
6. `TM-04c-nudge-quiet-hours` — System: Quiet hours variant
7. `TM-04n-nudge-limit` — System: Limit variant
8. `TM-04o-nudge-push-off` — System: Push-off variant

## F21 · Coach · Mark reviewed, resolve, notes

Sheet: `png/flows/F21.png`

1. `TM-04a-exception-review` — Tap: Mark reviewed
2. `TM-01c-needs-you-reviewed-undo` — System: Undo toast
3. `TM-04e-reviewed-still-open` — Tap: Resolve
4. `TM-04d-resolve-sheet` — Tap: Resolve
5. `TM-04f-resolved-readonly` — System: Resolved
6. `TM-04j-exception-menu` — Tap: ⋯ › Add note
7. `TM-04k-note-composer` — Tap: Save
8. `TM-04g-exception-not-found` — System: Already resolved

## F22 · Coach · Reply to a question

Sheet: `png/flows/F22.png`

1. `TM-13b-inapp-banner` — System: Banner: Aarav asked
2. `TM-01a-needs-you` — Tap: Reply
3. `TM-10a-ask-detail` — Tap: Reply on WhatsApp, then Mark answered
4. `TM-10b-ask-answered` — System: Answered

## F23 · Coach · Review a check-in

Sheet: `png/flows/F23.png`

1. `TM-05a-checkins-to-review` — Tap: Open Sneha
2. `TM-06a-checkin-review` — System: Compare
3. `TM-06f-photo-compare` — System: Photos full screen
4. `TM-06b-checkin-reply` — Tap: Reply + mark reviewed
5. `TM-06c-checkin-reviewed-undo` — System: Undo toast
6. `TM-05b-checkins-overdue` — Tap: Overdue → Nudge → lands on TM-04b-nudge-sheet
7. `TM-06d-checkin-started-not-sent` — Tap: Started not sent
8. `TM-06g-checkin-reviewed-readonly` — System: Past, read only
9. `TM-05e-checkins-reviewed` — System: Reviewed list

## F24 · Coach · Review a session and a diet day

Sheet: `png/flows/F24.png`

1. `TM-01a2-needs-you-scrolled` — Tap: Win: Aarav PR
2. `TM-11a-session-detail` — Tap: Sets vs plan, added by Aarav
3. `TM-04k-note-composer` — System: Note
4. `TM-11b-session-finished-early` — System: Finished early variant
5. `TM-04l-off-plan-review` — Tap: Off plan: Priya
6. `TM-12a-diet-day-review` — Tap: Diet day
7. `TM-12b-diet-meal-sheet-ate-out` — System: Ate out vs plan

## F25 · Coach · Clients, activity and client detail

Sheet: `png/flows/F25.png`

1. `TM-02a-clients-list` — Tap: Open Rohan
2. `TM-03a-client-overview` — Tap: Nudge…
3. `TM-03j-nudge-pick-item` — Tap: Pick item
4. `TM-04b-nudge-sheet` — System: Nudge sheet
5. `TM-03i-client-menu` — Tap: ⋯ › Goal, limitations
6. `TM-03f-client-info` — System: Client info
7. `TM-03b-client-overview-scrolled` — System: Scrolled
8. `TM-03c-client-other-timezone` — System: Other time zone
9. `TM-09a-activity-feed` — Tap: Activity → lands on TM-11a-session-detail
10. `TM-09d-client-picker` — System: Client filter
11. `TM-03g-client-onboarding` — System: Onboarding client

## F26 · Coach · Ended client and reactivation

Sheet: `png/flows/F26.png`

1. `TM-02c-clients-filter-ended` — Tap: Ended filter
2. `TM-03d-client-ended` — Tap: Reactivate
3. `TM-03e-reactivate-sheet` — Tap: Send invite
4. `TM-03d-client-ended` — System: Invite sent
5. `TM-04i-exception-ended` — System: Old item read only

## F27 · Coach · Offline, loading, errors

Sheet: `png/flows/F27.png`

1. `TM-01e-needs-you-loading` — System: Loading
2. `TM-01f-needs-you-offline` — System: Offline
3. `TM-02f-clients-offline` — System: Clients offline
4. `TM-04h-exception-offline` — System: Item offline
5. `TM-06e-checkin-review-offline` — System: Check-in offline
6. `TM-01g-needs-you-error` — System: Error
7. `TM-03h-client-loading-error` — System: Client error
8. `TM-01d-needs-you-all-caught-up` — System: All caught up

## F28 · Coach · Settings, in-person log, sign out

Sheet: `png/flows/F28.png`

1. `TM-07a-more-root` — Tap: Notifications
2. `TM-07b-notification-settings` — System: Toggles
3. `TM-07c-notifications-permission-off` — System: Push off
4. `TM-07d-profile` — Tap: Change password
5. `TR-20g-change-password` — System: Shared screen
6. `TM-03i-client-menu` — Tap: Log in person
7. `TM-15a-coach-logs-meal` — System: Meal for Meera
8. `TM-15b-coach-logs-workout` — System: Workout
9. `TM-07f-signout-confirm` — Tap: Sign out
10. `TR-01a-signin-password` — System: Signed out
