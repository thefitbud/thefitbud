# FitBud trainee mobile: gap audit and v2 mock plan (Phase A)

Sat 14 Nov 2026 · Grok Bot · light mode · iPhone 15 (393×852 @3x)

## Sources compared

- `design-figma/screen-inventory.md`: trainee rows TR-01…TR-26 and W-xx, plus the shared system rows.
- `thefitbud/docs/design/mockups/png`: 306 old PNGs, including the IP-* and lockscreen sets.
- `fitbud-spec/docs/spec/mockups` and `docs/spec/mobile/TR-*.md`.
- `design-redesign/workout/png`: W-00…W-25.
- `design-bench`.
- `w11-review/device-findings-13nov.md`: 10 device findings.
- Reference patterns from Hevy (workout log), MFP (diet/search) and Everfit (coach-led plan), filtered through `v1/union-map.md`. No reference fonts, icons or artwork were copied.

## Cross-cutting gaps in the existing mocks

| # | Gap | Where seen | v2 fix |
|---|---|---|---|
| G1 | Mixed type systems: Satoshi in the old mocks, Inter in the redesign. Sizes go from 9 to 34 pt with no scale | old mockups/png | One Inter scale (v1 tokens) plus one new numeric token, `n-xl`, in `src/kit.css` |
| G2 | Two tab bars: a flat bar in the old mocks, a capsule in the redesign | all | Floating capsule, the same on every tab screen |
| G3 | Demo data drifts: Rahul vs Rohan, Sun 18 Oct vs Sat 14 Nov, different kcal goals | old vs redesign | One dataset: Aarav, Rahul Verma, Sat 14 Nov, 1,850 kcal, P110/C210/F55, Lower body B |
| G4 | Density is uneven: set rows 40–56, meal cards 56–88, mixed margins | old mocks | 4 pt grid, 16 margins, set row 48, meal card 62 |
| G5 | Missing states: loading, refresh error, offline, empty, unsent on many tabs | Today, Diet, Progress, More | Each tab now has loading/empty/offline/error states (below) |
| G6 | iOS sheets open over a grey page sheet (device #4) | old sheets | One sheet primitive: scrim plus a white sheet with a grabber, no page sheet behind |
| G7 | Duplicate entry points: global +, a Today log button, a header meal-plan button, a check-in weight field | old Today/Diet/Check-in | Union rules: the meal card is the only log entry, the meal-plan button is hidden for MVP, weight is logged only in Progress |
| G8 | Ask coach appears in 4+ places with different copy | old workout/diet | One Ask Rahul sheet (TR-18), reached from the exercise ⋯ and the meal "Something different" sheet |

## Per-area audit

### Onboarding / auth (TR-01–05, TR-22)

| Screen | Existing mock | Gaps | v2 |
|---|---|---|---|
| Sign in (password default) | old 01 is code-first | Conflicts with the TR-01 spec (password by default); no +91 prefix | TR-01a, follows the spec |
| Wrong password / rate limit | not mocked | Missing error states | TR-01e, TR-01f |
| Code sign-in (request, entry, expired) | partial | WhatsApp not marked "Coming soon"; no resend timer or expired state | TR-01b, c, g |
| Set new password | missing | — | TR-01d |
| Invite accept / expired | 02 only | No expired-token copy | TR-02a, b |
| Intake | dense form, kg/lb toggle | India defaults to kg; the toggle adds noise | TR-03, kg only |
| Waiting for coach | ok | Style drift | TR-04 |
| Reminder setup | quiet hours editable | Editable quiet hours is Later | TR-05, fixed 10 pm–7 am with an IST line |
| Ended coaching / reactivation | missing | — | TR-22a, b |
| AUTH-NET offline error (device #2) | raw error screen | — | Covered by the generic error (TR-21) and the offline banners |

### Today (TR-06)

| Screen | Gaps | v2 |
|---|---|---|
| Default | Old Today had log buttons (a second logging home); the week strip didn't show past or future days | TR-06a/a2 is a glance only; "Up next" links to Diet |
| Rest / past / future day | Not mocked | TR-06b, c (read-only, "Log late"), d (plan preview) |
| Offline / loading / refresh error / in-app banner | Not mocked | TR-06e–h |

### Workout (W-xx, TR-10)

| Screen | Gaps (incl. device #7, #9) | v2 |
|---|---|---|
| Workout tab: not started / in progress / done / rest / no plan / missed | Tab had no in-progress or done state, so it duplicated the minimised bar | W-01a–c, TR-10a–c. The day card replaces the minibar on this tab |
| Active log, start / mid / end of list | No finish early, no ⋯, can't jump between exercises, pause in the Back position (device #9) | W-02, W-03, W-03b. Collapsed done exercises can be tapped to jump |
| Keypad | System keyboard covered the set row | W-04: custom pad with ±2.5, Next, Log and Rahul's target in the header |
| Rest timer | Header timer and bar both shown | W-05a/b, rest bar only (union) |
| Skip / delete set | Missing (device #9) | W-08 swipe actions |
| Exercise ⋯ menu | Missing | W-09: How to, History, Replace, Ask Rahul, Skip, Remove |
| PR moment | PR confetti blocked logging | W-12: a non-blocking banner plus a PR tag on the set |
| Edit / undo a logged set | Missing (device #9) | W-13 sheet |
| Discard / finish early | Discard sat on the minibar; no early finish | W-15 dialog (discard isn't on the minibar), W-16 finish-early sheet listing what isn't logged |
| Summary / shared | Stale week dots (device #6); no "changes from plan" | W-17a: changes Rahul sees, optional effort and a note. W-17b: week dots refreshed |
| Resume after kill / paused / offline | Keep-awake crash (device #3); no resume | W-18, W-19 (paused banner), W-20 |
| Add exercise | Generic library first | W-21a: Rahul's picks first. W-21b: tagged "Added by you" |
| Minimised bar | — | W-14, shown over Diet |
| Exercise detail (How to / History) | How-to opened Ask coach (device #9) | W-26, W-27 |
| Live Activity "0 kg × 0" (device #7) | Live Activity is Later | Not mocked. Note for build: don't show a bodyweight line as 0 kg |

### Diet (TR-07, TR-08, TR-26)

| Screen | Gaps (incl. device #5, #8, #10) | v2 |
|---|---|---|
| Day | Ring number overflowed and macro labels wrapped (device #8); header meal-plan button | TR-07a: the ring fits 4 digits, macros fit on one line, no header button |
| Eaten as planned | No undo | TR-07b toast with Undo |
| No meals / offline / load error | Not mocked | TR-07c, d, i |
| Over budget | Ring went past 100% | TR-07e: red overflow arc, "kcal over" |
| Locked meal | "Closed + Change" contradiction (device #8) | TR-07f: lock and "Closed by Rahul", no Change button |
| Logged meal edit / delete | Not mocked | TR-07g sheet, TR-07h confirm |
| Something different | Ate out and Changed the portion collapsed together in one sheet (device #5) | TR-08a: three distinct choices plus Ask Rahul |
| Changed portion | Gram-only steppers | TR-08b: katori / roti / bowl in ½ steps, total vs plan |
| Ate out | Old 08c is free text with no kcal | TR-08c: exact kcal number only, optional note |
| Food search | + gave no feedback (device #10) | TR-26a default (plan first, then recent), TR-26b ✓ state, count, toast and an "In this log" tray |
| Food detail | No Indian units | TR-26c: katori / cup / grams |
| Search empty / offline | Missing | TR-26d: falls back to Ate out or Ask Rahul |

### Check-in (TR-14)

Old 14 was a single long form and asked for weight, which made a second weight home.

v2 is three steps: questions (TR-14a), photos (TR-14b, optional) and review → "Send to Rahul" (TR-14c). Weight is filled in automatically from Progress. Also added: sent (TR-14d), offline queued (TR-14e), overdue on Today (TR-14f) and reviewed, read-only with Rahul's reply (TR-14g).

### Progress (TR-13)

Device #1: the title showed twice, the range pill was clipped, and month labels repeated.

v2: one large title, a full-width range control and dated x-labels (TR-13a), an empty state (TR-13b), and a Log weight sheet with a decimal pad (TR-13c). Measurements are Later.

### Notifications (TR-15)

Added: inbox grouped Today / Earlier with unread dots (TR-15a), empty (TR-15b) and a lock-screen push (TR-15c).

### More (TR-16, TR-20, TR-25)

The old More mixed units, theme and language, which are all Later. v2 mocks:

- More root with a coach card (TR-20a)
- profile (TR-20b), account (TR-20c), delete confirm (TR-20d)
- reminders with fixed quiet hours (TR-16a) and with phone notifications off (TR-16b)
- steps source (TR-25)
- help: mailto plus Rahul (TR-20e)
- sign out with unsent items (TR-20f)

### Sync / system

Added: sync status sheet (TR-19a), conflict (TR-19b), item unavailable (TR-23), Ask Rahul sheet (TR-18), session expired (TR-24) and generic error / not found (TR-21).

## Deferred (Later; not mocked)

Set types, superset, reorder, plate calculator, duration picker and edit time, rest expanded (W-06), share card, PR Cheer, filters, create exercise, Live Activity, copy from, nutrition detail, barcode / voice / meal scan, meal photo, meal-plan view, meal picker in search, units / theme / language, editable quiet hours, FAQ, measurements and dark mode.

---

# Phase B: trainer mobile gap audit

Sources:
- 18 trainer-mobile rows in `screen-inventory.md` (TM-01…TM-09, plus Everfit-derived rows)
- `union-map.md` T1–T11
- specs `TM-01…TM-09.md`
- old mocks (`05-trainer-mobile-needs-you-v3`, 17–19, 31–61, 73–75, IP-09…14, 201–206)
- demo seed `09-demo-data.md`: Rohan slipping, Meera acknowledged, Sneha awaiting review, Vikram onboarding, Aarav on track, Deepak in Dubai, Farhan with reminders paused, Ishita with push off, Kavya and Nikhil ended, Anita pending, Karan dual-role. Priya and Neha were added as trainees, as asked.

## Cross-cutting

| # | Gap in existing trainer mocks | v2 fix |
|---|---|---|
| B1 | Needs you used segments (Needs you / Asked / Check-ins), so only one group was visible and off-plan nutrition had no home | A 2×2 summary of all four groups (Missed, Asked you, Check-ins, Off plan) sits above the fold. Groups by reason follow, then Wins, then "Reviewed, still open" (TM-01a/a2) |
| B2 | The spec card has a full-width 48 pt Review button, so 4 groups can't fit on a phone | Compact card with one trailing action (Review / Reply). Swipe right = Mark reviewed, swipe left = Nudge / More (TM-01b) |
| B3 | Five tabs including Sessions (in-person agenda), which isn't in the inventory or the spec IA (4 tabs) | 4 tabs: Needs you · Clients · Check-ins · More. Sessions / roll-call (IP-09…14) is not mocked; flagged for Phase C |
| B4 | Raw enums and chips without icons ("active · overdue meal") | One status-chip set with an icon and a human label (`SEV` in `kit_trainer.py`) |
| B5 | Manual Refresh buttons (spec QA) | Pull to refresh only; the error state says "pull down" plus Try again |
| B6 | Mixed demo dates (18 Oct) and names | 14 Nov dataset shared with the trainee mocks: Aarav's RDL ask and PR, and his lunch change, are the same events seen from the coach side |

## Per area

| Area | Existing | Gaps | v2 screens |
|---|---|---|---|
| Needs you (TM-01) | 05 v3, 43–45 | No off-plan group, no wins, no loading state, no counts summary | TM-01a, a2, b swipe, c reviewed + Undo, d all caught up, e loading, f offline, g error |
| Exception review / nudge / resolve (TM-04) | 31–41 | Verbs unexplained, no quiet-hours warning on nudge, no lock helper, no reviewed-still-open state | TM-04a review, b nudge sheet (templates + WhatsApp preview), c nudge in quiet hours, d resolve sheet (outcome, private note, lock helper), e reviewed-still-open, f resolved read-only, g already resolved / not found, h offline, i ended read-only, j ⋯ menu, k note composer (shared / private) |
| Asked you (TW-32 on mobile) | none on mobile | No mobile ask view, no pain caution | TM-10a ask with context and pain caution, TM-10b answered |
| Clients (TM-02) | 17, 73 | Everfit-style Connected / Offline counts; Refresh button | TM-02a list with roster-count filter chips, b search, c ended, d invites, e empty, f offline, g loading |
| Activity (TM-09) | 62–72 | — | TM-09a feed by day, b meal planned-vs-ate sheet, c filtered empty |
| Client detail (TM-03) | 18, 74 | No weekly dots, no reminders line, no time zone, no notes, dev copy "Plan builder stays on web" | TM-03a overview, b scrolled (activity, reminders, notes, safety, Edit plan → copy web link), c time zone (Deepak), d ended, e reactivate sheet, f client info (goal, limitations, intake), g onboarding (Vikram), h error |
| Session view (TW-17 / W-25b on mobile) | none | — | TM-11a sets vs plan, PR, "+1 set" and "Added by Aarav", trainee note, effort. TM-11b finished early / skipped |
| Diet day review | 159 (web only) | No mobile view | TM-12a planned vs actual per meal, TM-12b ate-out meal sheet |
| Check-ins (TM-05/06) | 46–50, 19, 75 | No compare, no reply composer, no "started not sent" | TM-05a–d, TM-06a compare + photos, b reply (marks reviewed), c reviewed + Undo, d started-not-sent → Nudge, e offline |
| Coach logs in person (inventory row) | IP-13/14, DS8 | — | TM-15a meal, TM-15b workout, reusing the trainee editors with a "Logging for Meera" banner |
| More / notifications (TM-07) | 51–58 | — | TM-07a–g, TM-13a lock-screen pushes, TM-13b in-app banner |
| Role (TM-08) | 59–61 | Dev copy "Trainee daily execution" | TM-08a two role cards + Remember, b unsupported role, c switch sheet (coach → client), d client-view More with "Switch to coach view" |

## Trainer items not mocked

- **Stays on web:** plan builder, nutrition builder, assign, templates, the Library tabs (inventory rows marked "plan building stays on web", T7), invite / add client (TW-07), edit client profile (T10), "Add to plan" from a session.
- **Not MVP:** the Everfit-style client Others switchboard. It's replaced by Overview sections plus one "Client info" push (TM-03f), which carries the MVP safety field Limitations / injuries (T5).
- **Deferred:** PR Cheer, the highlights grid and badges (T6 Later).
- **Not applicable:** a separate trainer notification inbox. Needs you plus Activity cover it.
- **Not in the inventory, flagged for Phase C:** Sessions / agenda / roll-call / group log (old IP-09…14, 201–206).

## Phase C — tap-coverage audit (14 Nov 2026)

Method: `src/taps.py` extracts every tappable on all 180 mocks (1,541 taps) → `src/tapmap.py` resolves each to a screen / back / state / external / Later / inert → **0 unresolved**. Final: screen 588, state 681, back 125, inert 100, external 35, Later 11.

| # | Source mock · element | Missing screen → mocked as |
|---|---|---|
| 1 | W-03 · exercise ⋯ › Note | W-10-exercise-note |
| 2 | W-03 · exercise ⋯ › Replace | W-22-replace-exercise |
| 3 | W-03 · exercise ⋯ › Skip | W-09b-exercise-skipped |
| 4 | TR-07a · planned meal tap | TR-07j-planned-meal-detail |
| 5 | TR-15a · "Plan updated" notification | W-01d-plan-changed-banner |
| 6 | TR-13a · Check-in history | TR-13d-checkin-history |
| 7 | TR-13a · Photos | TR-13e-progress-photos |
| 8 | TR-20b / TM-07d · Change password | TR-20g-change-password (shared) |
| 9 | TM-01a · Off-plan diet card | TM-04l-off-plan-review |
| 10 | TM-09a · Client filter | TM-09d-client-picker |
| 11 | TM-03a · ⋯ | TM-03i-client-menu (incl. Log in person entry → TM-15a) |
| 12 | TM-03a · Nudge… | TM-03j-nudge-pick-item |
| 13 | TM-05a · Reviewed filter | TM-05e-checkins-reviewed |
| 14 | TM-06a · Photos › Compare | TM-06f-photo-compare |
| 15 | TM-05e · reviewed row | TM-06g-checkin-reviewed-readonly |
| 16 | TM-04b · Send nudge (success / limit / push off) | TM-04m, TM-04n, TM-04o |

Nudge correction: Nudge = push notification (helper "Sends {firstName} a push notification"); trainee side shows it on TR-15a and TR-15c lock screen. No new WhatsApp entry points added.

Later (marked, not mocked): reminder time editing · past-coaching history · meal picker · backdating weight · change mobile/email · coach intake answers on mobile (web TW-10) · invite management (web). In-person sessions, agenda and roll-call: **On hold, not mocked**.
