# Screen profile — FitBud mobile

Total mobile screens: **180** (trainee 103, trainer 77). Flows: 27. Screens used by at least one flow: 158; reachable-only via tap map (variant/state screens): 22.

Reference for Fable refinement, then Claude implementation. HTML source: `html/<side>/<id>.html`; scripts in `src/`.

## Trainee

| Screen | Area | PNG | Purpose | Flows |
|---|---|---|---|---|
| `TR-01a-signin-password` | onboarding | `png/trainee/TR-01a-signin-password.png` | Sign in with password (default) | F02, F16, F28 |
| `TR-01b-signin-code-request` | onboarding | `png/trainee/TR-01b-signin-code-request.png` | Sign in with a code: email | F02, F02b |
| `TR-01c-signin-code-entry` | onboarding | `png/trainee/TR-01c-signin-code-entry.png` | Code entry, typing | F02, F02b |
| `TR-01d-set-new-password` | onboarding | `png/trainee/TR-01d-set-new-password.png` | Forgot password → set a new password | F02 |
| `TR-01e-signin-wrong-password` | onboarding | `png/trainee/TR-01e-signin-wrong-password.png` | Auth error: wrong credentials, inline | F02 |
| `TR-01f-signin-rate-limited` | onboarding | `png/trainee/TR-01f-signin-rate-limited.png` | Auth error: too many attempts | F02b |
| `TR-01g-signin-code-expired` | onboarding | `png/trainee/TR-01g-signin-code-expired.png` | Auth error: code expired | F02b |
| `TR-02a-invite-accept` | onboarding | `png/trainee/TR-02a-invite-accept.png` | Invite acceptance, new account | F01 |
| `TR-02b-invite-expired` | onboarding | `png/trainee/TR-02b-invite-expired.png` | Invite expired or already used | F02b |
| `TR-03-intake-form` | onboarding | `png/trainee/TR-03-intake-form.png` | Intake form, step 2 of 5 | F01 |
| `TR-04-waiting-for-coach` | onboarding | `png/trainee/TR-04-waiting-for-coach.png` | Waiting for coach to set up the plan | F01 |
| `TR-05-reminder-setup` | onboarding | `png/trainee/TR-05-reminder-setup.png` | Reminder setup, onboarding step | F01 |
| `TR-06a-today-default` | today | `png/trainee/TR-06a-today-default.png` | Today, default: glance + workout + up next | F01, F02, F03, F16, F17 |
| `TR-06a2-today-scrolled` | today | `png/trainee/TR-06a2-today-scrolled.png` | Today, scrolled: coach note, check-in due, steps | F11 |
| `TR-06b-today-rest-day` | today | `png/trainee/TR-06b-today-rest-day.png` | Rest day | — (state/variant) |
| `TR-06c-today-past-day` | today | `png/trainee/TR-06c-today-past-day.png` | Past day, read-only plus late log | F09 |
| `TR-06d-today-future-day` | today | `png/trainee/TR-06d-today-future-day.png` | Future day preview (plan only) | — (state/variant) |
| `TR-06e-today-offline` | today | `png/trainee/TR-06e-today-offline.png` | Offline, cached, with sync chip | F10 |
| `TR-06f-today-loading` | today | `png/trainee/TR-06f-today-loading.png` | Loading skeleton | — (state/variant) |
| `TR-06g-today-refresh-error` | today | `png/trainee/TR-06g-today-refresh-error.png` | Inline refresh error, last good day kept | — (state/variant) |
| `TR-06h-today-inapp-banner` | today | `png/trainee/TR-06h-today-inapp-banner.png` | In-app banner over Today (coach note) | F13 |
| `TR-07a-diet-day` | diet | `png/trainee/TR-07a-diet-day.png` | Diet day: ring kept, collapsed meal cards | F07, F09, F10 |
| `TR-07b-eaten-as-planned-undo` | diet | `png/trainee/TR-07b-eaten-as-planned-undo.png` | Eaten as planned, with Undo | F07, F08 |
| `TR-07c-diet-no-meals-planned` | diet | `png/trainee/TR-07c-diet-no-meals-planned.png` | No meals planned today | — (state/variant) |
| `TR-07d-diet-offline` | diet | `png/trainee/TR-07d-diet-offline.png` | Offline: logs saved on phone | F10 |
| `TR-07e-diet-over-budget` | diet | `png/trainee/TR-07e-diet-over-budget.png` | Over the day’s calories | F07 |
| `TR-07f-diet-locked-and-missed` | diet | `png/trainee/TR-07f-diet-locked-and-missed.png` | Locked meal and an unlogged earlier meal | F09 |
| `TR-07g-logged-meal-detail` | diet | `png/trainee/TR-07g-logged-meal-detail.png` | Logged meal: edit or delete | F09 |
| `TR-07h-delete-log-confirm` | diet | `png/trainee/TR-07h-delete-log-confirm.png` | Delete a meal log confirm | F09 |
| `TR-07i-diet-load-error` | diet | `png/trainee/TR-07i-diet-load-error.png` | Diet couldn’t load (no cache) | F16 |
| `TR-07j-planned-meal-detail` | diet | `png/trainee/TR-07j-planned-meal-detail.png` | Planned meal detail (tap a meal not yet logged) | F09 |
| `TR-08a-something-different` | diet | `png/trainee/TR-08a-something-different.png` | Something different: choices | F07, F08, F09, F14 |
| `TR-08b-changed-portion` | diet | `png/trainee/TR-08b-changed-portion.png` | Changed the portion (katori, roti) | F07 |
| `TR-08c-ate-out` | diet | `png/trainee/TR-08c-ate-out.png` | Ate out: exact kcal only | F07 |
| `TR-10a-workout-rest-day` | workout | `png/trainee/TR-10a-workout-rest-day.png` | Workout tab, rest day | — (state/variant) |
| `TR-10b-workout-no-plan` | workout | `png/trainee/TR-10b-workout-no-plan.png` | Workout tab, no plan yet | — (state/variant) |
| `TR-10c-workout-missed-banner` | workout | `png/trainee/TR-10c-workout-missed-banner.png` | Missed earlier session, late-log banner | — (state/variant) |
| `TR-13a-progress-default` | progress | `png/trainee/TR-13a-progress-default.png` | Progress: weight trend, totals, history | F12 |
| `TR-13b-progress-empty` | progress | `png/trainee/TR-13b-progress-empty.png` | Progress before any data | F12 |
| `TR-13c-log-weight-sheet` | progress | `png/trainee/TR-13c-log-weight-sheet.png` | Log weight sheet (Progress only) | F12 |
| `TR-13d-checkin-history` | progress | `png/trainee/TR-13d-checkin-history.png` | Check-in history (from Progress) | F12 |
| `TR-13e-progress-photos` | progress | `png/trainee/TR-13e-progress-photos.png` | Progress photos by week (read only; added in check-ins) | F12 |
| `TR-14a-checkin-questions` | checkin | `png/trainee/TR-14a-checkin-questions.png` | Check-in step 1: questions | F11 |
| `TR-14b-checkin-photos` | checkin | `png/trainee/TR-14b-checkin-photos.png` | Check-in step 2: photos (optional) | F11 |
| `TR-14c-checkin-review` | checkin | `png/trainee/TR-14c-checkin-review.png` | Check-in step 3: review and send | F11 |
| `TR-14d-checkin-sent` | checkin | `png/trainee/TR-14d-checkin-sent.png` | Check-in sent | F11 |
| `TR-14e-checkin-offline-queued` | checkin | `png/trainee/TR-14e-checkin-offline-queued.png` | Check-in saved offline, sends later | F11 |
| `TR-14f-checkin-overdue` | checkin | `png/trainee/TR-14f-checkin-overdue.png` | Check-in overdue on Today | F11 |
| `TR-14g-checkin-reviewed` | checkin | `png/trainee/TR-14g-checkin-reviewed.png` | Past check-in, reviewed by Rahul (read only) | F12, F13 |
| `TR-15a-notifications-inbox` | notifications | `png/trainee/TR-15a-notifications-inbox.png` | Notifications inbox | F13 |
| `TR-15b-notifications-empty` | notifications | `png/trainee/TR-15b-notifications-empty.png` | Notifications empty | F13 |
| `TR-15c-lockscreen-push` | notifications | `png/trainee/TR-15c-lockscreen-push.png` | Lock-screen push | F13 |
| `TR-16a-reminders` | more | `png/trainee/TR-16a-reminders.png` | Reminder settings | F15 |
| `TR-16b-reminders-permission-off` | more | `png/trainee/TR-16b-reminders-permission-off.png` | Reminders: phone notifications off | F15 |
| `TR-18-ask-coach-sheet` | system | `png/trainee/TR-18-ask-coach-sheet.png` | Ask Rahul sheet (from meal or exercise ⋯) | F14 |
| `TR-19a-sync-status` | system | `png/trainee/TR-19a-sync-status.png` | Sync status sheet | F06, F10, F15 |
| `TR-19b-sync-conflict` | system | `png/trainee/TR-19b-sync-conflict.png` | Sync conflict: Rahul changed the plan meanwhile | F10 |
| `TR-20a-more-root` | more | `png/trainee/TR-20a-more-root.png` | More | F15 |
| `TR-20b-profile-edit` | more | `png/trainee/TR-20b-profile-edit.png` | Profile edit | F15 |
| `TR-20c-account` | more | `png/trainee/TR-20c-account.png` | Account | F15 |
| `TR-20d-delete-account-confirm` | more | `png/trainee/TR-20d-delete-account-confirm.png` | Delete account confirm | — (state/variant) |
| `TR-20e-help` | more | `png/trainee/TR-20e-help.png` | Help | F15 |
| `TR-20f-signout-unsent` | more | `png/trainee/TR-20f-signout-unsent.png` | Sign out with unsent items | F15 |
| `TR-20g-change-password` | more | `png/trainee/TR-20g-change-password.png` | Change password (shared: trainee and coach) | F15, F28 |
| `TR-21-generic-error` | system | `png/trainee/TR-21-generic-error.png` | Something went wrong / link not found | F16 |
| `TR-22a-ended-coaching` | onboarding | `png/trainee/TR-22a-ended-coaching.png` | Ended coaching: Today, history kept | F16 |
| `TR-22b-reactivation-confirm` | onboarding | `png/trainee/TR-22b-reactivation-confirm.png` | Reactivation request while coached by someone else | F16 |
| `TR-23-item-unavailable` | system | `png/trainee/TR-23-item-unavailable.png` | Item no longer available | F16 |
| `TR-24-session-expired` | system | `png/trainee/TR-24-session-expired.png` | Session expired | F16 |
| `TR-25-steps-settings` | more | `png/trainee/TR-25-steps-settings.png` | Steps source | F15 |
| `TR-26a-food-search-default` | diet | `png/trainee/TR-26a-food-search-default.png` | Food search before typing: from your plan, then recent | F08 |
| `TR-26b-food-search-results-added` | diet | `png/trainee/TR-26b-food-search-results-added.png` | Search results with instant add and the log tray | F08 |
| `TR-26c-food-detail-katori` | diet | `png/trainee/TR-26c-food-detail-katori.png` | Food detail: amount in katori | F08 |
| `TR-26d-food-search-empty-offline` | diet | `png/trainee/TR-26d-food-search-empty-offline.png` | Food search: no match, offline index | F08 |
| `W-01a-workout-tab-not-started` | workout | `png/trainee/W-01a-workout-tab-not-started.png` | Workout tab, not started | — (state/variant) |
| `W-01b-workout-tab-in-progress` | workout | `png/trainee/W-01b-workout-tab-in-progress.png` | Workout tab, in progress | — (state/variant) |
| `W-01c-workout-tab-done` | workout | `png/trainee/W-01c-workout-tab-done.png` | Workout tab, done | F03 |
| `W-01d-plan-changed-banner` | workout | `png/trainee/W-01d-plan-changed-banner.png` | Plan changed by Rahul (deep link lands on Workout) | F13 |
| `W-02-active-start` | workout | `png/trainee/W-02-active-start.png` | Active log, start of session | F03 |
| `W-03-active-mid` | workout | `png/trainee/W-03-active-mid.png` | Active log, mid-session | F03, F04, F05, F06 |
| `W-03b-active-end-of-list` | workout | `png/trainee/W-03b-active-end-of-list.png` | Active log, end of list: add exercise, discard | F03, F04 |
| `W-04-active-keypad` | workout | `png/trainee/W-04-active-keypad.png` | Compact set keypad, editing kg | F03 |
| `W-05a-rest-running` | workout | `png/trainee/W-05a-rest-running.png` | Rest running, slim bar | F03, F05 |
| `W-05b-rest-ended` | workout | `png/trainee/W-05b-rest-ended.png` | Rest ended | F03, F05 |
| `W-08-swipe-set` | workout | `png/trainee/W-08-swipe-set.png` | Swipe a set: Skip or Delete | F04 |
| `W-09-exercise-menu` | workout | `png/trainee/W-09-exercise-menu.png` | Exercise ⋯ menu | F04, F14 |
| `W-09b-exercise-skipped` | workout | `png/trainee/W-09b-exercise-skipped.png` | Exercise skipped, with Undo | F04 |
| `W-10-exercise-note` | workout | `png/trainee/W-10-exercise-note.png` | Exercise note sheet (Rahul sees it) | F04 |
| `W-12-pr-moment` | workout | `png/trainee/W-12-pr-moment.png` | Live PR moment | F03 |
| `W-13-edit-logged-set` | workout | `png/trainee/W-13-edit-logged-set.png` | Tap a logged set: edit, undo or delete | F04 |
| `W-14-minimised-bar` | workout | `png/trainee/W-14-minimised-bar.png` | Minimised workout bar above the tab bar (on Diet) | F06 |
| `W-15-discard-confirm` | workout | `png/trainee/W-15-discard-confirm.png` | Discard workout confirm | F06 |
| `W-16-finish-early` | workout | `png/trainee/W-16-finish-early.png` | Finish early: what is not logged | F03 |
| `W-17a-summary` | workout | `png/trainee/W-17a-summary.png` | Workout summary before saving | F03 |
| `W-17b-summary-shared` | workout | `png/trainee/W-17b-summary-shared.png` | Summary saved and shared with coach | F03 |
| `W-18-resume-after-kill` | workout | `png/trainee/W-18-resume-after-kill.png` | Resume after the app was closed | F06 |
| `W-19-paused` | workout | `png/trainee/W-19-paused.png` | Paused session | F06 |
| `W-20-active-offline` | workout | `png/trainee/W-20-active-offline.png` | Active log, offline | F06 |
| `W-21a-add-exercise` | workout | `png/trainee/W-21a-add-exercise.png` | Add exercise, Rahul’s picks first | F04 |
| `W-21b-added-exercise` | workout | `png/trainee/W-21b-added-exercise.png` | Added exercise in the log | F04 |
| `W-22-replace-exercise` | workout | `png/trainee/W-22-replace-exercise.png` | Replace exercise: coach alternatives first | F04 |
| `W-26-exercise-history` | workout | `png/trainee/W-26-exercise-history.png` | Exercise detail, History | F05 |
| `W-27-exercise-how-to` | workout | `png/trainee/W-27-exercise-how-to.png` | Exercise detail, How to | F05 |

