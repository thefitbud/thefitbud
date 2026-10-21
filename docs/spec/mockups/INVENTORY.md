# FitBud mockups · inventory of new frames (31+)

Sources: every TW-*, TR-*, TM-* screen file, 04-flows, 05-notifications, 00-foundations (layout table), fitbud-md MD1/MD2. Frames: iOS 393 × 852 @3x, Android 412 × 915 (shade/lock 360 × 800), web 1440 × 900 @2x, iPad landscape 1024 × 768 and portrait 768 × 1024 @2x.
Each new src lives in `src/n<NN>-*.html` (written by `tools/new/gen.mjs` from `tools/new/b*.mjs`), rendered by `tools/new/render.mjs` to `png/<NN>-…`. ✅ = rendered and passed check + contrast.

## Already covered by existing PNGs (not redrawn)
| Spec | Screen / state | Existing PNG |
|---|---|---|
| TW-01 | Sign in (≥1024 split) | 01-trainer-web-signin.png |
| TW-03, TW-04 | App shell, Home triage (default) | 02-trainer-web-home.png, 02-…-full.png (02b/02c are rejected variants) |
| TW-09, TW-09a | Client workspace header + Overview | 03-trainer-web-client-rohan.png, 03-…-full.png |
| TR-06 | Today (iOS, Android) | 04-trainee-today-ios.png, 04-…-full.png, 04-trainee-today-android.png |
| TM-01 | Attention (iOS, Android M3 nav) | 05-trainer-mobile-attention-ios.png / -android.png |
| TR-01 | Sign in (password, code) | 06-trainee-signin-ios.png, 06b-…-code-ios.png |
| TR-07 | Diet, photo after logging | 07-trainee-diet-ios.png, 07b-… |
| TR-08 | Something different (sheet, portion, ate out) | 08, 08b, 08c |
| TR-26 | Food search | 09-trainee-food-search-ios.png |
| TR-10 | Workout overview, day detail | 10, 10b |
| TR-11 | Active workout, rest | 11, 11b |
| TR-12 | Workout summary | 12 |
| TR-13 | Progress | 13 |
| TR-14 | Check-in form | 14 |
| TR-15 | Notifications inbox | 15 |
| TR-20 | More | 16 |
| TM-02 | Clients | 17 |
| TM-03 | Client status | 18 |
| TM-06 | Check-in review | 19 |
| TR-02 | Invite acceptance | 20 |
| TR-03 | Intake | 21 |
| TR-04 | Waiting for coach | 22 |
| TR-05 | Reminder setup | 23 |
| TR-09 | Assigned meal plan | 24 |
| TR-18 | Ask coach | 25 |
| TR-23 | Item unavailable | 26 |
| TR-21 | Lock Live Activity, next set, expanded, Android workout | 27, 27c, 27b, 27-android |
| P-MEAL (iOS) | Lock meal reminder, Open + Snooze | 28 |
| In-app banners | Meal, coach note | 29, 29b |
| P-CHK + P-NOTE (iOS lock) | One-line reminders | 30 |
| IP-* | In-person set | out of scope |

