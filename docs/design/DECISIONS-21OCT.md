# User decisions, 21 Oct 2026, and v3 screen index

**Status: all v3 screens and decisions LOCKED 21 Oct 2026 by Firoz.**
Branch: design/today-rings-redesign (from origin/design/mvp-mockups-all-screens). Since 22 Oct all mockups (v3 and the surviving originals) live in one folder, `docs/design/mockups/`, indexed in [README.md](README.md); paths below are relative to `docs/design/`.
Brand (Confluence): Soft Coral #FFB0C3 and Pale Lavender #EDEAFF accents, Satoshi 400–700, 4 px spacing, light theme preferred, Today is not a dashboard. Product rules: Indian dates ("Wed 21 Oct"), counts not %, no streaks, no Refresh buttons, 44 pt targets, no ISO/enums, wa.me drafts only, never claim sent.

## Phase 0: Active workout theme
Every TR-11 mockup (v1 and v2, 11 and 11b) is **light**. The rest variant has one navy rest banner. The "dark immersive" text in mockups/DESIGN-NOTES.md decision 7 is stale. See [reviews/PHASE0-ACTIVE-WORKOUT-THEME.md](reviews/PHASE0-ACTIVE-WORKOUT-THEME.md). DESIGN-NOTES decision 7 was corrected to light on 22 Oct.

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

## Principle: trainer mobile = quick jobs only
**Trainer mobile = quick jobs only (Needs you, Sessions, quick logging); history, configuration and deep review live on web/iPad.** Check-in history (the client Check-ins tab) is web/iPad only. The mobile screens 18b/18c were removed.

## Resolved assumptions (LOCKED 21 Oct 2026 by Firoz)
1. Reminders are fixed: 15 min before check-in calls, 45 min before in-person sessions.
2. A client marked Late counts as attended (uses a session).
3. Carry-over of unused sessions on renewal is **on by default** (the coach can turn it off).
4. **Every coach gets the Sessions tab.** Online-only coaches use it to schedule and track check-in calls. They don't see roll-call, logging or packages. The empty state invites adding a call, with a light hint that in-person sessions appear there if they add an in-person client (screens 206, 206b, 207).
5. The web calendar lives **inside Sessions** (no separate nav item).

## Client workspace: Check-ins tab (added 21 Oct)
Search result: the only existing list was the original 162-trainer-web-client-checkins-web.png (removed 22 Oct, replaced by the v3 162). It's weak: a schedule modal covers three bare rows with only Due + Remind/View. The off-brand Figma reference (docs/design/figma/07-checkins-tab.png, removed 22 Oct with the rest of the Figma exports) used % adherence and US dates. There's no iPad, mobile or v2 version. (163/164/198/19/75 are review screens, and 46–50/166–167 are the cross-client inbox.)
- v3 design: summary (cadence "Every Sunday", next check-in, scheduled check-in call, "2 of 3 submitted"), Assign check-in, filter chips (All, To review, Reviewed, Missed with counts) and a list grouped by month, newest first.
- Each row has the date, form, status (To review / Reviewed · outcome / Overdue / Missed / Upcoming), submitted time, key changes ("Weight 88.2 kg · down 0.6 kg"), note preview and linked call. Tapping a row opens the existing review screen.
- Empty and ended (read-only) states.
- Filter chips, in order: All, To review, Overdue, Reviewed, Missed, each with a count (sample: All 7 · To review 1 · Overdue 1 · Reviewed 3 · Missed 1, plus 1 Upcoming). The ended client shows no Overdue chip and no Overdue or Upcoming rows.
- The Overdue row has a red "Overdue · 2 d" tag and a "Remind on WhatsApp" action, which opens a wa.me draft that the coach sends. FitBud never claims it was sent.
- Screens (web/iPad only): 162-…-v3-web, 162b empty, 162c ended, 192b-ipad.