## Trainer

| Screen | Area | PNG | Purpose | Flows |
|---|---|---|---|---|
| `TM-01a-needs-you` | needsyou | `png/trainer/TM-01a-needs-you.png` | Needs you: four-group summary, then groups by reason | F17, F20, F22 |
| `TM-01a2-needs-you-scrolled` | needsyou | `png/trainer/TM-01a2-needs-you-scrolled.png` | Needs you scrolled: check-ins, off plan, wins, reviewed | F24 |
| `TM-01b-needs-you-swipe` | needsyou | `png/trainer/TM-01b-needs-you-swipe.png` | Swipe left: Nudge, More (Mark reviewed is swipe right) | — (state/variant) |
| `TM-01c-needs-you-reviewed-undo` | needsyou | `png/trainer/TM-01c-needs-you-reviewed-undo.png` | Marked reviewed, with Undo | F21 |
| `TM-01d-needs-you-all-caught-up` | needsyou | `png/trainer/TM-01d-needs-you-all-caught-up.png` | Empty: all caught up | F27 |
| `TM-01e-needs-you-loading` | needsyou | `png/trainer/TM-01e-needs-you-loading.png` | Loading skeleton (counts never flash 0) | F27 |
| `TM-01f-needs-you-offline` | needsyou | `png/trainer/TM-01f-needs-you-offline.png` | Offline: cached at 9:40 am, actions disabled | F27 |
| `TM-01g-needs-you-error` | needsyou | `png/trainer/TM-01g-needs-you-error.png` | Couldn’t load, Retry | F27 |
| `TM-02a-clients-list` | clients | `png/trainer/TM-02a-clients-list.png` | Clients: roster counts, filters, rows with status chips | F25 |
| `TM-02b-clients-search` | clients | `png/trainer/TM-02b-clients-search.png` | Search typing | — (state/variant) |
| `TM-02c-clients-filter-ended` | clients | `png/trainer/TM-02c-clients-filter-ended.png` | Filter: ended clients (read only) | F26 |
| `TM-02d-clients-filter-invites` | clients | `png/trainer/TM-02d-clients-filter-invites.png` | Filter: pending invite | — (state/variant) |
| `TM-02e-clients-empty` | clients | `png/trainer/TM-02e-clients-empty.png` | No clients yet | — (state/variant) |
| `TM-02f-clients-offline` | clients | `png/trainer/TM-02f-clients-offline.png` | Clients offline (cached) | F27 |
| `TM-02g-clients-loading` | clients | `png/trainer/TM-02g-clients-loading.png` | Clients loading | — (state/variant) |
| `TM-03a-client-overview` | client | `png/trainer/TM-03a-client-overview.png` | Client overview: Rohan (needs attention) | F25 |
| `TM-03b-client-overview-scrolled` | client | `png/trainer/TM-03b-client-overview-scrolled.png` | Client overview scrolled: activity, reminders, notes, profile | F25 |
| `TM-03c-client-other-timezone` | client | `png/trainer/TM-03c-client-other-timezone.png` | Client in another time zone (Deepak, Dubai) | F25 |
| `TM-03d-client-ended` | client | `png/trainer/TM-03d-client-ended.png` | Ended client: read only, Reactivate | F26 |
| `TM-03e-reactivate-sheet` | client | `png/trainer/TM-03e-reactivate-sheet.png` | Reactivate confirm sheet | F26 |
| `TM-03f-client-info` | client | `png/trainer/TM-03f-client-info.png` | Client info: goal, intake, limitations | F25 |
| `TM-03g-client-onboarding` | client | `png/trainer/TM-03g-client-onboarding.png` | Onboarding not finished (Vikram) | F25 |
| `TM-03h-client-loading-error` | client | `png/trainer/TM-03h-client-loading-error.png` | Client page couldn’t load | F27 |
| `TM-03i-client-menu` | client | `png/trainer/TM-03i-client-menu.png` | Client ⋯ menu | F25, F28 |
| `TM-03j-nudge-pick-item` | client | `png/trainer/TM-03j-nudge-pick-item.png` | Nudge…: pick what the nudge is about | F25 |
| `TM-04a-exception-review` | review | `png/trainer/TM-04a-exception-review.png` | Exception review: Rohan missed 2 workouts | F20, F21 |
| `TM-04b-nudge-sheet` | review | `png/trainer/TM-04b-nudge-sheet.png` | Nudge sheet: push notification preview | F20, F25 |
| `TM-04c-nudge-quiet-hours` | review | `png/trainer/TM-04c-nudge-quiet-hours.png` | Nudge during Rohan’s quiet hours | F20 |
| `TM-04d-resolve-sheet` | review | `png/trainer/TM-04d-resolve-sheet.png` | Resolve sheet: outcome, private note, lock helper | F21 |
| `TM-04e-reviewed-still-open` | review | `png/trainer/TM-04e-reviewed-still-open.png` | Reviewed, still open: Resolve becomes primary | F21 |
| `TM-04f-resolved-readonly` | review | `png/trainer/TM-04f-resolved-readonly.png` | Resolved: read only | F21 |
| `TM-04g-exception-not-found` | review | `png/trainer/TM-04g-exception-not-found.png` | Already resolved elsewhere / not found | F21 |
| `TM-04h-exception-offline` | review | `png/trainer/TM-04h-exception-offline.png` | Exception review offline: actions disabled | F27 |
| `TM-04i-exception-ended` | review | `png/trainer/TM-04i-exception-ended.png` | Client ended: read only | F26 |
| `TM-04j-exception-menu` | review | `png/trainer/TM-04j-exception-menu.png` | ⋯ menu: Add note, WhatsApp, profile | F21 |
| `TM-04k-note-composer` | review | `png/trainer/TM-04k-note-composer.png` | Note composer: shared or private | F21, F24 |
| `TM-04l-off-plan-review` | review | `png/trainer/TM-04l-off-plan-review.png` | Off plan review: Priya over calories | F24 |
| `TM-04m-nudge-sent` | review | `png/trainer/TM-04m-nudge-sent.png` | Nudge sent: state on the item, with toast | F20 |
| `TM-04n-nudge-limit` | review | `png/trainer/TM-04n-nudge-limit.png` | Nudge limit: already nudged today | F20 |
| `TM-04o-nudge-push-off` | review | `png/trainer/TM-04o-nudge-push-off.png` | Nudge when the client has push turned off | F20 |
| `TM-05a-checkins-to-review` | checkins | `png/trainer/TM-05a-checkins-to-review.png` | Check-ins: to review | F23 |
| `TM-05b-checkins-overdue` | checkins | `png/trainer/TM-05b-checkins-overdue.png` | Check-ins: overdue, Nudge inline | F23 |
| `TM-05c-checkins-empty` | checkins | `png/trainer/TM-05c-checkins-empty.png` | Check-ins: nothing to review | — (state/variant) |
| `TM-05d-checkins-loading` | checkins | `png/trainer/TM-05d-checkins-loading.png` | Check-ins loading | — (state/variant) |
| `TM-05e-checkins-reviewed` | checkins | `png/trainer/TM-05e-checkins-reviewed.png` | Check-ins: reviewed (last 30 days) | F23 |
| `TM-06a-checkin-review` | checkins | `png/trainer/TM-06a-checkin-review.png` | Check-in review: this vs last week, photos | F23 |
| `TM-06b-checkin-reply` | checkins | `png/trainer/TM-06b-checkin-reply.png` | Reply composer (visible to client), marks reviewed | F23 |
| `TM-06c-checkin-reviewed-undo` | checkins | `png/trainer/TM-06c-checkin-reviewed-undo.png` | Back in the inbox after review, with Undo | F23 |
| `TM-06d-checkin-started-not-sent` | checkins | `png/trainer/TM-06d-checkin-started-not-sent.png` | Started but not sent: Nudge | F23 |
| `TM-06e-checkin-review-offline` | checkins | `png/trainer/TM-06e-checkin-review-offline.png` | Check-in review offline: read cached, actions off | F27 |
| `TM-06f-photo-compare` | checkins | `png/trainer/TM-06f-photo-compare.png` | Check-in photo compare (full screen) | F23 |
| `TM-06g-checkin-reviewed-readonly` | checkins | `png/trainer/TM-06g-checkin-reviewed-readonly.png` | Reviewed check-in (read only, with your reply) | F23 |
| `TM-07a-more-root` | more | `png/trainer/TM-07a-more-root.png` | More (dual-role account shows Switch) | F17, F28 |
| `TM-07b-notification-settings` | more | `png/trainer/TM-07b-notification-settings.png` | Trainer notification settings | F28 |
| `TM-07c-notifications-permission-off` | more | `png/trainer/TM-07c-notifications-permission-off.png` | Notifications off at OS level | F28 |
| `TM-07d-profile` | more | `png/trainer/TM-07d-profile.png` | Trainer profile | F28 |
| `TM-07e-help-sheet` | more | `png/trainer/TM-07e-help-sheet.png` | Help sheet | — (state/variant) |
| `TM-07f-signout-confirm` | more | `png/trainer/TM-07f-signout-confirm.png` | Sign out confirm | F28 |
| `TM-07g-more-offline` | more | `png/trainer/TM-07g-more-offline.png` | More offline | — (state/variant) |
| `TM-08a-role-select` | more | `png/trainer/TM-08a-role-select.png` | Role select after sign-in (karan.dual) | F17 |
| `TM-08b-unsupported-role` | more | `png/trainer/TM-08b-unsupported-role.png` | Account can’t use the app yet | F17 |
| `TM-08c-switch-role-sheet` | more | `png/trainer/TM-08c-switch-role-sheet.png` | Switch to client view (from coach More) | F17 |
| `TM-08d-trainee-more-switch` | more | `png/trainer/TM-08d-trainee-more-switch.png` | Client view More: Switch to coach view | F17 |
| `TM-09a-activity-feed` | clients | `png/trainer/TM-09a-activity-feed.png` | Activity: grouped by day, filter chips | F25 |
| `TM-09b-activity-meal-sheet` | clients | `png/trainer/TM-09b-activity-meal-sheet.png` | Activity row → meal planned vs actual sheet | — (state/variant) |
| `TM-09c-activity-filtered-empty` | clients | `png/trainer/TM-09c-activity-filtered-empty.png` | Activity filtered empty | — (state/variant) |
| `TM-09d-client-picker` | clients | `png/trainer/TM-09d-client-picker.png` | Activity: client picker sheet | F25 |
| `TM-10a-ask-detail` | review | `png/trainer/TM-10a-ask-detail.png` | Asked you: question with context and pain caution | F22 |
| `TM-10b-ask-answered` | review | `png/trainer/TM-10b-ask-answered.png` | Asked you: answered (read only) | F22 |
| `TM-11a-session-detail` | client | `png/trainer/TM-11a-session-detail.png` | Trainee workout: sets vs plan, PR, trainee-added work | F24 |
| `TM-11b-session-finished-early` | client | `png/trainer/TM-11b-session-finished-early.png` | Finished early, sets skipped (Rohan) | F24 |
| `TM-12a-diet-day-review` | client | `png/trainer/TM-12a-diet-day-review.png` | Trainee diet day: planned vs actual per meal | F24 |
| `TM-12b-diet-meal-sheet-ate-out` | client | `png/trainer/TM-12b-diet-meal-sheet-ate-out.png` | Meal detail sheet: ate out vs plan | F24 |
| `TM-13a-trainer-lockscreen` | notifications | `png/trainer/TM-13a-trainer-lockscreen.png` | Trainer pushes on the lock screen | F20 |
| `TM-13b-inapp-banner` | notifications | `png/trainer/TM-13b-inapp-banner.png` | In-app banner while on Clients | F22 |
| `TM-15a-coach-logs-meal` | client | `png/trainer/TM-15a-coach-logs-meal.png` | Coach logs a meal for a client (in person) | F28 |
| `TM-15b-coach-logs-workout` | client | `png/trainer/TM-15b-coach-logs-workout.png` | Coach logs a workout for a client (in person) | F28 |

