# FitBud design: single source of truth

Everything design lives here. **One file per screen state; if it is not in `mockups/png/`, it is not the design.** Consolidated 22 Oct 2026 from `docs/spec/mockups/`, `docs/spec/mockups-v2/`, `docs/spec/redesign/` (today-rings, v3) and `docs/design/figma/`; older versions, rejected options and superseded frames were removed (see git history of commit "design: single source of truth" if you ever need them).

## Precedence
1. **v3 frames** (`*-v3-*`, locked 21 Oct 2026 by Firoz): [DECISIONS-21OCT.md](DECISIONS-21OCT.md).
2. **Original frames** (approved 18–21 Oct): [DESIGN-NOTES.md](DESIGN-NOTES.md). Where an original frame shows something a v3 decision changed (old Today ring card, old trainer tab bar "Attention · Clients · Check-ins · More", the exception drawer), follow the v3 decision; the Status column flags these.
3. Content rules always apply: [../spec/01-product-rules.md](../spec/01-product-rules.md), [../spec/banned-strings.json](../spec/banned-strings.json).

Locked decisions in brief: Today = Option B (kcal ring + macro bars + Workout/Meals/Steps chips); Active workout (11, 11b) is **light**; Mark reviewed moves the client to a Reviewed section until every item is resolved; every coach gets a Sessions tab (calendar lives inside Sessions on web); client Check-ins tab with an Overdue filter is web/iPad only (trainer-mobile check-in history removed; trainer mobile = quick jobs).

## Layout
- `mockups/png/` — 248 frames (42 v3 locked + 206 original). iOS 393 × 852, Android 412 × 915 (v3 Android 393 × 852 @2x), web 1440 × 900, iPad 1024 × 768 / 768 × 1024.
- `mockups/html/` — 75 HTML sources, named exactly like their PNG, plus shared `tokens.css`, `m2.css`, `l3.css`, `and6.css`, `fonts/`, `assets/`. Frames without HTML (most of 31–199 and the notification set) were rendered by a retired generator; the PNG is the source.
- `mockups/compare/` — contact sheets of final (v3) screens only.
- `mockups/tools/` — v3 generators (`p1…p6_*.py` on `fb.py`), `render.mjs` (re-renders `*-v3*` only), `sheet.py` (contact sheets), `check.mjs` (banned strings). Run from `docs/design/mockups/`: `node tools/check.mjs`.
- [DESIGN-NOTES.md](DESIGN-NOTES.md) (tokens, components, per-set notes), [DECISIONS-21OCT.md](DECISIONS-21OCT.md) (locked v3 decisions), `reviews/` (audit and review rationale: AUDIT-21OCT, review-pre-v3, sessions-offline, PHASE0-ACTIVE-WORKOUT-THEME).

**ID note:** `200` is used twice: `200-trainer-web-plan-filtered-web` (original, Plan tab) and `200-trainer-web-calendar-v3-web` (v3, Sessions calendar). File names are unique; refer to frames by file name.

