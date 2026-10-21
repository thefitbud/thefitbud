# FitBud mockups · inventory

Rebuilt 21 Oct 2026 after the design audit (`AUDIT.md`). One row per PNG in `png/`: frame → screen → state → entry point → reached from. Every detail or state screen names how the user gets there.

Frames: iOS 393 × 852 @3x, Android 412 × 915 @2.625x, web 1440 × 900 @2x, iPad 1024 × 768 / 768 × 1024 @2x. Demo day Sun 18 Oct 2026, coach Rahul Verma.

**Pipeline.** Frames 01–30 and 03b: hand-written `src/*.html` → `tools/build.mjs` (icons, partials) → `tools/render.mjs` / `render2.mjs` (Playwright Chromium). Frames 31+ and the redesigned frames: `tools/new/b*.mjs` → `tools/new/gen.mjs` → `tools/build.mjs` → `tools/new/render.mjs [from] [to]`. Redesign overrides live in `tools/new/b9z-redesign.mjs` (web) and `b9z2-mobile.mjs` (mobile); frames 201–207 render to their fixed legacy names (04, 27, 27b, 27c, 29, 29b). Overview sheets: `tools/new/overview-new.mjs`. This file: `python3 tools/new/inventory2.py`.

**Removed in the redesign** (see `AUDIT.md`, `DESIGN-NOTES.md` § Redesign 21 Oct): 02b, 02c (rejected Home variants), 04-trainee-today-ios-full (old Today), 27b-trainee-dynamic-island (replaced by 27b expanded Live Activity), 94-trainee-steps-today (separate Today layout; steps are a ring on Today).

**Same screen, several frames** (states, not alternatives): Plan tab = 150 (Plans), 200 (filtered), 151 (empty), 148/149 (Coaching setup draft/active). Onboarding page = 144 (Invited) → 147 (Joined, intake pending) → 146 (Intake submitted); 145 is the revoke confirm on 144. Today = 04 (iOS/Android), 04b (past day selected) with states 96, 97, 104, 113, 115 and banners 29/29b. Live Activity = 27 (collapsed) ↔ 27b (expanded, touch and hold) and 27c (collapsed, resting); 27-android is the Android equivalent of the expanded state.