## 22 Oct 2026 (LOCKED by Firoz)
1. **Single mockups folder.** `docs/design/` is the only source of truth: one `mockups/` folder (png, html, tools; `compare/` removed 28 Oct 2026). Frames are replaced in place (same ID, superseded png/html deleted, no versioned folders). Reference-only frames keep a `-ref` suffix (149-ref: flag rules column, future scope).
2. **Client settings is separate from Coaching setup.** Client settings (basic details, subscription & package, payment records, coaching relationship) opens from the client header **⋯ menu** on web and iPad (208, 208b, 209–212, IP-08). Coaching setup (goal, starting point, expectations, check-ins, reminders, coaching mode) lives in Plan › Coaching setup (148, 149, IP-07). No client settings on trainer mobile.
3. **Consistent client tabs:** Overview · Plan · Activity · Progress · Check-ins · History everywhere (TW-09a). No Sessions, Packages or Configure tabs; everything else is in the ⋯ menu.
4. **Check-in standard questions** (171, 171b, 14, 14c): Weight · Body measurements (one question, coach picks from waist, hip, chest, arm, thigh, neck, calf) · Progress photos (front, side, back) · ratings 1–5 for **Energy, Sleep quality, Stress and Hunger**. Hunger is a standard, charted question, not just a suggestion. Standard questions have fixed wording and are charted in Progress (160 set). Body fat is not offered.
5. **Custom measurements are own questions** and are not charted (listed only; answers in check-in review).
6. **Strength charts are in this version** (160e), overriding TW-18 "deferred". Loads are parsed from `actual_load_label` at chart time (kg; lb converted; bodyweight sets chart reps; text such as "RPE 8" is left out with an "n sets not charted" note). New logs use a number keypad with kg default and a Bodyweight toggle (11, 11b, 11c). Backend implementation note: store a derived `load_kg` / `load_kind` when a set is saved and backfill old sets.
7. **Payments are a non-goal; records only.** FitBud never collects payments, sends invoices or reminds clients to pay. Client settings shows payment records for tracking only (209/209b, 211/211b, IP-08). The data model needs **amount, status (Paid / Unpaid), method and date** fields for payment records: backend change later.

## Compare sheets
**Removed 28 Oct 2026** (entire `mockups/compare/` folder deleted for Firoz’s lock review). Historical note only: 22 Oct rounds had P7–P11 (round 1) and P12–P15 (round 2), before vs after; earlier sheets included P1-today-ios/android-states, P2-mobile-review-flow, P3-sessions-mobile, P4-calendar-web/mobile, P5-sessions-online-only, P6-client-checkins-tab-web/ipad, P8-home-side-panel-old-vs-new. Single-source frames remain in `mockups/png/` and `mockups/html/`.

