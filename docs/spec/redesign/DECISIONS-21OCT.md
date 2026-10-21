# User decisions, 21 Oct 2026, and v3 screen index
Branch: design/today-rings-redesign (from origin/design/mvp-mockups-all-screens). Originals are untouched. Everything new is under docs/spec/redesign/.
Brand (Confluence): Soft Coral #FFB0C3 and Pale Lavender #EDEAFF accents, Satoshi 400–700, 4 px spacing, light theme preferred, Today is not a dashboard. Product rules: Indian dates ("Wed 21 Oct"), counts not %, no streaks, no Refresh buttons, 44 pt targets, no ISO/enums, wa.me drafts only, never claim sent.

## Phase 0: Active workout theme
Every TR-11 mockup (v1 and v2, 11 and 11b) is **light**. The rest variant has one navy rest banner. The "dark immersive" text in mockups/DESIGN-NOTES.md decision 7 is stale. See PHASE0-ACTIVE-WORKOUT-THEME.md.

## Phase 1: Trainee Today
- The user picked **Option B**: one kcal ring (indigo, "460 / of 1,850 kcal" in the centre), plus Protein, Carbs and Fat bars, each with a label and "24 of 110 g".
- Below them are three 44 pt+ chips: Workout "0 of 1", Meals "2 of 5", Steps "6,240". Done chips turn green with a check icon, and rest day is a neutral chip.
- No "left", no %. Every value is written out, so nothing depends on colour.
- States: empty, partial, all done, rest day, past day (banner with "Back to today"). Variants for iOS and Android.

## Phase 2: Mark reviewed and exception navigation
- **Mark reviewed** = seen, still open. The client moves to a **Reviewed** section ("Reviewed, still open · 1 of 2 resolved") and leaves Needs you / Home only when **every** exception is resolved.
- Swipe left on a Needs you row to mark reviewed. Toast: "Rohan moved to Reviewed · 3 still open · Undo".
- Tapping a client opens a **review sheet** with prev/next arrows, "n of m" and progress dashes. A resolved item shows a green "Resolved by you · Undo" plus "Next item". After the last item comes an "All 3 resolved" summary and "Next client".
- Web Home uses the same model: Needs you and Reviewed cards, and a side panel with the same arrows, "1 of 3" and the "Also open" list.

## Phase 3: Sessions (in person)
- Purpose: the in-person sessions the trainer must attend, and logging workouts for one or several clients during or after the session.
- Rules: a no-show uses a session. A late cancel within 12 h uses one. Per-client override, and a one-off Waive.
- Multi-client set logging covers only present clients on the same exercise, and has Undo.
- Trainees can't edit coach-logged sets; they can suggest a change, which the coach accepts.
- Coach mobile gets a Sessions tab (Needs you · Sessions · Clients · Check-ins · More).
- Package/payment details are plain fields for the trainer's records: plan, sessions, amount ₹, Paid/Due, Cash/UPI/Bank/Other, renewal date, carry-over. There are no in-app payments.

## Phase 4: Calendar
- The calendar holds **only** in-person sessions and check-in calls, not check-in form fills. Calls happen outside the app (optional meeting link).
- After reviewing a check-in, or when assigning one, the trainer gets an optional prompt to schedule a call: date, time, duration, link, note.
- Reminders arrive as notifications (15 min before calls, 45 min before sessions).
- The week grid is continuous 6 am–9 pm with Sunday included, and calls are dashed teal so they're told apart by pattern, not colour alone.

## Open questions
1. Reminder lead times (15 min calls / 45 min sessions): confirm, or make them per coach?
2. Does a group session with a client marked Late count as attended? (Assumed yes.)
3. Is carry-over of unused sessions on renewal default off or on? (Shown as an option.)
4. Is the Sessions tab shown to online-only coaches? (Recommended: hidden.)
5. Should the Calendar be a separate web nav item, or live inside Sessions? (Shown inside Sessions.)

## Compare sheets
v3/compare/: P1-sbs-today-current-vs-v3, P1-today-ios-states, P1-today-android-states, P2-mobile-review-flow, P2-web-home-panel, P3-sessions-mobile, P3-ipad-group, P4-calendar-web, P4-calendar-mobile.