| # | Spec | Screen | State | Entry point (route / surface) | Reached from | PNG |
|---|---|---|---|---|---|---|
| 01 | TW-01 | Sign in | Default | /signin | Signed-out visit; session expiry | `01-trainer-web-signin.png` |
| 02 | TW-04 | Home | Default · full page | / (Home) | Sidebar Home; after sign-in | `02-trainer-web-home-full.png` |
| 02 | TW-04 | Home | Default | / (Home) | Sidebar Home; after sign-in | `02-trainer-web-home.png` |
| 03 | TW-09 | Client workspace · Overview | Full page | /clients/:rid Overview | Clients row › Open; Home row › client name; ⌘K | `03-trainer-web-client-rohan-full.png` |
| 03 | TW-09 | Client workspace · Overview | This week, today selected (week/day nav) | /clients/:rid Overview | Clients row › Open; Home row › client name; ⌘K | `03-trainer-web-client-rohan.png` |
| 03b | TW-09 | Client workspace · Overview | Previous week (week 5), Wed 7 Oct selected | /clients/:rid Overview | Clients row › Open; Home row › client name; ⌘K | `03b-trainer-web-client-overview-prev-week.png` |
| 04 | TR-06 canonical | Today | Android | Today tab | App launch; tab bar | `04-trainee-today-android.png` |
| 04 | TR-06 canonical | Today | rings, workout, meals (next meal expanded) | Today tab | App launch; tab bar | `04-trainee-today-ios.png` |
| 04 |  | 04-trainee-today-ring-card-2x.png |  | — | — | `04-trainee-today-ring-card-2x.png` |
| 04b | TR-06 D27 past day | Today | past day selected (Fri), read-only + log late | Today tab | App launch; tab bar | `04b-trainee-today-past-day-ios.png` |
| 05 | TM-01 | Attention | Android | Attention tab | App launch (coach) | `05-trainer-mobile-attention-android.png` |
| 05 | TM-01 | Attention | Default | Attention tab | App launch (coach) | `05-trainer-mobile-attention-ios.png` |
| 06 | TR-01 | Sign in | Password | Sign in | Signed-out launch | `06-trainee-signin-ios.png` |
| 06b | TR-01 | Sign in | Code | Sign in | Signed-out launch | `06b-trainee-signin-code-ios.png` |
| 07 | TR-07 | Diet | Default | Diet tab | Tab bar; Today rings › Diet | `07-trainee-diet-ios.png` |
| 07b | TR-07 | Diet | Photo after logging | Diet tab | Tab bar; Today rings › Diet | `07b-trainee-diet-photo-ios.png` |
| 08 | TR-08 | Something different | Sheet | Sheet | Today/Diet meal › Something different | `08-trainee-something-different-ios.png` |
| 08b | TR-08 | Something different | Changed the portion | Sheet | Today/Diet meal › Something different | `08b-trainee-portion-change-ios.png` |
| 08c | TR-08 | Something different | Ate out | Sheet | Today/Diet meal › Something different | `08c-trainee-ate-out-ios.png` |
| 09 | TR-26 | Food search | Results + quantity | Food search | Something different › Log it myself | `09-trainee-food-search-ios.png` |
| 10 | TR-10 | Workout tab | Week + today's session | Workout tab | Tab bar; Today › See workout | `10-trainee-workout-overview-ios.png` |
| 10b | TR-10 | Workout day | Detail | Workout tab | Tab bar; Today › See workout | `10b-trainee-workout-day-ios.png` |
| 11 | TR-11 | Active workout | Logging a set | Active workout | Today workout card › Start; Workout › Start workout | `11-trainee-active-workout-ios.png` |
| 11b | TR-11 | Active workout | Rest timer | Active workout | Today workout card › Start; Workout › Start workout | `11b-trainee-active-workout-rest-ios.png` |
| 12 | TR-12 | Workout summary | Done | Summary | Active workout › Finish | `12-trainee-workout-summary-ios.png` |
| 13 | TR-13 | Progress | Default | Progress tab | Tab bar | `13-trainee-progress-ios.png` |
| 14 | TR-14 | Check-in | Step 1 | Check-in | Push P-CHK; Progress › Check-ins | `14-trainee-check-in-ios.png` |
| 15 | TR-15 | Notifications inbox | Default | Notifications | Today bell | `15-trainee-notifications-ios.png` |
| 16 | TR-20 | More | Default | More tab | Tab bar | `16-trainee-more-ios.png` |
| 17 | TM-02 | Clients | Default | Clients tab | Tab bar | `17-trainer-mobile-clients-ios.png` |
| 18 | TM-03 | Client status | Default | Client status | Clients row | `18-trainer-mobile-client-status-ios.png` |
| 19 | TM-06 | Check-in review | Writing review | Check-in review | Check-ins row › Review; push | `19-trainer-mobile-check-in-review-ios.png` |
| 20 | TR-02 | Invite acceptance | Default | Invite | Invite link | `20-trainee-invite-ios.png` |
| 21 | TR-03 | Intake | Step 2 of 5 | Intake | After joining | `21-trainee-intake-ios.png` |
| 22 | TR-04 | Waiting for coach | Default | Waiting | Intake submitted, no plan | `22-trainee-waiting-ios.png` |
| 23 | TR-05 | Reminder setup | Step 1 | Reminder setup | First plan published | `23-trainee-reminder-setup-ios.png` |
| 24 | TR-09 | Assigned meal plan | Training day | Meal plan | Diet › Meal plan | `24-trainee-meal-plan-ios.png` |
| 25 | TR-18 | Ask coach | Sheet | Sheet | Diet meal ⋯ › Ask Rahul | `25-trainee-ask-coach-ios.png` |
| 26 | TR-23 | Item unavailable | Default | Item unavailable | Deep link to replaced item | `26-trainee-item-unavailable-ios.png` |
| 27 | TR-21 | Workout ongoing notification (Android) | Expanded (Android equivalent of 27b) | Lock screen / Live Activity | Starting a workout (TR-11) starts the activity; touch and hold expands it | `27-android-trainee-workout-notif.png` |
| 27 | TR-21 Live Activity | Live Activity | collapsed (state 1 of 2) | Lock screen / Live Activity | Starting a workout (TR-11) starts the activity; touch and hold expands it | `27-trainee-lock-live-activity-ios.png` |
| 27b | TR-21 Live Activity | Live Activity | expanded, touch and hold (state 2 of 2) | Lock screen / Live Activity | Starting a workout (TR-11) starts the activity; touch and hold expands it | `27b-trainee-live-activity-expanded-ios.png` |
| 27c | TR-21 Live Activity | Live Activity | collapsed, resting | Lock screen / Live Activity | Starting a workout (TR-11) starts the activity; touch and hold expands it | `27c-trainee-lock-live-rest-ios.png` |
| 28 | P-MEAL | Lock · meal reminder | Open + Snooze | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `28-trainee-lock-meal-push-ios.png` |
| 29 | In-app banner | In-app banner | meal over Today | Banner over Today | Foreground push while the app is open | `29-trainee-inapp-meal-ios.png` |
| 29b | In-app banner | In-app banner | coach note over Today | Banner over Today | Foreground push while the app is open | `29b-trainee-inapp-note-ios.png` |
| 30 | P-CHK, P-NOTE | Lock · reminders | Check-in + note | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `30-trainee-lock-coach-ios.png` |
| 31 | TM-04 §5, TW-05 §5 | Exception review | open (Rohan, missed workout) | Exception review | Attention card › Review; push | `31-trainer-mobile-exception-review-ios.png` |
| 32 | TM-04 §5, rule A6 | Exception review | reviewed, still open → Resolve (Meera) | Exception review | Attention card › Review; push | `32-trainer-mobile-exception-reviewed-ios.png` |
| 33 | TW-05 §5 copy, D23 | Resolve confirm sheet | outcome chips, note, lock helper | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `33-trainer-mobile-exception-resolve-sheet-ios.png` |
| 34 | TM-03 nudge, MD1 dec. 2 | Nudge sheet | WhatsApp prefill, you press Send | Client status | Clients row | `34-trainer-mobile-exception-nudge-sheet-ios.png` |
| 35 | TM-04 §5 ⋯ | ⋯ action sheet | Add note, Message on WhatsApp | Exception review | Attention card › Review; push | `35-trainer-mobile-exception-more-sheet-ios.png` |
| 36 | TW-34 §5 | Add note sheet | Visible to Rohan on | Drawer over Overview | Overview › Coach notes › Add note; exception drawer ⋯ › Add note | `36-trainer-mobile-note-composer-sheet-ios.png` |
| 37 | TW-05 §6 | Resolved | read-only | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `37-trainer-mobile-exception-resolved-ios.png` |
| 38 | TM-04.4 | Loading skeleton | Default | Exception review | Attention card › Review; push | `38-trainer-mobile-exception-loading-ios.png` |
| 39 | TW-05 §6 404 | Item no longer available | Default | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `39-trainer-mobile-exception-not-found-ios.png` |
| 40 | MD1 global offline | Offline | actions disabled | Exception review | Attention card › Review; push | `40-trainer-mobile-exception-offline-ios.png` |
| 41 | TW-05 §6 ended | Ended client | read-only banner | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `41-trainer-mobile-exception-ended-ios.png` |
| 42 | MD1 dec. 1, rule A6 | Attention | Mark reviewed snackbar with Undo | Attention tab | App launch (coach) | `42-trainer-mobile-attention-undo-ios.png` |
| 43 | TM-01 states | Attention | all clear | Attention tab | App launch (coach) | `43-trainer-mobile-attention-empty-ios.png` |
| 44 | MD1 global offline | Attention | offline cached | Attention tab | App launch (coach) | `44-trainer-mobile-attention-offline-ios.png` |
| 45 | MD1 global error | Attention | couldn't load | Attention tab | App launch (coach) | `45-trainer-mobile-attention-error-ios.png` |
| 46 | TM-05 §5 | Check-ins | To review | Check-ins tab | Tab bar | `46-trainer-mobile-checkins-to-review-ios.png` |
| 47 | TM-05 §5 | Check-ins | Overdue | Check-ins tab | Tab bar | `47-trainer-mobile-checkins-overdue-ios.png` |
| 48 | TM-05 states | Check-ins | nothing to review | Check-ins tab | Tab bar | `48-trainer-mobile-checkins-empty-ios.png` |
| 49 | TM-05.6 | Check-ins | loading | Check-ins tab | Tab bar | `49-trainer-mobile-checkins-loading-ios.png` |
| 50 | TM-05, M3 nav | Check-ins | Android | Check-ins tab | Tab bar | `50-trainer-mobile-checkins-android.png` |
| 51 | TM-07 §5 | More | Default | More tab | Tab bar | `51-trainer-mobile-more-ios.png` |
| 52 | TM-07, TW-29 | Notification settings | Default | More tab | Tab bar | `52-trainer-mobile-notification-settings-ios.png` |
| 53 | TM-07 §6 | More | notifications off → Open settings | More tab | Tab bar | `53-trainer-mobile-more-permission-off-ios.png` |
| 54 | TM-07 §7 POST_NOTIFICATIONS | Android 13 permission prompt | Default | More tab | Tab bar | `54-trainer-mobile-permission-prompt-android.png` |
| 55 | TM-07 §5 Profile | Profile | Default | More tab | Tab bar | `55-trainer-mobile-profile-ios.png` |
| 56 | BATCHES dec. 6 | Help | no mail app sheet | More tab | Tab bar | `56-trainer-mobile-help-sheet-ios.png` |
| 57 | MD2 TM-07.5 | Sign out confirm | Default | More tab | Tab bar | `57-trainer-mobile-signout-confirm-ios.png` |
| 58 | MD2 TM-07 states | Notification settings | offline, save failed snackbar | More tab | Tab bar | `58-trainer-mobile-more-offline-ios.png` |
| 59 | TM-08 §5 | Role select | Default | Role select | First launch with both roles | `59-trainer-mobile-role-select-ios.png` |
| 60 | TM-08 §6 | Unsupported role | Default | Role select | First launch with both roles | `60-trainer-mobile-unsupported-role-ios.png` |
| 61 | TM-08 §7 | Switch to coach view to open this? | Default | Role select | First launch with both roles | `61-trainer-mobile-switch-role-sheet-ios.png` |
| 62 | TM-09 §5 | Activity feed | Default | Clients › Activity | Clients tab › Activity segment | `62-trainer-mobile-activity-ios.png` |
| 63 | TM-09 §5 grouping | Activity | group expanded, 3 new pill | Clients › Activity | Clients tab › Activity segment | `63-trainer-mobile-activity-grouped-ios.png` |
| 64 | TM-09 row tap, TW-17 D28 | Meal detail sheet | planned vs actual | Clients › Activity | Clients tab › Activity segment | `64-trainer-mobile-activity-meal-sheet-ios.png` |
| 65 | TM-09 row tap | Workout detail sheet | sets | Clients › Activity | Clients tab › Activity segment | `65-trainer-mobile-activity-workout-sheet-ios.png` |
| 66 | TM-09 Client picker | Client picker sheet | Default | Clients › Activity | Clients tab › Activity segment | `66-trainer-mobile-activity-client-picker-ios.png` |
| 67 | TM-09 row actions | Row actions sheet | Default | Clients › Activity | Clients tab › Activity segment | `67-trainer-mobile-activity-row-actions-ios.png` |
| 68 | TM-09 §6 | Filtered empty | Meals | Clients › Activity | Clients tab › Activity segment | `68-trainer-mobile-activity-filtered-empty-ios.png` |
| 69 | TM-09 §6 | Offline | cached | Clients › Activity | Clients tab › Activity segment | `69-trainer-mobile-activity-offline-ios.png` |
| 70 | TM-09 §6 | Error with Retry | Default | Clients › Activity | Clients tab › Activity segment | `70-trainer-mobile-activity-error-ios.png` |
| 71 | TM-09 §6 | Skeleton rows | Default | Clients › Activity | Clients tab › Activity segment | `71-trainer-mobile-activity-loading-ios.png` |
| 72 | TM-09, M3 | Activity | Android | Clients › Activity | Clients tab › Activity segment | `72-trainer-mobile-activity-android.png` |
| 73 | BATCHES dec. 12 | Clients | Ended filter | Clients tab | Tab bar | `73-trainer-mobile-clients-ended-ios.png` |
| 74 | MD1 dec. 5 | Client status | ended summary + last week | Client status | Clients row | `74-trainer-mobile-client-ended-ios.png` |
| 75 | MD1 dec. 3, TW-20 §6 | Check-in review | saved, read-only | /clients/:rid/check-ins/:id | Check-ins tab row; Check-ins inbox › Review; Overview › Check-in › Open | `75-trainer-mobile-checkin-review-saved-ios.png` |
| 76 | TR-16 §5 | Reminder settings | Default | Reminders | More › Reminders | `76-trainee-reminder-settings-ios.png` |
| 77 | TR-16 §6 | Reminders | permission denied | Reminders | More › Reminders | `77-trainee-reminder-settings-denied-ios.png` |
| 78 | TR-16 §5, P-PAUSE | Reminders | paused notice, saving toast | Reminders | More › Reminders | `78-trainee-reminder-settings-paused-ios.png` |
| 79 | TR-16 §7 channels | Reminders | Android | Reminders | More › Reminders | `79-trainee-reminder-settings-android.png` |
| 80 | TR-17 §5 | Quiet hours | Default | Quiet hours | Reminders › Quiet hours | `80-trainee-quiet-hours-ios.png` |
| 81 | TR-17 §6 | Quiet hours | validation | Quiet hours | Reminders › Quiet hours | `81-trainee-quiet-hours-error-ios.png` |
| 82 | TR-24 §5 | Your meal times | Default | Meal times | More › Meal times; Reminders › Your meal times | `82-trainee-meal-times-ios.png` |
| 83 | TR-24 §7 | Meal times | validation | Meal times | More › Meal times; Reminders › Your meal times | `83-trainee-meal-times-error-ios.png` |
| 84 | TR-24 §5 toast | Meal times saved toast | Default | Meal times | More › Meal times; Reminders › Your meal times | `84-trainee-meal-times-saved-ios.png` |
| 85 | TR-19 §5 | Sync status | Default | Sync status | More › Sync status; Today sync icon | `85-trainee-sync-status-ios.png` |
| 86 | TR-19, MD1 dec. 4 | Diet | offline, planned kcal added | Sync status | More › Sync status; Today sync icon | `86-trainee-diet-offline-ios.png` |
| 87 | TR-19 §6 | Couldn't send | log against the new meal | Sync status | More › Sync status; Today sync icon | `87-trainee-sync-conflict-ios.png` |
| 88 | TR-19 §7 | Sign out with unsent logs | Default | Sync status | More › Sync status; Today sync icon | `88-trainee-signout-unsent-ios.png` |
| 89 | TR-22 §5 | Ended | Today history | Today (ended) | Coaching ended | `89-trainee-ended-today-ios.png` |
| 90 | TR-22 §5 | Reactivation card | Default | Today (ended) | Coaching ended | `90-trainee-reactivation-ios.png` |
| 91 | TR-22 §7 | Restart while coached by Asha | Default | Today (ended) | Coaching ended | `91-trainee-reactivation-conflict-ios.png` |
| 92 | TR-22 §6 | Request expired | Default | Today (ended) | Coaching ended | `92-trainee-reactivation-expired-ios.png` |
| 93 | TR-25 §5 (P2, flag off) | Steps setup | Default | Steps | More › Steps | `93-trainee-steps-setup-ios.png` |
| 95 | TR-25 §6 | Install Health Connect | Default | Steps | More › Steps | `95-trainee-steps-health-connect-android.png` |
| 96 | TR-06 states | Today | loading | Today tab | App launch; tab bar | `96-trainee-today-loading-ios.png` |
| 97 | TR-06 states | Today | all done | Today tab | App launch; tab bar | `97-trainee-today-all-done-ios.png` |
| 98 | TR-15 states | Notifications | empty | Notifications | Today bell | `98-trainee-notifications-empty-ios.png` |
| 99 | TR-10 Not today | Workout | skip today sheet over Workout tab | Workout tab | Tab bar; Today › See workout | `99-trainee-workout-not-today-ios.png` |
| 100 | TR-14 | Check-in sent | Default | Check-in | Push P-CHK; Progress › Check-ins | `100-trainee-checkin-sent-ios.png` |
| 101 | TR-14, P-CHK-REV | Check-in reviewed with note | Default | Check-in | Push P-CHK; Progress › Check-ins | `101-trainee-checkin-reviewed-ios.png` |
| 102 | TR-07 states | Diet | couldn't load | Diet tab | Tab bar; Today rings › Diet | `102-trainee-diet-error-ios.png` |
| 103 | TR-01 states | Sign in | wrong password | Sign in | Signed-out launch | `103-trainee-signin-error-ios.png` |
| 104 | TR-06 offline | Today | offline (Android) | Today tab | App launch; tab bar | `104-trainee-today-offline-android.png` |
| 105 | P-MEAL merge, saved meal decision | Android | Lunch and Snack · Open, Snooze | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `105-notif-meal-merged-android.png` |
| 106 | P-WO | Lock | Time for Lower body B? · Start, Not today | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `106-notif-workout-reminder-lock-ios.png` |
| 107 | P-WO | Android | workout reminder | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `107-notif-workout-reminder-android.png` |
| 108 | P-EOD | Lock | 2 things left today | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `108-notif-eod-lock-ios.png` |
| 109 | P-CHK | Lock | check-in ready | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `109-notif-checkin-lock-ios.png` |
| 110 | P-CHK-LATE | Android | check-in can still go in | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `110-notif-checkin-late-android.png` |
| 111 | P-NUDGE | Lock | Rahul's reminder | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `111-notif-nudge-lock-ios.png` |
| 112 | P-PLAN | Lock | plan updated | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `112-notif-plan-lock-ios.png` |
| 113 | TR-15 in-app, TR-06 | Today | in-app banner check-in reviewed | Notifications | Today bell | `113-notif-checkin-reviewed-banner-ios.png` |
| 114 | I-ANS | Inbox | coach answered | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `114-notif-answered-inbox-ios.png` |
| 115 | P-PAUSE, TR-06 | Today | meal reminders paused card | Today tab | App launch; tab bar | `115-notif-paused-today-ios.png` |
| 116 | P-NOTE merged | Android | 2 notes | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `116-notif-notes-merged-android.png` |
| 117 | P-REACT | Lock | restart coaching | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `117-notif-reactivate-lock-ios.png` |
| 118 | P-END | Lock | coaching ended | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `118-notif-ended-lock-ios.png` |
| 119 | §4 lock privacy | Lock | details hidden | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `119-notif-hidden-details-lock-ios.png` |
| 120 | §4.3 T-ASK/T-CHK/T-CRIT | Trainer lock | merged alerts | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `120-notif-trainer-lock-ios.png` |
| 121 | §4.3 T-MEALTIME/T-RENEW | Trainer Android shade | Default | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `121-notif-trainer-android.png` |
| 122 | §4.3 T-CHK | Trainer in-app banner | Default | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `122-notif-trainer-banner-ios.png` |
| 123 | §4.3 web bell | Web bell panel | Default | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `123-notif-bell-web.png` |
| 124 | P-MEAL, saved decision | Android lock | meal reminder | Lock screen / shade / banner | Push sent by FitBud (05-notifications); tap opens the deep-linked screen | `124-notif-meal-lock-android.png` |
| 125 | TW-02 step 1 | First run | profile | /onboarding | First sign-in | `125-trainer-web-onboarding-profile-web.png` |
| 126 | TW-02 step 2 | First run | starting templates | /onboarding | First sign-in | `126-trainer-web-onboarding-templates-web.png` |
| 127 | TW-02 step 3 | First run | invite first client | /onboarding | First sign-in | `127-trainer-web-onboarding-invite-web.png` |
| 128 | TW-02 end | First run | you're set | /onboarding | First sign-in | `128-trainer-web-onboarding-done-web.png` |
| 129 | TW-05 §5 | Exception drawer | open | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `129-trainer-web-exception-drawer-web.png` |
| 130 | TW-05 §5 Resolve | Drawer | reviewed → Resolve inline | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `130-trainer-web-exception-resolve-web.png` |
| 131 | TW-05 §6 | Drawer | nudge limited, quiet hours, ⋯ menu | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `131-trainer-web-exception-nudge-limited-web.png` |
| 132 | TW-05 §6 | Drawer | resolved read-only | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `132-trainer-web-exception-resolved-web.png` |
| 133 | TW-05 §6 404 | Drawer | no longer exists | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `133-trainer-web-exception-not-found-web.png` |
| 134 | TW-05 §7 undo | Home | Marked reviewed · Undo | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `134-trainer-web-home-undo-toast-web.png` |
| 135 | TW-04 states | Home | all clear | / (Home) | Sidebar Home; after sign-in | `135-trainer-web-home-all-clear-web.png` |
| 136 | TW-06 §5 | Client roster | Default | /clients | Sidebar Clients | `136-trainer-web-clients-web.png` |
| 137 | TW-06 §6 | Roster | no match | /clients | Sidebar Clients | `137-trainer-web-clients-filtered-empty-web.png` |
| 138 | TW-06 §6 | Roster | no clients | /clients | Sidebar Clients | `138-trainer-web-clients-empty-web.png` |
| 139 | TW-06 §6, TW-33 | Roster | error | /clients | Sidebar Clients | `139-trainer-web-clients-error-web.png` |
| 140 | TW-06, TW-30 | Roster | Ended | /clients | Sidebar Clients | `140-trainer-web-clients-ended-web.png` |
| 141 | TW-07 §5 | Add client | Default | /clients/new | Clients › Add client; onboarding step 3 | `141-trainer-web-add-client-web.png` |
| 142 | TW-07 success | Invite ready | Default | /clients/new | Clients › Add client; onboarding step 3 | `142-trainer-web-add-client-success-web.png` |
| 143 | TW-07 §6 | Coached before | Reactivate instead | /clients/new | Clients › Add client; onboarding step 3 | `143-trainer-web-add-client-reactivate-web.png` |
| 144 | TW-08 + TW-10 | Onboarding page | Invited (step 1 of 4) | /clients/:rid (Invited) | Clients row with status Invited; Home › Getting started row | `144-trainer-web-invite-detail-web.png` |
| 145 | TW-08 §5 | Onboarding page | Invited, revoke confirm | /clients/:rid (Invited) | Clients row with status Invited; Home › Getting started row | `145-trainer-web-invite-revoke-web.png` |
| 146 | TW-10 §5 | Onboarding page | Intake submitted (step 3), review | /clients/:rid (Onboarding) | Clients row with status Onboarding › Review intake; Home › Getting started | `146-trainer-web-intake-review-web.png` |
| 147 | TW-10 + TW-08 | Onboarding page | Joined, intake in progress (step 2) | /clients/:rid (Onboarding) | Clients row with status Onboarding › Review intake; Home › Getting started | `147-trainer-web-intake-not-submitted-web.png` |
| 148 | TW-11 §5 | Plan › Coaching setup | new client draft, Goal + Basics open | /clients/:rid/plan?view=setup | Plan tab › Coaching setup; onboarding page › Mark ready & configure; header ⋯ › Coaching setup | `148-trainer-web-configure-web.png` |
| 149 | TW-11 §5 | Plan › Coaching setup | active, Expectations editing (new version) | /clients/:rid/plan?view=setup | Plan tab › Coaching setup; onboarding page › Mark ready & configure; header ⋯ › Coaching setup | `149-trainer-web-configure-active-web.png` |
| 150 | TW-12 §5 | Plan › Plans | current plans + versions with Type/Status filters | /clients/:rid/plan | Workspace Plan tab; Overview › Plan card › Open plan | `150-trainer-web-plan-web.png` |
| 151 | TW-12 §6 | Plan › Plans | no plan yet | /clients/:rid/plan | Workspace Plan tab; Overview › Plan card › Open plan | `151-trainer-web-plan-empty-web.png` |
| 152 | TW-13 §5 | Workout plan builder | Default | Builder | Plan › Adjust plan / Open builder; template Use › Open draft | `152-trainer-web-workout-builder-web.png` |
| 153 | TW-13 §6 | Builder | couldn't save / conflict | Builder | Plan › Adjust plan / Open builder; template Use › Open draft | `153-trainer-web-workout-builder-conflict-web.png` |
| 154 | TW-14 §5 | Nutrition plan builder | Default | Builder | Plan › Nutrition card › Open builder | `154-trainer-web-nutrition-builder-web.png` |
| 155 | TW-16 §5 | Publish & schedule modal | Default | Modal in builder | Builder › Publish & schedule | `155-trainer-web-assign-plan-web.png` |
| 156 | TW-15 §5 | Diet change scope | Default | Modal in builder | Nutrition builder › Publish when a live plan changes | `156-trainer-web-diet-scope-web.png` |
| 157 | TW-16 §6 | Publish | partial failure | Modal in builder | Builder › Publish & schedule | `157-trainer-web-assign-partial-failure-web.png` |
| 158 | TW-17 §5 | Activity | Meals | /clients/:rid/activity | Activity tab; Overview › View all activity | `158-trainer-web-activity-web.png` |
| 159 | TW-17 D28 | Meal panel | planned vs actual | /clients/:rid/activity | Activity tab; Overview › View all activity | `159-trainer-web-activity-meal-panel-web.png` |
| 160 | TW-18 §5 | Progress | Default | /clients/:rid/progress | Progress tab; Overview › Progress › View | `160-trainer-web-progress-web.png` |
| 161 | TW-18 §6 | Progress | no weigh-ins | /clients/:rid/progress | Progress tab; Overview › Progress › View | `161-trainer-web-progress-empty-web.png` |
| 162 | TW-19 §5 | Client check-ins + schedule modal | Default | /clients/:rid/check-ins | Check-ins tab | `162-trainer-web-client-checkins-web.png` |
| 163 | TW-20 §5 | Check-in review | Default | /clients/:rid/check-ins/:id | Check-ins tab row; Check-ins inbox › Review; Overview › Check-in › Open | `163-trainer-web-checkin-review-web.png` |
| 164 | TW-20 §6 | Check-in | already reviewed | /clients/:rid/check-ins/:id | Check-ins tab row; Check-ins inbox › Review; Overview › Check-in › Open | `164-trainer-web-checkin-reviewed-web.png` |
| 165 | TW-21 §5 | History | Default | /clients/:rid/history | History tab | `165-trainer-web-history-web.png` |
| 166 | TW-22 §5 | Check-ins inbox | Default | /check-ins | Sidebar Check-ins; Home › Check-ins to review › All | `166-trainer-web-checkins-inbox-web.png` |
| 167 | TW-22 §6 | Check-ins | none waiting | /check-ins | Sidebar Check-ins; Home › Check-ins to review › All | `167-trainer-web-checkins-inbox-empty-web.png` |
| 168 | TW-23 §5 | Templates | Type, Owner, Status filters | /templates | Sidebar Templates | `168-trainer-web-templates-web.png` |
| 169 | TW-23 states | Templates | filtered empty (Nutrition + Mine) | /templates | Sidebar Templates | `169-trainer-web-templates-mine-empty-web.png` |
| 170 | TW-24 §5 | Onboarding form builder | Default | /templates/forms/:id | Templates › Intake form row | `170-trainer-web-intake-form-builder-web.png` |
| 171 | TW-25 §5 | Check-in form builder | Default | /templates/forms/:id | Templates › Check-in form row | `171-trainer-web-checkin-form-builder-web.png` |
| 172 | TW-26 §5 | Libraries | Foods + drawer | /templates/libraries | Templates › Libraries | `172-trainer-web-library-foods-web.png` |
| 173 | TW-26 §5 | Libraries | Exercises | /templates/libraries | Templates › Libraries | `173-trainer-web-library-exercises-web.png` |
| 174 | TW-27 Use | Templates | Use for client modal | Modal on Templates | Templates row › Use / ⋯ › Make my copy | `174-trainer-web-template-use-web.png` |
| 175 | TW-27 Fork | Templates | Make my copy modal | Modal on Templates | Templates row › Use / ⋯ › Make my copy | `175-trainer-web-template-fork-web.png` |
| 176 | TW-28 §5 | Settings | Profile | /settings | Sidebar More › Settings | `176-trainer-web-settings-profile-web.png` |
| 177 | TW-29 §5 | Settings | Notifications | /settings/notifications | Settings › Notifications | `177-trainer-web-settings-notifications-web.png` |
| 178 | TW-30 §5 | End coaching modal | Default | Workspace (ended) | Clients › Ended; header ⋯ › End coaching | `178-trainer-web-end-coaching-web.png` |
| 179 | TW-30 §5 | Ended workspace | read-only | Workspace (ended) | Clients › Ended; header ⋯ › End coaching | `179-trainer-web-client-ended-web.png` |
| 180 | TW-30 §5 | Reactivate modal | Default | Workspace (ended) | Clients › Ended; header ⋯ › End coaching | `180-trainer-web-reactivate-web.png` |
| 181 | TW-31 §5 | Reminder responsiveness drawer | label + counts only | Drawer | Overview › Reminders › Details; exception drawer reminder line | `181-trainer-web-reminders-panel-web.png` |
| 182 | TW-32 §5 | Asked coach drawer | Default | Drawer over Home | Home › Asked you on WhatsApp row | `182-trainer-web-asked-drawer-web.png` |
| 183 | TW-32 §6 | Asked | pain topic | Drawer over Home | Home › Asked you on WhatsApp row | `183-trainer-web-asked-pain-web.png` |
| 184 | TW-33 ErrorState | Error state | Default | Any page | Load failure, bad link, offline, other coach's client | `184-trainer-web-error-web.png` |
| 185 | TW-33 NotFound | Not found | Default | Any page | Load failure, bad link, offline, other coach's client | `185-trainer-web-not-found-web.png` |
| 186 | TW-33 OfflineBanner | Offline banner | Default | Any page | Load failure, bad link, offline, other coach's client | `186-trainer-web-offline-web.png` |
| 187 | TW-33 Forbidden | No access | Default | Any page | Load failure, bad link, offline, other coach's client | `187-trainer-web-forbidden-web.png` |
| 188 | TW-34 §5 | Note composer | drawer over Overview | Drawer over Overview | Overview › Coach notes › Add note; exception drawer ⋯ › Add note | `188-trainer-web-note-composer-web.png` |
| 189 | TW-34 §5 | Note composer | delete confirm | Drawer over Overview | Overview › Coach notes › Add note; exception drawer ⋯ › Add note | `189-trainer-web-note-delete-web.png` |
| 190 | TW-03 ⌘K | Search palette | Default | App shell | Any page (⌘K, bell) | `190-trainer-web-search-web.png` |
| 191 | 00 §layout 1024–1279 rail | Home | 1024 icon rail | Same as web | Same as web at 768–1279 px | `191-ipad-home-ipad.png` |
| 192 | TW-09 ≥1024 8/4 | Client Overview | 1024, week nav | /clients/:rid Overview | Clients row › Open; Home row › client name; ⌘K | `192-ipad-client-ipad.png` |
| 193 | 00 768–1023 drawers overlay | Exception drawer | 768 portrait | Same as web | Same as web at 768–1279 px | `193-ipad-exception-drawer-ipad-portrait.png` |
| 194 | 00 builder 1024–1279 | Builder | two panes, library toggle | Same as web | Same as web at 768–1279 px | `194-ipad-builder-ipad.png` |
| 195 | 00 builder <1024 | Builder | read-only, open on a larger screen | Same as web | Same as web at 768–1279 px | `195-ipad-builder-readonly-ipad-portrait.png` |
| 196 | TW-06, TW-03 768 | Roster | 768 portrait | /clients | Sidebar Clients | `196-ipad-clients-ipad-portrait.png` |
| 197 | TW-01 <1024 | Sign in | single column | /signin | Signed-out visit; session expiry | `197-ipad-signin-ipad-portrait.png` |
| 198 | TW-20 <1280 | Check-in review | 1024 stacked | /clients/:rid/check-ins/:id | Check-ins tab row; Check-ins inbox › Review; Overview › Check-in › Open | `198-ipad-checkin-review-ipad.png` |
| 199 | TW-05 §6 quiet hours | Drawer | nudge waits for client quiet hours | Drawer over Home | Home › Needs attention row › Review; client Overview › Needs attention › Review | `199-trainer-web-exception-quiet-hours-web.png` |
| 200 | TW-12 versions filters | Plan › Plans | versions filtered Workout + Superseded | /clients/:rid/plan | Workspace Plan tab; Overview › Plan card › Open plan | `200-trainer-web-plan-filtered-web.png` |
| IP-01 | IP (out of MVP scope) | trainer web home sessions | In-person set | In-person set | See overview-inperson.png | `IP-01-trainer-web-home-sessions.png` |
| IP-02 | IP (out of MVP scope) | trainer web session calendar | In-person set | In-person set | See overview-inperson.png | `IP-02-trainer-web-session-calendar.png` |
| IP-03 | IP (out of MVP scope) | trainer web session detail | In-person set | In-person set | See overview-inperson.png | `IP-03-trainer-web-session-detail.png` |
| IP-04 | IP (out of MVP scope) | ipad log for client | In-person set | In-person set | See overview-inperson.png | `IP-04-ipad-log-for-client.png` |
| IP-05 | IP (out of MVP scope) | ipad group session | In-person set | In-person set | See overview-inperson.png | `IP-05-ipad-group-session.png` |
| IP-06 | IP (out of MVP scope) | ipad in person checkin | In-person set | In-person set | See overview-inperson.png | `IP-06-ipad-in-person-checkin.png` |
| IP-07 | IP (out of MVP scope) | trainer web configure mode | In-person set | In-person set | See overview-inperson.png | `IP-07-trainer-web-configure-mode.png` |
| IP-08 | IP (out of MVP scope) | trainer web packages | In-person set | In-person set | See overview-inperson.png | `IP-08-trainer-web-packages.png` |
| IP-09 | IP (out of MVP scope) | trainer mobile sessions ios | In-person set | In-person set | See overview-inperson.png | `IP-09-trainer-mobile-sessions-ios.png` |
| IP-10 | IP (out of MVP scope) | trainee coach logged ios | In-person set | In-person set | See overview-inperson.png | `IP-10-trainee-coach-logged-ios.png` |