## Screen index
| PNG | HTML source |
|---|---|
| mockups/png/02-trainer-web-home-panel-v3-resolved-web.png | mockups/html/02-trainer-web-home-panel-v3-resolved-web.html |
| mockups/png/02-trainer-web-home-panel-v3-web.png | mockups/html/02-trainer-web-home-panel-v3-web.html |
| mockups/png/04-trainee-today-android-v3-done.png | mockups/html/04-trainee-today-android-v3-done.html |
| mockups/png/04-trainee-today-android-v3-empty.png | mockups/html/04-trainee-today-android-v3-empty.html |
| mockups/png/04-trainee-today-android-v3-partial.png | mockups/html/04-trainee-today-android-v3-partial.html |
| mockups/png/04-trainee-today-android-v3-past.png | mockups/html/04-trainee-today-android-v3-past.html |
| mockups/png/04-trainee-today-android-v3-rest.png | mockups/html/04-trainee-today-android-v3-rest.html |
| mockups/png/04-trainee-today-ios-v3-done.png | mockups/html/04-trainee-today-ios-v3-done.html |
| mockups/png/04-trainee-today-ios-v3-empty.png | mockups/html/04-trainee-today-ios-v3-empty.html |
| mockups/png/04-trainee-today-ios-v3-partial.png | mockups/html/04-trainee-today-ios-v3-partial.html |
| mockups/png/04-trainee-today-ios-v3-past.png | mockups/html/04-trainee-today-ios-v3-past.html |
| mockups/png/04-trainee-today-ios-v3-rest.png | mockups/html/04-trainee-today-ios-v3-rest.html |
| mockups/png/05-trainer-mobile-needs-you-v3-ios.png | mockups/html/05-trainer-mobile-needs-you-v3-ios.html |
| mockups/png/05-trainer-mobile-needs-you-v3-reviewed-toast-ios.png | mockups/html/05-trainer-mobile-needs-you-v3-reviewed-toast-ios.html |
| mockups/png/05-trainer-mobile-needs-you-v3-swipe-ios.png | mockups/html/05-trainer-mobile-needs-you-v3-swipe-ios.html |
| mockups/png/162-trainer-web-client-checkins-v3-web.png | mockups/html/162-trainer-web-client-checkins-v3-web.html |
| mockups/png/162b-trainer-web-client-checkins-empty-v3-web.png | mockups/html/162b-trainer-web-client-checkins-empty-v3-web.html |
| mockups/png/162c-trainer-web-client-checkins-ended-v3-web.png | mockups/html/162c-trainer-web-client-checkins-ended-v3-web.html |
| mockups/png/192b-ipad-client-checkins-v3-ipad.png | mockups/html/192b-ipad-client-checkins-v3-ipad.html |
| mockups/png/200-trainer-web-calendar-v3-web.png | mockups/html/200-trainer-web-calendar-v3-web.html |
| mockups/png/201-trainer-mobile-agenda-v3-ios.png | mockups/html/201-trainer-mobile-agenda-v3-ios.html |
| mockups/png/202-trainer-mobile-add-session-v3-ios.png | mockups/html/202-trainer-mobile-add-session-v3-ios.html |
| mockups/png/202b-trainer-mobile-add-call-v3-ios.png | mockups/html/202b-trainer-mobile-add-call-v3-ios.html |
| mockups/png/203-trainer-web-checkin-review-schedule-call-v3-web.png | mockups/html/203-trainer-web-checkin-review-schedule-call-v3-web.html |
| mockups/png/204-trainer-web-assign-checkin-schedule-call-v3-web.png | mockups/html/204-trainer-web-assign-checkin-schedule-call-v3-web.html |
| mockups/png/205-trainer-mobile-calendar-reminder-v3-ios.png | mockups/html/205-trainer-mobile-calendar-reminder-v3-ios.html |
| mockups/png/206-trainer-mobile-sessions-online-v3-ios.png | mockups/html/206-trainer-mobile-sessions-online-v3-ios.html |
| mockups/png/206b-trainer-mobile-sessions-online-empty-v3-ios.png | mockups/html/206b-trainer-mobile-sessions-online-empty-v3-ios.html |
| mockups/png/207-trainer-web-sessions-online-v3-web.png | mockups/html/207-trainer-web-sessions-online-v3-web.html |
| mockups/png/31-trainer-mobile-review-sheet-v3-all-resolved-ios.png | mockups/html/31-trainer-mobile-review-sheet-v3-all-resolved-ios.html |
| mockups/png/31-trainer-mobile-review-sheet-v3-ios.png | mockups/html/31-trainer-mobile-review-sheet-v3-ios.html |
| mockups/png/31-trainer-mobile-review-sheet-v3-item2-ios.png | mockups/html/31-trainer-mobile-review-sheet-v3-item2-ios.html |
| mockups/png/31-trainer-mobile-review-sheet-v3-resolved-ios.png | mockups/html/31-trainer-mobile-review-sheet-v3-resolved-ios.html |
| mockups/png/IP-05-ipad-group-session-v3-ipad.png | mockups/html/IP-05-ipad-group-session-v3-ipad.html |
| mockups/png/IP-09-trainer-mobile-sessions-v3-ios.png | mockups/html/IP-09-trainer-mobile-sessions-v3-ios.html |
| mockups/png/IP-11-trainer-mobile-rollcall-v3-ios.png | mockups/html/IP-11-trainer-mobile-rollcall-v3-ios.html |
| mockups/png/IP-12-trainer-mobile-group-log-v3-ios.png | mockups/html/IP-12-trainer-mobile-group-log-v3-ios.html |
| mockups/png/IP-13-trainer-mobile-single-log-v3-ios.png | mockups/html/IP-13-trainer-mobile-single-log-v3-ios.html |
| mockups/png/IP-14-trainer-mobile-after-quick-log-v3-ios.png | mockups/html/IP-14-trainer-mobile-after-quick-log-v3-ios.html |
| ~~mockups/png/IP-15-trainer-mobile-package-v3-ios.png~~ | **Retired / removed 28 Oct 2026** (D5) |
| ~~mockups/png/IP-15b-trainer-mobile-renew-package-v3-ios.png~~ | **Retired / removed 28 Oct 2026** (D5) |
| mockups/png/IP-16-trainee-suggest-change-v3-ios.png | mockups/html/IP-16-trainee-suggest-change-v3-ios.html |

Banned-strings check: `cd mockups && node tools/check.mjs` (docs/spec/banned-strings.json over rendered text, device chrome excluded). 21 Oct: 42 files, 0 errors, 0 warnings. 22 Oct (all 75 html in mockups/html): 0 errors, 3 warnings (lock-screen clock on 27-android, 28, 30).

Regenerate: `cd mockups && for p in tools/p*.py; do python3 $p; done && node tools/render.mjs` (generators p1–p6_*.py on fb.py write html/; render.mjs only re-renders `*-v3*` frames; needs the repo node_modules Playwright).