## Screen index
| PNG | HTML source |
|---|---|
| v3/png/02-trainer-web-home-panel-v3-resolved-web.png | v3/html/02-trainer-web-home-panel-v3-resolved-web.html |
| v3/png/02-trainer-web-home-panel-v3-web.png | v3/html/02-trainer-web-home-panel-v3-web.html |
| v3/png/04-trainee-today-android-v3-done.png | v3/html/04-trainee-today-android-v3-done.html |
| v3/png/04-trainee-today-android-v3-empty.png | v3/html/04-trainee-today-android-v3-empty.html |
| v3/png/04-trainee-today-android-v3-partial.png | v3/html/04-trainee-today-android-v3-partial.html |
| v3/png/04-trainee-today-android-v3-past.png | v3/html/04-trainee-today-android-v3-past.html |
| v3/png/04-trainee-today-android-v3-rest.png | v3/html/04-trainee-today-android-v3-rest.html |
| v3/png/04-trainee-today-ios-v3-done.png | v3/html/04-trainee-today-ios-v3-done.html |
| v3/png/04-trainee-today-ios-v3-empty.png | v3/html/04-trainee-today-ios-v3-empty.html |
| v3/png/04-trainee-today-ios-v3-partial.png | v3/html/04-trainee-today-ios-v3-partial.html |
| v3/png/04-trainee-today-ios-v3-past.png | v3/html/04-trainee-today-ios-v3-past.html |
| v3/png/04-trainee-today-ios-v3-rest.png | v3/html/04-trainee-today-ios-v3-rest.html |
| v3/png/05-trainer-mobile-needs-you-v3-ios.png | v3/html/05-trainer-mobile-needs-you-v3-ios.html |
| v3/png/05-trainer-mobile-needs-you-v3-reviewed-toast-ios.png | v3/html/05-trainer-mobile-needs-you-v3-reviewed-toast-ios.html |
| v3/png/05-trainer-mobile-needs-you-v3-swipe-ios.png | v3/html/05-trainer-mobile-needs-you-v3-swipe-ios.html |
| v3/png/200-trainer-web-calendar-v3-web.png | v3/html/200-trainer-web-calendar-v3-web.html |
| v3/png/201-trainer-mobile-agenda-v3-ios.png | v3/html/201-trainer-mobile-agenda-v3-ios.html |
| v3/png/202-trainer-mobile-add-session-v3-ios.png | v3/html/202-trainer-mobile-add-session-v3-ios.html |
| v3/png/202b-trainer-mobile-add-call-v3-ios.png | v3/html/202b-trainer-mobile-add-call-v3-ios.html |
| v3/png/203-trainer-web-checkin-review-schedule-call-v3-web.png | v3/html/203-trainer-web-checkin-review-schedule-call-v3-web.html |
| v3/png/204-trainer-web-assign-checkin-schedule-call-v3-web.png | v3/html/204-trainer-web-assign-checkin-schedule-call-v3-web.html |
| v3/png/205-trainer-mobile-calendar-reminder-v3-ios.png | v3/html/205-trainer-mobile-calendar-reminder-v3-ios.html |
| v3/png/31-trainer-mobile-review-sheet-v3-all-resolved-ios.png | v3/html/31-trainer-mobile-review-sheet-v3-all-resolved-ios.html |
| v3/png/31-trainer-mobile-review-sheet-v3-ios.png | v3/html/31-trainer-mobile-review-sheet-v3-ios.html |
| v3/png/31-trainer-mobile-review-sheet-v3-item2-ios.png | v3/html/31-trainer-mobile-review-sheet-v3-item2-ios.html |
| v3/png/31-trainer-mobile-review-sheet-v3-resolved-ios.png | v3/html/31-trainer-mobile-review-sheet-v3-resolved-ios.html |
| v3/png/IP-05-ipad-group-session-v3-ipad.png | v3/html/IP-05-ipad-group-session-v3-ipad.html |
| v3/png/IP-09-trainer-mobile-sessions-v3-ios.png | v3/html/IP-09-trainer-mobile-sessions-v3-ios.html |
| v3/png/IP-11-trainer-mobile-rollcall-v3-ios.png | v3/html/IP-11-trainer-mobile-rollcall-v3-ios.html |
| v3/png/IP-12-trainer-mobile-group-log-v3-ios.png | v3/html/IP-12-trainer-mobile-group-log-v3-ios.html |
| v3/png/IP-13-trainer-mobile-single-log-v3-ios.png | v3/html/IP-13-trainer-mobile-single-log-v3-ios.html |
| v3/png/IP-14-trainer-mobile-after-quick-log-v3-ios.png | v3/html/IP-14-trainer-mobile-after-quick-log-v3-ios.html |
| v3/png/IP-15-trainer-mobile-package-v3-ios.png | v3/html/IP-15-trainer-mobile-package-v3-ios.html |
| v3/png/IP-15b-trainer-mobile-renew-package-v3-ios.png | v3/html/IP-15b-trainer-mobile-renew-package-v3-ios.html |
| v3/png/IP-16-trainee-suggest-change-v3-ios.png | v3/html/IP-16-trainee-suggest-change-v3-ios.html |

Regenerate: `cd v3 && python3 p1_today.py p2_review.py ... && node render.mjs` (the generators are p1–p4_*.py on fb.py; render needs repo node_modules Playwright).