## Screen index
| ID | Screen | State | Platform | PNG | HTML | Status |
|---|---|---|---|---|---|---|
| 01 | Sign in | Default | Web | [01-trainer-web-signin.png](mockups/png/01-trainer-web-signin.png) | [html](mockups/html/01-trainer-web-signin.html) | Approved |
| 02 | Home + review side panel | item resolved · Undo · Next item 2 of 3 | Web | [02-trainer-web-home-panel-v3-resolved-web.png](mockups/png/02-trainer-web-home-panel-v3-resolved-web.png) | [html](mockups/html/02-trainer-web-home-panel-v3-resolved-web.html) | Draft (22 Oct) · v3 side panel, fully open |
| 02 | Home + review side panel | Needs you / Reviewed, item 1 of 3, actions footer | Web | [02-trainer-web-home-panel-v3-web.png](mockups/png/02-trainer-web-home-panel-v3-web.png) | [html](mockups/html/02-trainer-web-home-panel-v3-web.html) | Draft (22 Oct) · v3 side panel, fully open |
| 02 | Home + review side panel | Resolve: outcome chips + private note | Web | [02-trainer-web-home-panel-v3-resolve-web.png](mockups/png/02-trainer-web-home-panel-v3-resolve-web.png) | [html](mockups/html/02-trainer-web-home-panel-v3-resolve-web.html) | Draft (22 Oct) · v3 side panel, fully open |
| 03 | Client workspace · Overview | Full page | Web | [03-trainer-web-client-rohan-full.png](mockups/png/03-trainer-web-client-rohan-full.png) | — | Approved |
| 03 | Client workspace · Overview | This week, today selected (week/day nav) | Web | [03-trainer-web-client-rohan.png](mockups/png/03-trainer-web-client-rohan.png) | [html](mockups/html/03-trainer-web-client-rohan.html) | Approved |
| 03b | Client workspace · Overview | Previous week (week 5), Wed 7 Oct selected | Web | [03b-trainer-web-client-overview-prev-week.png](mockups/png/03b-trainer-web-client-overview-prev-week.png) | [html](mockups/html/03b-trainer-web-client-overview-prev-week.html) | Approved |
| 03c | Client workspace · Overview | Reminders side card · Details opens 181 | Web | [03c-trainer-web-client-overview-reminders-v3-web.png](mockups/png/03c-trainer-web-client-overview-reminders-v3-web.png) | [html](mockups/html/03c-trainer-web-client-overview-reminders-v3-web.html) | Draft (22 Oct) · entry to 181 |
| 04 | Today (Option B progress card) | done | Android | [04-trainee-today-android-v3-done.png](mockups/png/04-trainee-today-android-v3-done.png) | [html](mockups/html/04-trainee-today-android-v3-done.html) | **Locked** (v3, 21 Oct) |
| 04 | Today (Option B progress card) | empty | Android | [04-trainee-today-android-v3-empty.png](mockups/png/04-trainee-today-android-v3-empty.png) | [html](mockups/html/04-trainee-today-android-v3-empty.html) | **Locked** (v3, 21 Oct) |
| 04 | Today (Option B progress card) | partial | Android | [04-trainee-today-android-v3-partial.png](mockups/png/04-trainee-today-android-v3-partial.png) | [html](mockups/html/04-trainee-today-android-v3-partial.html) | **Locked** (v3, 21 Oct) |
| 04 | Today (Option B progress card) | past day | Android | [04-trainee-today-android-v3-past.png](mockups/png/04-trainee-today-android-v3-past.png) | [html](mockups/html/04-trainee-today-android-v3-past.html) | **Locked** (v3, 21 Oct) |
| 04 | Today (Option B progress card) | rest day | Android | [04-trainee-today-android-v3-rest.png](mockups/png/04-trainee-today-android-v3-rest.png) | [html](mockups/html/04-trainee-today-android-v3-rest.html) | **Locked** (v3, 21 Oct) |
| 04 | Today (Option B progress card) | done | iOS | [04-trainee-today-ios-v3-done.png](mockups/png/04-trainee-today-ios-v3-done.png) | [html](mockups/html/04-trainee-today-ios-v3-done.html) | **Locked** (v3, 21 Oct) |
| 04 | Today (Option B progress card) | empty | iOS | [04-trainee-today-ios-v3-empty.png](mockups/png/04-trainee-today-ios-v3-empty.png) | [html](mockups/html/04-trainee-today-ios-v3-empty.html) | **Locked** (v3, 21 Oct) |
| 04 | Today (Option B progress card) | partial | iOS | [04-trainee-today-ios-v3-partial.png](mockups/png/04-trainee-today-ios-v3-partial.png) | [html](mockups/html/04-trainee-today-ios-v3-partial.html) | **Locked** (v3, 21 Oct) |
| 04 | Today (Option B progress card) | past day | iOS | [04-trainee-today-ios-v3-past.png](mockups/png/04-trainee-today-ios-v3-past.png) | [html](mockups/html/04-trainee-today-ios-v3-past.html) | **Locked** (v3, 21 Oct) |
| 04 | Today (Option B progress card) | rest day | iOS | [04-trainee-today-ios-v3-rest.png](mockups/png/04-trainee-today-ios-v3-rest.png) | [html](mockups/html/04-trainee-today-ios-v3-rest.html) | **Locked** (v3, 21 Oct) |
| 05 | Needs you | Needs you + Reviewed sections | iOS | [05-trainer-mobile-needs-you-v3-ios.png](mockups/png/05-trainer-mobile-needs-you-v3-ios.png) | [html](mockups/html/05-trainer-mobile-needs-you-v3-ios.html) | **Locked** (v3, 21 Oct) |
| 05 | Needs you | moved to Reviewed · Undo toast | iOS | [05-trainer-mobile-needs-you-v3-reviewed-toast-ios.png](mockups/png/05-trainer-mobile-needs-you-v3-reviewed-toast-ios.png) | [html](mockups/html/05-trainer-mobile-needs-you-v3-reviewed-toast-ios.html) | **Locked** (v3, 21 Oct) |
| 05 | Needs you | swipe left: Mark reviewed | iOS | [05-trainer-mobile-needs-you-v3-swipe-ios.png](mockups/png/05-trainer-mobile-needs-you-v3-swipe-ios.png) | [html](mockups/html/05-trainer-mobile-needs-you-v3-swipe-ios.html) | **Locked** (v3, 21 Oct) |
| 06 | Sign in | Password | iOS | [06-trainee-signin-ios.png](mockups/png/06-trainee-signin-ios.png) | [html](mockups/html/06-trainee-signin-ios.html) | Approved |
| 06b | Sign in | Code | iOS | [06b-trainee-signin-code-ios.png](mockups/png/06b-trainee-signin-code-ios.png) | [html](mockups/html/06b-trainee-signin-code-ios.html) | Approved |
| 07 | Diet | Default | iOS | [07-trainee-diet-ios.png](mockups/png/07-trainee-diet-ios.png) | [html](mockups/html/07-trainee-diet-ios.html) | Approved |
| 07b | Diet | Photo after logging | iOS | [07b-trainee-diet-photo-ios.png](mockups/png/07b-trainee-diet-photo-ios.png) | [html](mockups/html/07b-trainee-diet-photo-ios.html) | Approved |
| 08 | Something different | Sheet | iOS | [08-trainee-something-different-ios.png](mockups/png/08-trainee-something-different-ios.png) | [html](mockups/html/08-trainee-something-different-ios.html) | Approved |
| 08b | Something different | Changed the portion | iOS | [08b-trainee-portion-change-ios.png](mockups/png/08b-trainee-portion-change-ios.png) | [html](mockups/html/08b-trainee-portion-change-ios.html) | Approved |
| 08c | Something different | Ate out | iOS | [08c-trainee-ate-out-ios.png](mockups/png/08c-trainee-ate-out-ios.png) | [html](mockups/html/08c-trainee-ate-out-ios.html) | Approved |
| 09 | Food search | Results + quantity | iOS | [09-trainee-food-search-ios.png](mockups/png/09-trainee-food-search-ios.png) | [html](mockups/html/09-trainee-food-search-ios.html) | Approved |
| 10 | Workout tab | Week + today's session | iOS | [10-trainee-workout-overview-ios.png](mockups/png/10-trainee-workout-overview-ios.png) | [html](mockups/html/10-trainee-workout-overview-ios.html) | Approved |
| 10b | Workout day | Detail | iOS | [10b-trainee-workout-day-ios.png](mockups/png/10b-trainee-workout-day-ios.png) | [html](mockups/html/10b-trainee-workout-day-ios.html) | Approved |
| 11 | Active workout | Logging a set | iOS | [11-trainee-active-workout-ios.png](mockups/png/11-trainee-active-workout-ios.png) | [html](mockups/html/11-trainee-active-workout-ios.html) | Approved |
| 11b | Active workout | Rest timer | iOS | [11b-trainee-active-workout-rest-ios.png](mockups/png/11b-trainee-active-workout-rest-ios.png) | [html](mockups/html/11b-trainee-active-workout-rest-ios.html) | Approved |
| 12 | Workout summary | Done | iOS | [12-trainee-workout-summary-ios.png](mockups/png/12-trainee-workout-summary-ios.png) | [html](mockups/html/12-trainee-workout-summary-ios.html) | Approved |
| 13 | Progress | Default | iOS | [13-trainee-progress-ios.png](mockups/png/13-trainee-progress-ios.png) | [html](mockups/html/13-trainee-progress-ios.html) | Approved |
| 14 | Check-in | Step 1 | iOS | [14-trainee-check-in-ios.png](mockups/png/14-trainee-check-in-ios.png) | [html](mockups/html/14-trainee-check-in-ios.html) | Approved |
| 15 | Notifications inbox | Default | iOS | [15-trainee-notifications-ios.png](mockups/png/15-trainee-notifications-ios.png) | [html](mockups/html/15-trainee-notifications-ios.html) | Approved |
| 16 | More | Default | iOS | [16-trainee-more-ios.png](mockups/png/16-trainee-more-ios.png) | [html](mockups/html/16-trainee-more-ios.html) | Approved |
| 17 | Clients | Default | iOS | [17-trainer-mobile-clients-ios.png](mockups/png/17-trainer-mobile-clients-ios.png) | [html](mockups/html/17-trainer-mobile-clients-ios.html) | Approved · old tab bar: use v3 tabs |
| 18 | Client status | Default | iOS | [18-trainer-mobile-client-status-ios.png](mockups/png/18-trainer-mobile-client-status-ios.png) | [html](mockups/html/18-trainer-mobile-client-status-ios.html) | Approved · old tab bar: use v3 tabs |
| 19 | Check-in review | Writing review | iOS | [19-trainer-mobile-check-in-review-ios.png](mockups/png/19-trainer-mobile-check-in-review-ios.png) | [html](mockups/html/19-trainer-mobile-check-in-review-ios.html) | Approved · old tab bar: use v3 tabs |
| 20 | Invite acceptance | Default | iOS | [20-trainee-invite-ios.png](mockups/png/20-trainee-invite-ios.png) | [html](mockups/html/20-trainee-invite-ios.html) | Approved |
| 21 | Intake | Step 2 of 5 | iOS | [21-trainee-intake-ios.png](mockups/png/21-trainee-intake-ios.png) | [html](mockups/html/21-trainee-intake-ios.html) | Approved |
| 22 | Waiting for coach | Default | iOS | [22-trainee-waiting-ios.png](mockups/png/22-trainee-waiting-ios.png) | [html](mockups/html/22-trainee-waiting-ios.html) | Approved |
| 23 | Reminder setup | Step 1 | iOS | [23-trainee-reminder-setup-ios.png](mockups/png/23-trainee-reminder-setup-ios.png) | [html](mockups/html/23-trainee-reminder-setup-ios.html) | Approved |
| 24 | Assigned meal plan | Training day | iOS | [24-trainee-meal-plan-ios.png](mockups/png/24-trainee-meal-plan-ios.png) | [html](mockups/html/24-trainee-meal-plan-ios.html) | Approved |
| 25 | Ask coach | Sheet | iOS | [25-trainee-ask-coach-ios.png](mockups/png/25-trainee-ask-coach-ios.png) | [html](mockups/html/25-trainee-ask-coach-ios.html) | Approved |
| 26 | Item unavailable | Default | iOS | [26-trainee-item-unavailable-ios.png](mockups/png/26-trainee-item-unavailable-ios.png) | [html](mockups/html/26-trainee-item-unavailable-ios.html) | Approved |
| 27 | Workout ongoing notification (Android) | Expanded (Android equivalent of 27b) | Android | [27-android-trainee-workout-notif.png](mockups/png/27-android-trainee-workout-notif.png) | [html](mockups/html/27-android-trainee-workout-notif.html) | Approved |
| 27 | Live Activity | collapsed (state 1 of 2) | iOS | [27-trainee-lock-live-activity-ios.png](mockups/png/27-trainee-lock-live-activity-ios.png) | — | Approved |
| 27b | Live Activity | expanded, touch and hold (state 2 of 2) | iOS | [27b-trainee-live-activity-expanded-ios.png](mockups/png/27b-trainee-live-activity-expanded-ios.png) | — | Approved |
| 27c | Live Activity | collapsed, resting | iOS | [27c-trainee-lock-live-rest-ios.png](mockups/png/27c-trainee-lock-live-rest-ios.png) | — | Approved |
| 28 | Lock · meal reminder | Open + Snooze | iOS | [28-trainee-lock-meal-push-ios.png](mockups/png/28-trainee-lock-meal-push-ios.png) | [html](mockups/html/28-trainee-lock-meal-push-ios.html) | Approved |
| 29 | In-app banner | meal over v3 Today | iOS | [29-trainee-inapp-meal-v3-ios.png](mockups/png/29-trainee-inapp-meal-v3-ios.png) | [html](mockups/html/29-trainee-inapp-meal-v3-ios.html) | Draft (22 Oct) · on v3 Today |
| 29b | In-app banner | coach note over v3 Today | iOS | [29b-trainee-inapp-note-v3-ios.png](mockups/png/29b-trainee-inapp-note-v3-ios.png) | [html](mockups/html/29b-trainee-inapp-note-v3-ios.html) | Draft (22 Oct) · on v3 Today |
| 30 | Lock · reminders | Check-in + note | iOS | [30-trainee-lock-coach-ios.png](mockups/png/30-trainee-lock-coach-ios.png) | [html](mockups/html/30-trainee-lock-coach-ios.html) | Approved |
| 31 | Exception review sheet | all 3 resolved · Next client | iOS | [31-trainer-mobile-review-sheet-v3-all-resolved-ios.png](mockups/png/31-trainer-mobile-review-sheet-v3-all-resolved-ios.png) | [html](mockups/html/31-trainer-mobile-review-sheet-v3-all-resolved-ios.html) | **Locked** (v3, 21 Oct) |
| 31 | Exception review sheet | item 1 of 3 | iOS | [31-trainer-mobile-review-sheet-v3-ios.png](mockups/png/31-trainer-mobile-review-sheet-v3-ios.png) | [html](mockups/html/31-trainer-mobile-review-sheet-v3-ios.html) | **Locked** (v3, 21 Oct) |
| 31 | Exception review sheet | item 2 of 3 | iOS | [31-trainer-mobile-review-sheet-v3-item2-ios.png](mockups/png/31-trainer-mobile-review-sheet-v3-item2-ios.png) | [html](mockups/html/31-trainer-mobile-review-sheet-v3-item2-ios.html) | **Locked** (v3, 21 Oct) |
| 31 | Exception review sheet | resolved · Undo · Next item | iOS | [31-trainer-mobile-review-sheet-v3-resolved-ios.png](mockups/png/31-trainer-mobile-review-sheet-v3-resolved-ios.png) | [html](mockups/html/31-trainer-mobile-review-sheet-v3-resolved-ios.html) | **Locked** (v3, 21 Oct) |
| 33 | Resolve confirm sheet | outcome chips, note, lock helper | iOS | [33-trainer-mobile-exception-resolve-sheet-ios.png](mockups/png/33-trainer-mobile-exception-resolve-sheet-ios.png) | — | Approved · layout per v3 review sheet 31; old tab bar: use v3 tabs |
| 34 | Nudge sheet | WhatsApp prefill, you press Send | iOS | [34-trainer-mobile-exception-nudge-sheet-ios.png](mockups/png/34-trainer-mobile-exception-nudge-sheet-ios.png) | — | Approved · layout per v3 review sheet 31; old tab bar: use v3 tabs |
| 35 | ⋯ action sheet | Add note, Message on WhatsApp | iOS | [35-trainer-mobile-exception-more-sheet-ios.png](mockups/png/35-trainer-mobile-exception-more-sheet-ios.png) | — | Approved · layout per v3 review sheet 31; old tab bar: use v3 tabs |
| 36 | Add note sheet | Visible to Rohan on | iOS | [36-trainer-mobile-note-composer-sheet-ios.png](mockups/png/36-trainer-mobile-note-composer-sheet-ios.png) | — | Approved · layout per v3 review sheet 31; old tab bar: use v3 tabs |
| 37 | Resolved | read-only | iOS | [37-trainer-mobile-exception-resolved-ios.png](mockups/png/37-trainer-mobile-exception-resolved-ios.png) | — | Approved · layout per v3 review sheet 31; old tab bar: use v3 tabs |
| 38 | Loading skeleton | Default | iOS | [38-trainer-mobile-exception-loading-ios.png](mockups/png/38-trainer-mobile-exception-loading-ios.png) | — | Approved · layout per v3 review sheet 31; old tab bar: use v3 tabs |
| 39 | Item no longer available | Default | iOS | [39-trainer-mobile-exception-not-found-ios.png](mockups/png/39-trainer-mobile-exception-not-found-ios.png) | — | Approved · layout per v3 review sheet 31; old tab bar: use v3 tabs |
| 40 | Offline | actions disabled | iOS | [40-trainer-mobile-exception-offline-ios.png](mockups/png/40-trainer-mobile-exception-offline-ios.png) | — | Approved · layout per v3 review sheet 31; old tab bar: use v3 tabs |
| 41 | Ended client | read-only banner | iOS | [41-trainer-mobile-exception-ended-ios.png](mockups/png/41-trainer-mobile-exception-ended-ios.png) | — | Approved · layout per v3 review sheet 31; old tab bar: use v3 tabs |
| 43 | Attention | all clear | iOS | [43-trainer-mobile-attention-empty-ios.png](mockups/png/43-trainer-mobile-attention-empty-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 44 | Attention | offline cached | iOS | [44-trainer-mobile-attention-offline-ios.png](mockups/png/44-trainer-mobile-attention-offline-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 45 | Attention | couldn't load | iOS | [45-trainer-mobile-attention-error-ios.png](mockups/png/45-trainer-mobile-attention-error-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 46 | Check-ins | To review | iOS | [46-trainer-mobile-checkins-to-review-ios.png](mockups/png/46-trainer-mobile-checkins-to-review-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 47 | Check-ins | Overdue | iOS | [47-trainer-mobile-checkins-overdue-ios.png](mockups/png/47-trainer-mobile-checkins-overdue-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 48 | Check-ins | nothing to review | iOS | [48-trainer-mobile-checkins-empty-ios.png](mockups/png/48-trainer-mobile-checkins-empty-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 49 | Check-ins | loading | iOS | [49-trainer-mobile-checkins-loading-ios.png](mockups/png/49-trainer-mobile-checkins-loading-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 50 | Check-ins | Android | Android | [50-trainer-mobile-checkins-android.png](mockups/png/50-trainer-mobile-checkins-android.png) | — | Approved · old tab bar: use v3 tabs |
| 51 | More | Default | iOS | [51-trainer-mobile-more-ios.png](mockups/png/51-trainer-mobile-more-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 52 | Notification settings | Default | iOS | [52-trainer-mobile-notification-settings-ios.png](mockups/png/52-trainer-mobile-notification-settings-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 53 | More | notifications off → Open settings | iOS | [53-trainer-mobile-more-permission-off-ios.png](mockups/png/53-trainer-mobile-more-permission-off-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 54 | Android 13 permission prompt | Default | Android | [54-trainer-mobile-permission-prompt-android.png](mockups/png/54-trainer-mobile-permission-prompt-android.png) | — | Approved |
| 55 | Profile | Default | iOS | [55-trainer-mobile-profile-ios.png](mockups/png/55-trainer-mobile-profile-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 56 | Help | no mail app sheet | iOS | [56-trainer-mobile-help-sheet-ios.png](mockups/png/56-trainer-mobile-help-sheet-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 57 | Sign out confirm | Default | iOS | [57-trainer-mobile-signout-confirm-ios.png](mockups/png/57-trainer-mobile-signout-confirm-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 58 | Notification settings | offline, save failed snackbar | iOS | [58-trainer-mobile-more-offline-ios.png](mockups/png/58-trainer-mobile-more-offline-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 59 | Role select | Default | iOS | [59-trainer-mobile-role-select-ios.png](mockups/png/59-trainer-mobile-role-select-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 60 | Unsupported role | Default | iOS | [60-trainer-mobile-unsupported-role-ios.png](mockups/png/60-trainer-mobile-unsupported-role-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 61 | Switch to coach view to open this? | Default | iOS | [61-trainer-mobile-switch-role-sheet-ios.png](mockups/png/61-trainer-mobile-switch-role-sheet-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 62 | Activity feed | Default | iOS | [62-trainer-mobile-activity-ios.png](mockups/png/62-trainer-mobile-activity-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 63 | Activity | group expanded, 3 new pill | iOS | [63-trainer-mobile-activity-grouped-ios.png](mockups/png/63-trainer-mobile-activity-grouped-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 64 | Meal detail sheet | planned vs actual | iOS | [64-trainer-mobile-activity-meal-sheet-ios.png](mockups/png/64-trainer-mobile-activity-meal-sheet-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 65 | Workout detail sheet | sets | iOS | [65-trainer-mobile-activity-workout-sheet-ios.png](mockups/png/65-trainer-mobile-activity-workout-sheet-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 66 | Client picker sheet | Default | iOS | [66-trainer-mobile-activity-client-picker-ios.png](mockups/png/66-trainer-mobile-activity-client-picker-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 67 | Row actions sheet | Default | iOS | [67-trainer-mobile-activity-row-actions-ios.png](mockups/png/67-trainer-mobile-activity-row-actions-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 68 | Filtered empty | Meals | iOS | [68-trainer-mobile-activity-filtered-empty-ios.png](mockups/png/68-trainer-mobile-activity-filtered-empty-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 69 | Offline | cached | iOS | [69-trainer-mobile-activity-offline-ios.png](mockups/png/69-trainer-mobile-activity-offline-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 70 | Error with Retry | Default | iOS | [70-trainer-mobile-activity-error-ios.png](mockups/png/70-trainer-mobile-activity-error-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 71 | Skeleton rows | Default | iOS | [71-trainer-mobile-activity-loading-ios.png](mockups/png/71-trainer-mobile-activity-loading-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 72 | Activity | Android | Android | [72-trainer-mobile-activity-android.png](mockups/png/72-trainer-mobile-activity-android.png) | — | Approved · old tab bar: use v3 tabs |
| 73 | Clients | Ended filter | iOS | [73-trainer-mobile-clients-ended-ios.png](mockups/png/73-trainer-mobile-clients-ended-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 74 | Client status | ended summary + last week | iOS | [74-trainer-mobile-client-ended-ios.png](mockups/png/74-trainer-mobile-client-ended-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 75 | Check-in review | saved, read-only | iOS | [75-trainer-mobile-checkin-review-saved-ios.png](mockups/png/75-trainer-mobile-checkin-review-saved-ios.png) | — | Approved · old tab bar: use v3 tabs |
| 76 | Reminder settings | Default | iOS | [76-trainee-reminder-settings-ios.png](mockups/png/76-trainee-reminder-settings-ios.png) | — | Approved |
| 77 | Reminders | permission denied | iOS | [77-trainee-reminder-settings-denied-ios.png](mockups/png/77-trainee-reminder-settings-denied-ios.png) | — | Approved |
| 78 | Reminders | paused notice, saving toast | iOS | [78-trainee-reminder-settings-paused-ios.png](mockups/png/78-trainee-reminder-settings-paused-ios.png) | — | Approved |
| 79 | Reminders | Android | Android | [79-trainee-reminder-settings-android.png](mockups/png/79-trainee-reminder-settings-android.png) | — | Approved |
| 80 | Quiet hours | Default | iOS | [80-trainee-quiet-hours-ios.png](mockups/png/80-trainee-quiet-hours-ios.png) | — | Approved |
| 81 | Quiet hours | validation | iOS | [81-trainee-quiet-hours-error-ios.png](mockups/png/81-trainee-quiet-hours-error-ios.png) | — | Approved |
| 82 | Your meal times | Default | iOS | [82-trainee-meal-times-ios.png](mockups/png/82-trainee-meal-times-ios.png) | — | Approved |
| 83 | Meal times | validation | iOS | [83-trainee-meal-times-error-ios.png](mockups/png/83-trainee-meal-times-error-ios.png) | — | Approved |
| 84 | Meal times saved toast | Default | iOS | [84-trainee-meal-times-saved-ios.png](mockups/png/84-trainee-meal-times-saved-ios.png) | — | Approved |
| 85 | Sync status | Default | iOS | [85-trainee-sync-status-ios.png](mockups/png/85-trainee-sync-status-ios.png) | — | Approved |
| 86 | Diet | offline, planned kcal added | iOS | [86-trainee-diet-offline-ios.png](mockups/png/86-trainee-diet-offline-ios.png) | — | Approved |
| 87 | Couldn't send | log against the new meal | iOS | [87-trainee-sync-conflict-ios.png](mockups/png/87-trainee-sync-conflict-ios.png) | — | Approved |
| 88 | Sign out with unsent logs | Default | iOS | [88-trainee-signout-unsent-ios.png](mockups/png/88-trainee-signout-unsent-ios.png) | — | Approved |
| 89 | Ended | Today history | iOS | [89-trainee-ended-today-ios.png](mockups/png/89-trainee-ended-today-ios.png) | — | Approved · ended Today history |
| 90 | Reactivation card | Default | iOS | [90-trainee-reactivation-ios.png](mockups/png/90-trainee-reactivation-ios.png) | — | Approved |
| 91 | Restart while coached by Asha | Default | iOS | [91-trainee-reactivation-conflict-ios.png](mockups/png/91-trainee-reactivation-conflict-ios.png) | — | Approved |
| 92 | Request expired | Default | iOS | [92-trainee-reactivation-expired-ios.png](mockups/png/92-trainee-reactivation-expired-ios.png) | — | Approved |
| 93 | Steps setup | Default | iOS | [93-trainee-steps-setup-ios.png](mockups/png/93-trainee-steps-setup-ios.png) | — | Approved |
| 95 | Install Health Connect | Default | Android | [95-trainee-steps-health-connect-android.png](mockups/png/95-trainee-steps-health-connect-android.png) | — | Approved |
| 96 | Today | loading skeleton (v3 layout) | iOS | [96-trainee-today-loading-v3-ios.png](mockups/png/96-trainee-today-loading-v3-ios.png) | [html](mockups/html/96-trainee-today-loading-v3-ios.html) | Draft (22 Oct) · on v3 Today |
| 98 | Notifications | empty | iOS | [98-trainee-notifications-empty-ios.png](mockups/png/98-trainee-notifications-empty-ios.png) | — | Approved |
| 99 | Workout | skip today sheet over Workout tab | iOS | [99-trainee-workout-not-today-ios.png](mockups/png/99-trainee-workout-not-today-ios.png) | — | Approved |
| 100 | Check-in sent | Default | iOS | [100-trainee-checkin-sent-ios.png](mockups/png/100-trainee-checkin-sent-ios.png) | — | Approved |
| 101 | Check-in reviewed with note | Default | iOS | [101-trainee-checkin-reviewed-ios.png](mockups/png/101-trainee-checkin-reviewed-ios.png) | — | Approved |
| 102 | Diet | couldn't load | iOS | [102-trainee-diet-error-ios.png](mockups/png/102-trainee-diet-error-ios.png) | — | Approved |
| 103 | Sign in | wrong password | iOS | [103-trainee-signin-error-ios.png](mockups/png/103-trainee-signin-error-ios.png) | — | Approved |
| 104 | Today | offline, 1 log waiting to send | Android | [104-trainee-today-offline-v3-android.png](mockups/png/104-trainee-today-offline-v3-android.png) | [html](mockups/html/104-trainee-today-offline-v3-android.html) | Draft (22 Oct) · on v3 Today |
| 105 | Android | Lunch and Snack · Open, Snooze | Android | [105-notif-meal-merged-android.png](mockups/png/105-notif-meal-merged-android.png) | — | Approved |
| 106 | Lock | Time for Lower body B? · Start, Not today | iOS | [106-notif-workout-reminder-lock-ios.png](mockups/png/106-notif-workout-reminder-lock-ios.png) | — | Approved |
| 107 | Android | workout reminder | Android | [107-notif-workout-reminder-android.png](mockups/png/107-notif-workout-reminder-android.png) | — | Approved |
| 108 | Lock | 2 things left today | iOS | [108-notif-eod-lock-ios.png](mockups/png/108-notif-eod-lock-ios.png) | — | Approved |
| 109 | Lock | check-in ready | iOS | [109-notif-checkin-lock-ios.png](mockups/png/109-notif-checkin-lock-ios.png) | — | Approved |
| 110 | Android | check-in can still go in | Android | [110-notif-checkin-late-android.png](mockups/png/110-notif-checkin-late-android.png) | — | Approved |
| 111 | Lock | Rahul's reminder | iOS | [111-notif-nudge-lock-ios.png](mockups/png/111-notif-nudge-lock-ios.png) | — | Approved |
| 112 | Lock | plan updated | iOS | [112-notif-plan-lock-ios.png](mockups/png/112-notif-plan-lock-ios.png) | — | Approved |
| 113 | Today | in-app banner check-in reviewed (rest day) | iOS | [113-notif-checkin-reviewed-banner-v3-ios.png](mockups/png/113-notif-checkin-reviewed-banner-v3-ios.png) | [html](mockups/html/113-notif-checkin-reviewed-banner-v3-ios.html) | Draft (22 Oct) · on v3 Today |
| 114 | Inbox | coach answered | iOS | [114-notif-answered-inbox-ios.png](mockups/png/114-notif-answered-inbox-ios.png) | — | Approved |
| 115 | Today | meal reminders paused card | iOS | [115-notif-paused-today-v3-ios.png](mockups/png/115-notif-paused-today-v3-ios.png) | [html](mockups/html/115-notif-paused-today-v3-ios.html) | Draft (22 Oct) · on v3 Today |
| 116 | Android | 2 notes | Android | [116-notif-notes-merged-android.png](mockups/png/116-notif-notes-merged-android.png) | — | Approved |
| 117 | Lock | restart coaching | iOS | [117-notif-reactivate-lock-ios.png](mockups/png/117-notif-reactivate-lock-ios.png) | — | Approved |
| 118 | Lock | coaching ended | iOS | [118-notif-ended-lock-ios.png](mockups/png/118-notif-ended-lock-ios.png) | — | Approved |
| 119 | Lock | details hidden | iOS | [119-notif-hidden-details-lock-ios.png](mockups/png/119-notif-hidden-details-lock-ios.png) | — | Approved |
| 120 | Trainer lock | merged alerts | iOS | [120-notif-trainer-lock-ios.png](mockups/png/120-notif-trainer-lock-ios.png) | — | Approved |
| 121 | Trainer Android shade | Default | Android | [121-notif-trainer-android.png](mockups/png/121-notif-trainer-android.png) | — | Approved |
| 122 | Trainer in-app banner | Default | iOS | [122-notif-trainer-banner-ios.png](mockups/png/122-notif-trainer-banner-ios.png) | — | Approved |
| 123 | Web bell panel | Default | Web | [123-notif-bell-web.png](mockups/png/123-notif-bell-web.png) | — | Approved |
| 124 | Android lock | meal reminder | Android | [124-notif-meal-lock-android.png](mockups/png/124-notif-meal-lock-android.png) | — | Approved |
| 125 | First run | profile | Web | [125-trainer-web-onboarding-profile-web.png](mockups/png/125-trainer-web-onboarding-profile-web.png) | — | Approved |
| 126 | First run | starting templates | Web | [126-trainer-web-onboarding-templates-web.png](mockups/png/126-trainer-web-onboarding-templates-web.png) | — | Approved |
| 127 | First run | invite first client | Web | [127-trainer-web-onboarding-invite-web.png](mockups/png/127-trainer-web-onboarding-invite-web.png) | — | Approved |
| 128 | First run | you're set | Web | [128-trainer-web-onboarding-done-web.png](mockups/png/128-trainer-web-onboarding-done-web.png) | — | Approved |
| 131 | Home + review side panel | nudge limited, client quiet hours, ⋯ menu | Web | [131-trainer-web-home-panel-v3-nudge-limited-web.png](mockups/png/131-trainer-web-home-panel-v3-nudge-limited-web.png) | [html](mockups/html/131-trainer-web-home-panel-v3-nudge-limited-web.html) | Draft (22 Oct) · v3 side panel, fully open |
| 132 | Home + review side panel | resolved item, read-only (from Reviewed) | Web | [132-trainer-web-home-panel-v3-resolved-readonly-web.png](mockups/png/132-trainer-web-home-panel-v3-resolved-readonly-web.png) | [html](mockups/html/132-trainer-web-home-panel-v3-resolved-readonly-web.html) | Draft (22 Oct) · v3 side panel, fully open |
| 133 | Home + review side panel | item no longer exists | Web | [133-trainer-web-home-panel-v3-not-found-web.png](mockups/png/133-trainer-web-home-panel-v3-not-found-web.png) | [html](mockups/html/133-trainer-web-home-panel-v3-not-found-web.html) | Draft (22 Oct) · v3 side panel, fully open |
| 135 | Home | all clear | Web | [135-trainer-web-home-all-clear-web.png](mockups/png/135-trainer-web-home-all-clear-web.png) | — | Approved |
| 136 | Client roster | Default | Web | [136-trainer-web-clients-web.png](mockups/png/136-trainer-web-clients-web.png) | — | Approved |
| 137 | Roster | no match | Web | [137-trainer-web-clients-filtered-empty-web.png](mockups/png/137-trainer-web-clients-filtered-empty-web.png) | — | Approved |
| 138 | Roster | no clients | Web | [138-trainer-web-clients-empty-web.png](mockups/png/138-trainer-web-clients-empty-web.png) | — | Approved |
| 139 | Roster | error | Web | [139-trainer-web-clients-error-web.png](mockups/png/139-trainer-web-clients-error-web.png) | — | Approved |
| 140 | Roster | Ended | Web | [140-trainer-web-clients-ended-web.png](mockups/png/140-trainer-web-clients-ended-web.png) | — | Approved |
| 141 | Add client | Default | Web | [141-trainer-web-add-client-web.png](mockups/png/141-trainer-web-add-client-web.png) | — | Approved |
| 142 | Invite ready | Default | Web | [142-trainer-web-add-client-success-web.png](mockups/png/142-trainer-web-add-client-success-web.png) | — | Approved |
| 143 | Coached before | Reactivate instead | Web | [143-trainer-web-add-client-reactivate-web.png](mockups/png/143-trainer-web-add-client-reactivate-web.png) | — | Approved |
| 144 | Onboarding page | Invited (step 1 of 4) | Web | [144-trainer-web-invite-detail-web.png](mockups/png/144-trainer-web-invite-detail-web.png) | — | Approved |
| 145 | Onboarding page | Invited, revoke confirm | Web | [145-trainer-web-invite-revoke-web.png](mockups/png/145-trainer-web-invite-revoke-web.png) | — | Approved |
| 146 | Onboarding page | Intake submitted (step 3), review | Web | [146-trainer-web-intake-review-web.png](mockups/png/146-trainer-web-intake-review-web.png) | — | Approved |
| 147 | Onboarding page | Joined, intake in progress (step 2) | Web | [147-trainer-web-intake-not-submitted-web.png](mockups/png/147-trainer-web-intake-not-submitted-web.png) | — | Approved |
| 148 | Plan › Coaching setup | new client draft, Goal + Starting point open (no basics/subscription) | Web | [148-trainer-web-configure-v3-web.png](mockups/png/148-trainer-web-configure-v3-web.png) | [html](mockups/html/148-trainer-web-configure-v3-web.html) | Draft (22 Oct) · basic details + subscription moved to Client settings |
| 149 | Plan › Coaching setup | active, Expectations editing (targets only) | Web | [149-trainer-web-configure-active-v3-web.png](mockups/png/149-trainer-web-configure-active-v3-web.png) | [html](mockups/html/149-trainer-web-configure-active-v3-web.html) | Draft (22 Oct) · primary (approved candidate) |
| 149-ref | Plan › Coaching setup | active, Expectations with flag-rules column (old 149) | Web | [149-trainer-web-configure-active-ref-web.png](mockups/png/149-trainer-web-configure-active-ref-web.png) | — | Reference (future: flag rules column, not in current scope) |
| 150 | Plan › Plans | one current program (workout part + nutrition part) + versions | Web | [150-trainer-web-plan-v3-web.png](mockups/png/150-trainer-web-plan-v3-web.png) | [html](mockups/html/150-trainer-web-plan-v3-web.html) | Draft (22 Oct) · current-plans section redesigned |
| 151 | Plan › Plans | no plan yet | Web | [151-trainer-web-plan-empty-web.png](mockups/png/151-trainer-web-plan-empty-web.png) | — | Approved |
| 152 | Workout plan builder | Default | Web | [152-trainer-web-workout-builder-web.png](mockups/png/152-trainer-web-workout-builder-web.png) | — | Approved |
| 153 | Builder | couldn't save / conflict | Web | [153-trainer-web-workout-builder-conflict-web.png](mockups/png/153-trainer-web-workout-builder-conflict-web.png) | — | Approved |
| 154 | Nutrition plan builder | Default | Web | [154-trainer-web-nutrition-builder-web.png](mockups/png/154-trainer-web-nutrition-builder-web.png) | — | Approved |
| 155 | Publish & schedule modal | Default | Web | [155-trainer-web-assign-plan-web.png](mockups/png/155-trainer-web-assign-plan-web.png) | — | Approved |
| 156 | Diet change scope | Default | Web | [156-trainer-web-diet-scope-web.png](mockups/png/156-trainer-web-diet-scope-web.png) | — | Approved |
| 157 | Publish | partial failure | Web | [157-trainer-web-assign-partial-failure-web.png](mockups/png/157-trainer-web-assign-partial-failure-web.png) | — | Approved |
| 158 | Activity | Meals | Web | [158-trainer-web-activity-web.png](mockups/png/158-trainer-web-activity-web.png) | — | Approved |
| 159 | Meal panel | planned vs actual | Web | [159-trainer-web-activity-meal-panel-web.png](mockups/png/159-trainer-web-activity-meal-panel-web.png) | — | Approved |
| 160 | Progress | default: metric picker, Weight, 12 w, latest entries | Web | [160-trainer-web-progress-v3-web.png](mockups/png/160-trainer-web-progress-v3-web.png) | [html](mockups/html/160-trainer-web-progress-v3-web.html) | Draft (22 Oct) |
| 160b | Progress | check-in answers (Sleep, Energy, Stress 1–5) multi-select | Web | [160b-trainer-web-progress-checkin-answers-v3-web.png](mockups/png/160b-trainer-web-progress-checkin-answers-v3-web.png) | [html](mockups/html/160b-trainer-web-progress-checkin-answers-v3-web.html) | Draft (22 Oct) |
| 160c | Progress | body measurements multi-line (waist, hip, chest) | Web | [160c-trainer-web-progress-measurements-v3-web.png](mockups/png/160c-trainer-web-progress-measurements-v3-web.png) | [html](mockups/html/160c-trainer-web-progress-measurements-v3-web.html) | Draft (22 Oct) |
| 160d | Progress | compare two metrics (Weight + Sleep, two scales) | Web | [160d-trainer-web-progress-compare-v3-web.png](mockups/png/160d-trainer-web-progress-compare-v3-web.png) | [html](mockups/html/160d-trainer-web-progress-compare-v3-web.html) | Draft (22 Oct) |
| 160e | Progress | workout progress from logs (top set per exercise, workouts per week) | Web | [160e-trainer-web-progress-workouts-v3-web.png](mockups/png/160e-trainer-web-progress-workouts-v3-web.png) | [html](mockups/html/160e-trainer-web-progress-workouts-v3-web.html) | Draft (22 Oct) |
| 160f | Progress | progress photos compare (two dates, pose) | Web | [160f-trainer-web-progress-photos-v3-web.png](mockups/png/160f-trainer-web-progress-photos-v3-web.png) | [html](mockups/html/160f-trainer-web-progress-photos-v3-web.html) | Draft (22 Oct) |
| 160g | Progress | sparse data (2 weigh-ins) | Web | [160g-trainer-web-progress-sparse-v3-web.png](mockups/png/160g-trainer-web-progress-sparse-v3-web.png) | [html](mockups/html/160g-trainer-web-progress-sparse-v3-web.html) | Draft (22 Oct) |
| 160h | Progress | ended client, read-only | Web | [160h-trainer-web-progress-ended-v3-web.png](mockups/png/160h-trainer-web-progress-ended-v3-web.png) | [html](mockups/html/160h-trainer-web-progress-ended-v3-web.html) | Draft (22 Oct) |
| 160i | Progress | loading skeleton | Web | [160i-trainer-web-progress-loading-v3-web.png](mockups/png/160i-trainer-web-progress-loading-v3-web.png) | [html](mockups/html/160i-trainer-web-progress-loading-v3-web.html) | Draft (22 Oct) |
| 161 | Progress | no data yet (empty) | Web | [161-trainer-web-progress-empty-v3-web.png](mockups/png/161-trainer-web-progress-empty-v3-web.png) | [html](mockups/html/161-trainer-web-progress-empty-v3-web.html) | Draft (22 Oct) |
| 162 | Client workspace · Check-ins tab | list with filters incl. Overdue | Web | [162-trainer-web-client-checkins-v3-web.png](mockups/png/162-trainer-web-client-checkins-v3-web.png) | [html](mockups/html/162-trainer-web-client-checkins-v3-web.html) | **Locked** (v3, 21 Oct) · 22 Oct: client tabs aligned (Sessions tab removed), ⋯ added |
| 162b | Client workspace · Check-ins tab | empty | Web | [162b-trainer-web-client-checkins-empty-v3-web.png](mockups/png/162b-trainer-web-client-checkins-empty-v3-web.png) | [html](mockups/html/162b-trainer-web-client-checkins-empty-v3-web.html) | **Locked** (v3, 21 Oct) · 22 Oct: client tabs aligned (Sessions tab removed), ⋯ added |
| 162c | Client workspace · Check-ins tab | ended client, read-only | Web | [162c-trainer-web-client-checkins-ended-v3-web.png](mockups/png/162c-trainer-web-client-checkins-ended-v3-web.png) | [html](mockups/html/162c-trainer-web-client-checkins-ended-v3-web.html) | **Locked** (v3, 21 Oct) · 22 Oct: client tabs aligned (Sessions tab removed), ⋯ added |
| 163 | Check-in review | Default | Web | [163-trainer-web-checkin-review-web.png](mockups/png/163-trainer-web-checkin-review-web.png) | — | Approved |
| 164 | Check-in | already reviewed | Web | [164-trainer-web-checkin-reviewed-web.png](mockups/png/164-trainer-web-checkin-reviewed-web.png) | — | Approved |
| 165 | History | Default | Web | [165-trainer-web-history-web.png](mockups/png/165-trainer-web-history-web.png) | — | Approved |
| 166 | Check-ins inbox | Default | Web | [166-trainer-web-checkins-inbox-web.png](mockups/png/166-trainer-web-checkins-inbox-web.png) | — | Approved |
| 167 | Check-ins | none waiting | Web | [167-trainer-web-checkins-inbox-empty-web.png](mockups/png/167-trainer-web-checkins-inbox-empty-web.png) | — | Approved |
| 168 | Templates | Type, Owner, Status filters | Web | [168-trainer-web-templates-web.png](mockups/png/168-trainer-web-templates-web.png) | — | Approved |
| 169 | Templates | filtered empty (Nutrition + Mine) | Web | [169-trainer-web-templates-mine-empty-web.png](mockups/png/169-trainer-web-templates-mine-empty-web.png) | — | Approved |
| 170 | Onboarding form builder | Default | Web | [170-trainer-web-intake-form-builder-web.png](mockups/png/170-trainer-web-intake-form-builder-web.png) | — | Approved |
| 171 | Check-in form builder | Default | Web | [171-trainer-web-checkin-form-builder-web.png](mockups/png/171-trainer-web-checkin-form-builder-web.png) | — | Approved |
| 172 | Libraries | Foods + drawer | Web | [172-trainer-web-library-foods-web.png](mockups/png/172-trainer-web-library-foods-web.png) | — | Approved |
| 173 | Libraries | Exercises | Web | [173-trainer-web-library-exercises-web.png](mockups/png/173-trainer-web-library-exercises-web.png) | — | Approved |
| 174 | Templates | Use for client modal | Web | [174-trainer-web-template-use-web.png](mockups/png/174-trainer-web-template-use-web.png) | — | Approved |
| 175 | Templates | Make my copy modal | Web | [175-trainer-web-template-fork-web.png](mockups/png/175-trainer-web-template-fork-web.png) | — | Approved |
| 176 | Settings | Profile | Web | [176-trainer-web-settings-profile-web.png](mockups/png/176-trainer-web-settings-profile-web.png) | — | Approved |
| 177 | Settings | Notifications | Web | [177-trainer-web-settings-notifications-web.png](mockups/png/177-trainer-web-settings-notifications-web.png) | — | Approved |
| 178 | End coaching modal | Default | Web | [178-trainer-web-end-coaching-web.png](mockups/png/178-trainer-web-end-coaching-web.png) | — | Approved |
| 179 | Ended workspace | read-only | Web | [179-trainer-web-client-ended-web.png](mockups/png/179-trainer-web-client-ended-web.png) | — | Approved |
| 180 | Reactivate modal | Default | Web | [180-trainer-web-reactivate-web.png](mockups/png/180-trainer-web-reactivate-web.png) | — | Approved |
| 181 | Reminder responsiveness drawer | over client Overview, opened from Reminders card › Details | Web | [181-trainer-web-reminders-panel-v3-web.png](mockups/png/181-trainer-web-reminders-panel-v3-web.png) | [html](mockups/html/181-trainer-web-reminders-panel-v3-web.html) | Draft (22 Oct) · entry: Overview Reminders card › Details (also review panel + check-in review) |
| 182 | Asked coach drawer | Default | Web | [182-trainer-web-asked-drawer-web.png](mockups/png/182-trainer-web-asked-drawer-web.png) | — | Approved |
| 183 | Asked | pain topic | Web | [183-trainer-web-asked-pain-web.png](mockups/png/183-trainer-web-asked-pain-web.png) | — | Approved |
| 184 | Error state | Default | Web | [184-trainer-web-error-web.png](mockups/png/184-trainer-web-error-web.png) | — | Approved |
| 185 | Not found | Default | Web | [185-trainer-web-not-found-web.png](mockups/png/185-trainer-web-not-found-web.png) | — | Approved |
| 186 | Offline banner | Default | Web | [186-trainer-web-offline-web.png](mockups/png/186-trainer-web-offline-web.png) | — | Approved |
| 187 | No access | Default | Web | [187-trainer-web-forbidden-web.png](mockups/png/187-trainer-web-forbidden-web.png) | — | Approved |
| 188 | Note composer | drawer over Overview | Web | [188-trainer-web-note-composer-web.png](mockups/png/188-trainer-web-note-composer-web.png) | — | Approved |
| 189 | Note composer | delete confirm | Web | [189-trainer-web-note-delete-web.png](mockups/png/189-trainer-web-note-delete-web.png) | — | Approved |
| 190 | Search palette | Default | Web | [190-trainer-web-search-web.png](mockups/png/190-trainer-web-search-web.png) | — | Approved |
| 191 | Home | 1024 icon rail | iPad | [191-ipad-home-ipad.png](mockups/png/191-ipad-home-ipad.png) | — | Approved · Home layout per v3 02 |
| 192 | Client Overview | 1024, week nav | iPad | [192-ipad-client-ipad.png](mockups/png/192-ipad-client-ipad.png) | — | Approved |
| 192b | Client workspace · Check-ins tab | iPad 1024 | iPad | [192b-ipad-client-checkins-v3-ipad.png](mockups/png/192b-ipad-client-checkins-v3-ipad.png) | [html](mockups/html/192b-ipad-client-checkins-v3-ipad.html) | **Locked** (v3, 21 Oct) · 22 Oct: client tabs aligned (Sessions tab removed), ⋯ added |
| 193 | Exception drawer | 768 portrait | iPad (portrait) | [193-ipad-exception-drawer-ipad-portrait.png](mockups/png/193-ipad-exception-drawer-ipad-portrait.png) | — | Approved · drawer → v3 Home side panel |
| 194 | Builder | two panes, library toggle | iPad | [194-ipad-builder-ipad.png](mockups/png/194-ipad-builder-ipad.png) | — | Approved |
| 195 | Builder | read-only, open on a larger screen | iPad (portrait) | [195-ipad-builder-readonly-ipad-portrait.png](mockups/png/195-ipad-builder-readonly-ipad-portrait.png) | — | Approved |
| 196 | Roster | 768 portrait | iPad (portrait) | [196-ipad-clients-ipad-portrait.png](mockups/png/196-ipad-clients-ipad-portrait.png) | — | Approved |
| 197 | Sign in | single column | iPad (portrait) | [197-ipad-signin-ipad-portrait.png](mockups/png/197-ipad-signin-ipad-portrait.png) | — | Approved |
| 198 | Check-in review | 1024 stacked | iPad | [198-ipad-checkin-review-ipad.png](mockups/png/198-ipad-checkin-review-ipad.png) | — | Approved |
| 199 | Drawer | nudge waits for client quiet hours | Web | [199-trainer-web-exception-quiet-hours-web.png](mockups/png/199-trainer-web-exception-quiet-hours-web.png) | — | Approved · drawer → v3 Home side panel |
| 200 | Sessions · calendar (week) | sessions + check-in calls | Web | [200-trainer-web-calendar-v3-web.png](mockups/png/200-trainer-web-calendar-v3-web.png) | [html](mockups/html/200-trainer-web-calendar-v3-web.html) | **Locked** (v3, 21 Oct) |
| 200 | Plan › Plans | versions filtered Workout + Superseded | Web | [200-trainer-web-plan-filtered-web.png](mockups/png/200-trainer-web-plan-filtered-web.png) | — | Approved |
| 201 | Sessions · agenda | day agenda | iOS | [201-trainer-mobile-agenda-v3-ios.png](mockups/png/201-trainer-mobile-agenda-v3-ios.png) | [html](mockups/html/201-trainer-mobile-agenda-v3-ios.html) | **Locked** (v3, 21 Oct) |
| 202 | Add to calendar | in-person session | iOS | [202-trainer-mobile-add-session-v3-ios.png](mockups/png/202-trainer-mobile-add-session-v3-ios.png) | [html](mockups/html/202-trainer-mobile-add-session-v3-ios.html) | **Locked** (v3, 21 Oct) |
| 202b | Add to calendar | check-in call | iOS | [202b-trainer-mobile-add-call-v3-ios.png](mockups/png/202b-trainer-mobile-add-call-v3-ios.png) | [html](mockups/html/202b-trainer-mobile-add-call-v3-ios.html) | **Locked** (v3, 21 Oct) |
| 203 | Check-in review | schedule-a-call prompt | Web | [203-trainer-web-checkin-review-schedule-call-v3-web.png](mockups/png/203-trainer-web-checkin-review-schedule-call-v3-web.png) | [html](mockups/html/203-trainer-web-checkin-review-schedule-call-v3-web.html) | **Locked** (v3, 21 Oct) |
| 204 | Assign check-in | schedule-a-call prompt | Web | [204-trainer-web-assign-checkin-schedule-call-v3-web.png](mockups/png/204-trainer-web-assign-checkin-schedule-call-v3-web.png) | [html](mockups/html/204-trainer-web-assign-checkin-schedule-call-v3-web.html) | **Locked** (v3, 21 Oct) |
| 205 | Session / call reminder | notification | iOS | [205-trainer-mobile-calendar-reminder-v3-ios.png](mockups/png/205-trainer-mobile-calendar-reminder-v3-ios.png) | [html](mockups/html/205-trainer-mobile-calendar-reminder-v3-ios.html) | **Locked** (v3, 21 Oct) |
| 206 | Sessions tab (online-only coach) | calls | iOS | [206-trainer-mobile-sessions-online-v3-ios.png](mockups/png/206-trainer-mobile-sessions-online-v3-ios.png) | [html](mockups/html/206-trainer-mobile-sessions-online-v3-ios.html) | **Locked** (v3, 21 Oct) |
| 206b | Sessions tab (online-only coach) | empty | iOS | [206b-trainer-mobile-sessions-online-empty-v3-ios.png](mockups/png/206b-trainer-mobile-sessions-online-empty-v3-ios.png) | [html](mockups/html/206b-trainer-mobile-sessions-online-empty-v3-ios.html) | **Locked** (v3, 21 Oct) |
| 207 | Sessions (online-only coach) | calls only | Web | [207-trainer-web-sessions-online-v3-web.png](mockups/png/207-trainer-web-sessions-online-v3-web.png) | [html](mockups/html/207-trainer-web-sessions-online-v3-web.html) | **Locked** (v3, 21 Oct) |
| 208 | Client header ⋯ menu | open over Overview (Client settings first) | Web | [208-trainer-web-client-menu-v3-web.png](mockups/png/208-trainer-web-client-menu-v3-web.png) | [html](mockups/html/208-trainer-web-client-menu-v3-web.html) | Draft (22 Oct) |
| 208b | Client header ⋯ menu | open over Overview | iPad | [208b-ipad-client-menu-v3-ipad.png](mockups/png/208b-ipad-client-menu-v3-ipad.png) | [html](mockups/html/208b-ipad-client-menu-v3-ipad.html) | Draft (22 Oct) |
| 209 | Client settings | overview: basic details, subscription & package, relationship | Web | [209-trainer-web-client-settings-v3-web.png](mockups/png/209-trainer-web-client-settings-v3-web.png) | [html](mockups/html/209-trainer-web-client-settings-v3-web.html) | Draft (22 Oct) |
| 209b | Client settings | overview | iPad | [209b-ipad-client-settings-v3-ipad.png](mockups/png/209b-ipad-client-settings-v3-ipad.png) | [html](mockups/html/209b-ipad-client-settings-v3-ipad.html) | Draft (22 Oct) |
| 210 | Client settings | edit basic details (drawer) | Web | [210-trainer-web-client-basic-edit-v3-web.png](mockups/png/210-trainer-web-client-basic-edit-v3-web.png) | [html](mockups/html/210-trainer-web-client-basic-edit-v3-web.html) | Draft (22 Oct) |
| 211 | Client settings | edit subscription & package (drawer, hybrid) | Web | [211-trainer-web-client-subscription-edit-v3-web.png](mockups/png/211-trainer-web-client-subscription-edit-v3-web.png) | [html](mockups/html/211-trainer-web-client-subscription-edit-v3-web.html) | Draft (22 Oct) |
| 211b | Client settings | validation: renewal before start | Web | [211b-trainer-web-client-subscription-error-v3-web.png](mockups/png/211b-trainer-web-client-subscription-error-v3-web.png) | [html](mockups/html/211b-trainer-web-client-subscription-error-v3-web.html) | Draft (22 Oct) |
| 212 | Client settings | ended client, read-only | Web | [212-trainer-web-client-settings-ended-v3-web.png](mockups/png/212-trainer-web-client-settings-ended-v3-web.png) | [html](mockups/html/212-trainer-web-client-settings-ended-v3-web.html) | Draft (22 Oct) |
| IP-03 | Session detail | Default | Web | [IP-03-trainer-web-session-detail.png](mockups/png/IP-03-trainer-web-session-detail.png) | — | Reference (in-person, out of MVP scope) |
| IP-04 | Log workout for client | Default | iPad | [IP-04-ipad-log-for-client.png](mockups/png/IP-04-ipad-log-for-client.png) | — | Reference (in-person, out of MVP scope) |
| IP-05 | Group session | by exercise | iPad | [IP-05-ipad-group-session-v3-ipad.png](mockups/png/IP-05-ipad-group-session-v3-ipad.png) | [html](mockups/html/IP-05-ipad-group-session-v3-ipad.html) | **Locked** (v3, 21 Oct) |
| IP-06 | In-person check-in | Default | iPad | [IP-06-ipad-in-person-checkin.png](mockups/png/IP-06-ipad-in-person-checkin.png) | — | Reference (in-person, out of MVP scope) |
| IP-07 | Plan › Coaching setup | Coaching mode section (hybrid), standard tabs | Web | [IP-07-trainer-web-coaching-setup-mode-v3-web.png](mockups/png/IP-07-trainer-web-coaching-setup-mode-v3-web.png) | [html](mockups/html/IP-07-trainer-web-coaching-setup-mode-v3-web.html) | Draft (22 Oct) · in scope (Sessions decisions) |
| IP-08 | Client settings › Subscription & package | hybrid client: package, payment records, sessions | Web | [IP-08-trainer-web-client-settings-package-v3-web.png](mockups/png/IP-08-trainer-web-client-settings-package-v3-web.png) | [html](mockups/html/IP-08-trainer-web-client-settings-package-v3-web.html) | Draft (22 Oct) · in scope (packages = records only) |
| IP-09 | Sessions tab | today | iOS | [IP-09-trainer-mobile-sessions-v3-ios.png](mockups/png/IP-09-trainer-mobile-sessions-v3-ios.png) | [html](mockups/html/IP-09-trainer-mobile-sessions-v3-ios.html) | **Locked** (v3, 21 Oct) |
| IP-10 | Coach-logged workout (trainee) | Default | iOS | [IP-10-trainee-coach-logged-ios.png](mockups/png/IP-10-trainee-coach-logged-ios.png) | — | Reference (in-person, out of MVP scope) |
| IP-11 | Batch roll-call | Expected → Present/Late/Absent | iOS | [IP-11-trainer-mobile-rollcall-v3-ios.png](mockups/png/IP-11-trainer-mobile-rollcall-v3-ios.png) | [html](mockups/html/IP-11-trainer-mobile-rollcall-v3-ios.html) | **Locked** (v3, 21 Oct) |
| IP-12 | Group logging | same exercise, present clients | iOS | [IP-12-trainer-mobile-group-log-v3-ios.png](mockups/png/IP-12-trainer-mobile-group-log-v3-ios.png) | [html](mockups/html/IP-12-trainer-mobile-group-log-v3-ios.html) | **Locked** (v3, 21 Oct) |
| IP-13 | Single-client logging | during session | iOS | [IP-13-trainer-mobile-single-log-v3-ios.png](mockups/png/IP-13-trainer-mobile-single-log-v3-ios.png) | [html](mockups/html/IP-13-trainer-mobile-single-log-v3-ios.html) | **Locked** (v3, 21 Oct) |
| IP-14 | After-session quick log | sheet | iOS | [IP-14-trainer-mobile-after-quick-log-v3-ios.png](mockups/png/IP-14-trainer-mobile-after-quick-log-v3-ios.png) | [html](mockups/html/IP-14-trainer-mobile-after-quick-log-v3-ios.html) | **Locked** (v3, 21 Oct) |
| IP-15 | Package | plain fields | iOS | [IP-15-trainer-mobile-package-v3-ios.png](mockups/png/IP-15-trainer-mobile-package-v3-ios.png) | [html](mockups/html/IP-15-trainer-mobile-package-v3-ios.html) | **Locked** (v3, 21 Oct) |
| IP-15b | Renew package | carry-over on | iOS | [IP-15b-trainer-mobile-renew-package-v3-ios.png](mockups/png/IP-15b-trainer-mobile-renew-package-v3-ios.png) | [html](mockups/html/IP-15b-trainer-mobile-renew-package-v3-ios.html) | **Locked** (v3, 21 Oct) |
| IP-16 | Suggest a change (trainee) | coach-logged set | iOS | [IP-16-trainee-suggest-change-v3-ios.png](mockups/png/IP-16-trainee-suggest-change-v3-ios.png) | [html](mockups/html/IP-16-trainee-suggest-change-v3-ios.html) | **Locked** (v3, 21 Oct) |