## New frames
| # | Spec | Frame | PNG | Done |
|---|---|---|---|---|
| 31 | TM-04 §5, TW-05 §5 | Exception review · open (Rohan, missed workout) | 31-trainer-mobile-exception-review-ios.png | ✅ |
| 32 | TM-04 §5, rule A6 | Exception review · reviewed, still open → Resolve (Meera) | 32-trainer-mobile-exception-reviewed-ios.png | ✅ |
| 33 | TW-05 §5 copy, D23 | Resolve confirm sheet · outcome chips, note, lock helper | 33-trainer-mobile-exception-resolve-sheet-ios.png | ✅ |
| 34 | TM-03 nudge, MD1 dec. 2 | Nudge sheet · WhatsApp prefill, you press Send | 34-trainer-mobile-exception-nudge-sheet-ios.png | ✅ |
| 35 | TM-04 §5 ⋯ | ⋯ action sheet · Add note, Message on WhatsApp | 35-trainer-mobile-exception-more-sheet-ios.png | ✅ |
| 36 | TW-34 §5 | Add note sheet · Visible to Rohan on | 36-trainer-mobile-note-composer-sheet-ios.png | ✅ |
| 37 | TW-05 §6 | Resolved · read-only | 37-trainer-mobile-exception-resolved-ios.png | ✅ |
| 38 | TM-04.4 | Loading skeleton | 38-trainer-mobile-exception-loading-ios.png | ✅ |
| 39 | TW-05 §6 404 | Item no longer available | 39-trainer-mobile-exception-not-found-ios.png | ✅ |
| 40 | MD1 global offline | Offline · actions disabled | 40-trainer-mobile-exception-offline-ios.png | ✅ |
| 41 | TW-05 §6 ended | Ended client · read-only banner | 41-trainer-mobile-exception-ended-ios.png | ✅ |
| 42 | MD1 dec. 1, rule A6 | Attention · Mark reviewed snackbar with Undo | 42-trainer-mobile-attention-undo-ios.png | ✅ |
| 43 | TM-01 states | Attention · all clear | 43-trainer-mobile-attention-empty-ios.png | ✅ |
| 44 | MD1 global offline | Attention · offline cached | 44-trainer-mobile-attention-offline-ios.png | ✅ |
| 45 | MD1 global error | Attention · couldn't load | 45-trainer-mobile-attention-error-ios.png | ✅ |
| 46 | TM-05 §5 | Check-ins · To review | 46-trainer-mobile-checkins-to-review-ios.png | ✅ |
| 47 | TM-05 §5 | Check-ins · Overdue | 47-trainer-mobile-checkins-overdue-ios.png | ✅ |
| 48 | TM-05 states | Check-ins · nothing to review | 48-trainer-mobile-checkins-empty-ios.png | ✅ |
| 49 | TM-05.6 | Check-ins · loading | 49-trainer-mobile-checkins-loading-ios.png | ✅ |
| 50 | TM-05, M3 nav | Check-ins · Android | 50-trainer-mobile-checkins-android.png | ✅ |
| 51 | TM-07 §5 | More | 51-trainer-mobile-more-ios.png | ✅ |
| 52 | TM-07, TW-29 | Notification settings | 52-trainer-mobile-notification-settings-ios.png | ✅ |
| 53 | TM-07 §6 | More · notifications off → Open settings | 53-trainer-mobile-more-permission-off-ios.png | ✅ |
| 54 | TM-07 §7 POST_NOTIFICATIONS | Android 13 permission prompt | 54-trainer-mobile-permission-prompt-android.png | ✅ |
| 55 | TM-07 §5 Profile | Profile | 55-trainer-mobile-profile-ios.png | ✅ |
| 56 | BATCHES dec. 6 | Help · no mail app sheet | 56-trainer-mobile-help-sheet-ios.png | ✅ |
| 57 | MD2 TM-07.5 | Sign out confirm | 57-trainer-mobile-signout-confirm-ios.png | ✅ |
| 58 | MD2 TM-07 states | Notification settings · offline, save failed snackbar | 58-trainer-mobile-more-offline-ios.png | ✅ |
| 59 | TM-08 §5 | Role select | 59-trainer-mobile-role-select-ios.png | ✅ |
| 60 | TM-08 §6 | Unsupported role | 60-trainer-mobile-unsupported-role-ios.png | ✅ |
| 61 | TM-08 §7 | Switch to coach view to open this? | 61-trainer-mobile-switch-role-sheet-ios.png | ✅ |
| 62 | TM-09 §5 | Activity feed | 62-trainer-mobile-activity-ios.png | ✅ |
| 63 | TM-09 §5 grouping | Activity · group expanded, 3 new pill | 63-trainer-mobile-activity-grouped-ios.png | ✅ |
| 64 | TM-09 row tap, TW-17 D28 | Meal detail sheet · planned vs actual | 64-trainer-mobile-activity-meal-sheet-ios.png | ✅ |
| 65 | TM-09 row tap | Workout detail sheet · sets | 65-trainer-mobile-activity-workout-sheet-ios.png | ✅ |
| 66 | TM-09 Client picker | Client picker sheet | 66-trainer-mobile-activity-client-picker-ios.png | ✅ |
| 67 | TM-09 row actions | Row actions sheet | 67-trainer-mobile-activity-row-actions-ios.png | ✅ |
| 68 | TM-09 §6 | Filtered empty · Meals | 68-trainer-mobile-activity-filtered-empty-ios.png | ✅ |
| 69 | TM-09 §6 | Offline · cached | 69-trainer-mobile-activity-offline-ios.png | ✅ |
| 70 | TM-09 §6 | Error with Retry | 70-trainer-mobile-activity-error-ios.png | ✅ |
| 71 | TM-09 §6 | Skeleton rows | 71-trainer-mobile-activity-loading-ios.png | ✅ |
| 72 | TM-09, M3 | Activity · Android | 72-trainer-mobile-activity-android.png | ✅ |
| 73 | BATCHES dec. 12 | Clients · Ended filter | 73-trainer-mobile-clients-ended-ios.png | ✅ |
| 74 | MD1 dec. 5 | Client status · ended summary + last week | 74-trainer-mobile-client-ended-ios.png | ✅ |
| 75 | MD1 dec. 3, TW-20 §6 | Check-in review · saved, read-only | 75-trainer-mobile-checkin-review-saved-ios.png | ✅ |
| 76 | TR-16 §5 | Reminder settings | 76-trainee-reminder-settings-ios.png | ✅ |
| 77 | TR-16 §6 | Reminders · permission denied | 77-trainee-reminder-settings-denied-ios.png | ✅ |
| 78 | TR-16 §5, P-PAUSE | Reminders · paused notice, saving toast | 78-trainee-reminder-settings-paused-ios.png | ✅ |
| 79 | TR-16 §7 channels | Reminders · Android | 79-trainee-reminder-settings-android.png | ✅ |
| 80 | TR-17 §5 | Quiet hours | 80-trainee-quiet-hours-ios.png | ✅ |
| 81 | TR-17 §6 | Quiet hours · validation | 81-trainee-quiet-hours-error-ios.png | ✅ |
| 82 | TR-24 §5 | Your meal times | 82-trainee-meal-times-ios.png | ✅ |
| 83 | TR-24 §7 | Meal times · validation | 83-trainee-meal-times-error-ios.png | ✅ |
| 84 | TR-24 §5 toast | Meal times saved toast | 84-trainee-meal-times-saved-ios.png | ✅ |
| 85 | TR-19 §5 | Sync status | 85-trainee-sync-status-ios.png | ✅ |
| 86 | TR-19, MD1 dec. 4 | Diet · offline, planned kcal added | 86-trainee-diet-offline-ios.png | ✅ |
| 87 | TR-19 §6 | Couldn't send · log against the new meal | 87-trainee-sync-conflict-ios.png | ✅ |
| 88 | TR-19 §7 | Sign out with unsent logs | 88-trainee-signout-unsent-ios.png | ✅ |
| 89 | TR-22 §5 | Ended · Today history | 89-trainee-ended-today-ios.png | ✅ |
| 90 | TR-22 §5 | Reactivation card | 90-trainee-reactivation-ios.png | ✅ |
| 91 | TR-22 §7 | Restart while coached by Asha | 91-trainee-reactivation-conflict-ios.png | ✅ |
| 92 | TR-22 §6 | Request expired | 92-trainee-reactivation-expired-ios.png | ✅ |
| 93 | TR-25 §5 (P2, flag off) | Steps setup | 93-trainee-steps-setup-ios.png | ✅ |
| 94 | TR-25 §5 | Today · steps card | 94-trainee-steps-today-ios.png | ✅ |
| 95 | TR-25 §6 | Install Health Connect | 95-trainee-steps-health-connect-android.png | ✅ |
| 96 | TR-06 states | Today · loading | 96-trainee-today-loading-ios.png | ✅ |
| 97 | TR-06 states | Today · all logged | 97-trainee-today-all-done-ios.png | ✅ |
| 98 | TR-15 states | Notifications · empty | 98-trainee-notifications-empty-ios.png | ✅ |
| 99 | P-WO Not today | Not today sheet | 99-trainee-workout-not-today-ios.png | ✅ |
| 100 | TR-14 | Check-in sent | 100-trainee-checkin-sent-ios.png | ✅ |
| 101 | TR-14, P-CHK-REV | Check-in reviewed with note | 101-trainee-checkin-reviewed-ios.png | ✅ |
| 102 | TR-07 states | Diet · couldn't load | 102-trainee-diet-error-ios.png | ✅ |
| 103 | TR-01 states | Sign in · wrong password | 103-trainee-signin-error-ios.png | ✅ |
| 104 | TR-19, M3 | Today · Android offline | 104-trainee-today-offline-android.png | ✅ |
| 105 | P-MEAL merge, saved meal decision | Android · Lunch and Snack · Open, Snooze | 105-notif-meal-merged-android.png | ✅ |
| 106 | P-WO | Lock · Time for Lower body B? · Start, Not today | 106-notif-workout-reminder-lock-ios.png | ✅ |
| 107 | P-WO | Android · workout reminder | 107-notif-workout-reminder-android.png | ✅ |
| 108 | P-EOD | Lock · 2 things left today | 108-notif-eod-lock-ios.png | ✅ |
| 109 | P-CHK | Lock · check-in ready | 109-notif-checkin-lock-ios.png | ✅ |
| 110 | P-CHK-LATE | Android · check-in can still go in | 110-notif-checkin-late-android.png | ✅ |
| 111 | P-NUDGE | Lock · Rahul's reminder | 111-notif-nudge-lock-ios.png | ✅ |
| 112 | P-PLAN | Lock · plan updated | 112-notif-plan-lock-ios.png | ✅ |
| 113 | P-CHK-REV | In-app · reviewed, one line | 113-notif-checkin-reviewed-banner-ios.png | ✅ |
| 114 | I-ANS | Inbox · coach answered | 114-notif-answered-inbox-ios.png | ✅ |
| 115 | P-PAUSE | Today card · reminders paused | 115-notif-paused-today-ios.png | ✅ |
| 116 | P-NOTE merged | Android · 2 notes | 116-notif-notes-merged-android.png | ✅ |
| 117 | P-REACT | Lock · restart coaching | 117-notif-reactivate-lock-ios.png | ✅ |
| 118 | P-END | Lock · coaching ended | 118-notif-ended-lock-ios.png | ✅ |
| 119 | §4 lock privacy | Lock · details hidden | 119-notif-hidden-details-lock-ios.png | ✅ |
| 120 | §4.3 T-ASK/T-CHK/T-CRIT | Trainer lock · merged alerts | 120-notif-trainer-lock-ios.png | ✅ |
| 121 | §4.3 T-MEALTIME/T-RENEW | Trainer Android shade | 121-notif-trainer-android.png | ✅ |
| 122 | §4.3 T-CHK | Trainer in-app banner | 122-notif-trainer-banner-ios.png | ✅ |
| 123 | §4.3 web bell | Web bell panel | 123-notif-bell-web.png | ✅ |
| 124 | P-MEAL, saved decision | Android lock · meal reminder | 124-notif-meal-lock-android.png | ✅ |
| 125 | TW-02 step 1 | First run · profile | 125-trainer-web-onboarding-profile-web.png | ✅ |
| 126 | TW-02 step 2 | First run · starting templates | 126-trainer-web-onboarding-templates-web.png | ✅ |
| 127 | TW-02 step 3 | First run · invite first client | 127-trainer-web-onboarding-invite-web.png | ✅ |
| 128 | TW-02 end | First run · you're set | 128-trainer-web-onboarding-done-web.png | ✅ |
| 129 | TW-05 §5 | Exception drawer · open | 129-trainer-web-exception-drawer-web.png | ✅ |
| 130 | TW-05 §5 Resolve | Drawer · reviewed → Resolve inline | 130-trainer-web-exception-resolve-web.png | ✅ |
| 131 | TW-05 §6 | Drawer · nudge limited, quiet hours, ⋯ menu | 131-trainer-web-exception-nudge-limited-web.png | ✅ |
| 132 | TW-05 §6 | Drawer · resolved read-only | 132-trainer-web-exception-resolved-web.png | ✅ |
| 133 | TW-05 §6 404 | Drawer · no longer exists | 133-trainer-web-exception-not-found-web.png | ✅ |
| 134 | TW-05 §7 undo | Home · Marked reviewed · Undo | 134-trainer-web-home-undo-toast-web.png | ✅ |
| 135 | TW-04 states | Home · all clear | 135-trainer-web-home-all-clear-web.png | ✅ |
| 136 | TW-06 §5 | Client roster | 136-trainer-web-clients-web.png | ✅ |
| 137 | TW-06 §6 | Roster · no match | 137-trainer-web-clients-filtered-empty-web.png | ✅ |
| 138 | TW-06 §6 | Roster · no clients | 138-trainer-web-clients-empty-web.png | ✅ |
| 139 | TW-06 §6, TW-33 | Roster · error | 139-trainer-web-clients-error-web.png | ✅ |
| 140 | TW-06, TW-30 | Roster · Ended | 140-trainer-web-clients-ended-web.png | ✅ |
| 141 | TW-07 §5 | Add client | 141-trainer-web-add-client-web.png | ✅ |
| 142 | TW-07 success | Invite ready | 142-trainer-web-add-client-success-web.png | ✅ |
| 143 | TW-07 §6 | Coached before · Reactivate instead | 143-trainer-web-add-client-reactivate-web.png | ✅ |
| 144 | TW-08 §5 | Pending invitation | 144-trainer-web-invite-detail-web.png | ✅ |
| 145 | TW-08 §5 | Revoke invite confirm | 145-trainer-web-invite-revoke-web.png | ✅ |
| 146 | TW-10 §5 | Onboarding review | 146-trainer-web-intake-review-web.png | ✅ |
| 147 | TW-10 §6 | Intake not submitted | 147-trainer-web-intake-not-submitted-web.png | ✅ |
| 148 | TW-11 §5 | Coaching configuration | 148-trainer-web-configure-web.png | ✅ |
| 149 | TW-11 §6 | Configuration · active, new version | 149-trainer-web-configure-active-web.png | ✅ |
| 150 | TW-12 §5 | Plan tab | 150-trainer-web-plan-web.png | ✅ |
| 151 | TW-12 §6 | No plan yet | 151-trainer-web-plan-empty-web.png | ✅ |
| 152 | TW-13 §5 | Workout plan builder | 152-trainer-web-workout-builder-web.png | ✅ |
| 153 | TW-13 §6 | Builder · couldn't save / conflict | 153-trainer-web-workout-builder-conflict-web.png | ✅ |
| 154 | TW-14 §5 | Nutrition plan builder | 154-trainer-web-nutrition-builder-web.png | ✅ |
| 155 | TW-16 §5 | Publish & schedule modal | 155-trainer-web-assign-plan-web.png | ✅ |
| 156 | TW-15 §5 | Diet change scope | 156-trainer-web-diet-scope-web.png | ✅ |
| 157 | TW-16 §6 | Publish · partial failure | 157-trainer-web-assign-partial-failure-web.png | ✅ |
| 158 | TW-17 §5 | Activity · Meals | 158-trainer-web-activity-web.png | ✅ |
| 159 | TW-17 D28 | Meal panel · planned vs actual | 159-trainer-web-activity-meal-panel-web.png | ✅ |
| 160 | TW-18 §5 | Progress | 160-trainer-web-progress-web.png | ✅ |
| 161 | TW-18 §6 | Progress · no weigh-ins | 161-trainer-web-progress-empty-web.png | ✅ |
| 162 | TW-19 §5 | Client check-ins + schedule modal | 162-trainer-web-client-checkins-web.png | ✅ |
| 163 | TW-20 §5 | Check-in review | 163-trainer-web-checkin-review-web.png | ✅ |
| 164 | TW-20 §6 | Check-in · already reviewed | 164-trainer-web-checkin-reviewed-web.png | ✅ |
| 165 | TW-21 §5 | History | 165-trainer-web-history-web.png | ✅ |
| 166 | TW-22 §5 | Check-ins inbox | 166-trainer-web-checkins-inbox-web.png | ✅ |
| 167 | TW-22 §6 | Check-ins · none waiting | 167-trainer-web-checkins-inbox-empty-web.png | ✅ |
| 168 | TW-23 §6 | Templates hub | 168-trainer-web-templates-web.png | ✅ |
| 169 | TW-23 §7 | Templates · Mine empty | 169-trainer-web-templates-mine-empty-web.png | ✅ |
| 170 | TW-24 §5 | Onboarding form builder | 170-trainer-web-intake-form-builder-web.png | ✅ |
| 171 | TW-25 §5 | Check-in form builder | 171-trainer-web-checkin-form-builder-web.png | ✅ |
| 172 | TW-26 §5 | Libraries · Foods + drawer | 172-trainer-web-library-foods-web.png | ✅ |
| 173 | TW-26 §5 | Libraries · Exercises | 173-trainer-web-library-exercises-web.png | ✅ |
| 174 | TW-27 Use | Use for client modal | 174-trainer-web-template-use-web.png | ✅ |
| 175 | TW-27 Fork | Fork modal | 175-trainer-web-template-fork-web.png | ✅ |
| 176 | TW-28 §5 | Settings · Profile | 176-trainer-web-settings-profile-web.png | ✅ |
| 177 | TW-29 §5 | Settings · Notifications | 177-trainer-web-settings-notifications-web.png | ✅ |
| 178 | TW-30 §5 | End coaching modal | 178-trainer-web-end-coaching-web.png | ✅ |
| 179 | TW-30 §5 | Ended workspace · read-only | 179-trainer-web-client-ended-web.png | ✅ |
| 180 | TW-30 §5 | Reactivate modal | 180-trainer-web-reactivate-web.png | ✅ |
| 181 | TW-31 §5 | Reminder responsiveness drawer | 181-trainer-web-reminders-panel-web.png | ✅ |
| 182 | TW-32 §5 | Asked coach drawer | 182-trainer-web-asked-drawer-web.png | ✅ |
| 183 | TW-32 §6 | Asked · pain topic | 183-trainer-web-asked-pain-web.png | ✅ |
| 184 | TW-33 ErrorState | Error state | 184-trainer-web-error-web.png | ✅ |
| 185 | TW-33 NotFound | Not found | 185-trainer-web-not-found-web.png | ✅ |
| 186 | TW-33 OfflineBanner | Offline banner | 186-trainer-web-offline-web.png | ✅ |
| 187 | TW-33 Forbidden | No access | 187-trainer-web-forbidden-web.png | ✅ |
| 188 | TW-34 §5 | Note composer + list | 188-trainer-web-note-composer-web.png | ✅ |
| 189 | TW-34 §5 | Delete note confirm | 189-trainer-web-note-delete-web.png | ✅ |
| 190 | TW-03 ⌘K | Search palette | 190-trainer-web-search-web.png | ✅ |
| 191 | 00 §layout 1024–1279 rail | Home · 1024 icon rail | 191-ipad-home-ipad.png | ✅ |
| 192 | TW-09 ≥1024 8/4 | Client workspace · 1024 | 192-ipad-client-ipad.png | ✅ |
| 193 | 00 768–1023 drawers overlay | Exception drawer · 768 portrait | 193-ipad-exception-drawer-ipad-portrait.png | ✅ |
| 194 | 00 builder 1024–1279 | Builder · two panes, library toggle | 194-ipad-builder-ipad.png | ✅ |
| 195 | 00 builder <1024 | Builder · read-only, open on a larger screen | 195-ipad-builder-readonly-ipad-portrait.png | ✅ |
| 196 | TW-06, TW-03 768 | Roster · 768 portrait | 196-ipad-clients-ipad-portrait.png | ✅ |
| 197 | TW-01 <1024 | Sign in · single column | 197-ipad-signin-ipad-portrait.png | ✅ |
| 198 | TW-20 <1280 | Check-in review · 1024 stacked | 198-ipad-checkin-review-ipad.png | ✅ |
| 199 | TW-05 §6 quiet hours | Drawer · nudge waits for client quiet hours | 199-trainer-web-exception-quiet-hours-web.png | ✅ |

169 of 169 done.