## Open decisions for Firoz (with recommendation)

1. **Nudge templates and limit** — mocks show 3 templates, quiet hours 10 pm–7 am (push held until 7:00 am), and 2 nudges per client per day (TM-04n). *Rec:* keep 2/day; let the coach edit text but not the title.
2. **Push off for a client (TM-04o)** — mock warns "Ishita has turned off FitBud notifications" and still sends; she sees it in her in-app inbox next time she opens FitBud. *Rec:* keep this (no WhatsApp fallback); show "Push off" on the client header so the coach knows before tapping.
3. **Priya name clash** — Priya Sharma is a trainee in Rahul's roster and Karan's coach in the seed. *Rec:* rename the coach to e.g. "Priya Nair" in seed data.
4. **Meal ⋯ menu** — mapped to logged meal detail (TR-07g) / planned meal detail (TR-07j). *Rec:* keep; no separate action sheet.
5. **Invites on mobile** — Later (web). *Rec:* keep web-only for MVP; mobile shows "Invite pending" read-only.
6. **Intake answers on mobile (coach)** — Later (web TW-10). *Rec:* show a read-only summary in client ⋯ › Goal, intake, limitations (already mocked as a row) and deep link to web for full answers.
7. **Swipe actions on Needs you** — discoverability. *Rec:* keep the tap-through review screens as the primary path; swipe is a shortcut only.
8. **Reminder time editing** — Later. *Rec:* fixed defaults for MVP (workout 7 am, check-in Sunday 9 am); toggles only.
9. **Check-ins badge** — decided: badge = filter count incl. overdue (3). Mocks updated (TM-05c 1, TM-06c 2 after reviews).

## Deferred (marked, not mocked)

- In-person sessions, agenda and roll-call: **On hold, not mocked** (single "Log in person for {client}" TM-15a/b stays, reachable from client ⋯ menu).
- Reminder time editing; past-coaching history; meal picker for swaps; backdating weight; changing mobile/email; coach intake answers on mobile (web TW-10); invite management (web); plan building (web).
