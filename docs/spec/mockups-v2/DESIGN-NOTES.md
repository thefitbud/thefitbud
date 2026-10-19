# FitBud high-fidelity mockups: design notes

These are the visual targets for every implementation batch. Sources: spec pack `docs/spec/` (00-foundations, 01-product-rules, 02-navigation, 09-demo-data, TW-01/03/04/09/09a, TM-01, TR-01/06, plus the BATCHES.md spec decisions) and the brand package (`packages/tokens`, `packages/brand`).

Build: `node tools/build.mjs` (src → html, inlines Lucide icons, partials and the WhatsApp glyph) → `node tools/render.mjs` (headless Playwright → png/) → `node tools/overview.mjs`. QA: `node tools/check.mjs` (banned-strings.json on rendered text), `node tools/contrast.mjs` (WCAG audit).

## Palette and roles
| Token | Hex | Role |
|---|---|---|
| Deep navy | #1A1248 | Headings and names; web sidebar (depth); trainee "Next up" hero; workout-done dots |
| Indigo | #4527C6 | The only filled primary button colour, links, focus ring, active tab/nav, kcal ring |
| Coral | #FF587D | Accent only: the logo ring and the glow in the sign-in gradient. Never a status or selection colour |
| Pale lavender | #EDEAFF on #4527C6 text | Selected filters/segments, count badges, and the **tinted primary** for repeated row/card actions |
| Ink 900/700/500/200 | #0F1115 / #25262B / #5B616B / #E6E8EB | Body text 700, secondary text 500 (6.2:1 on white), ring tracks 200 |
| Page (web / mobile) | #F3F5FB / #F6F5FB | Canvas; cards are #FFFFFF with a #E7E9F2 border |
| Critical | #FEF2F2 / #B91C1C + octagon-alert | Severity Critical, missed workout |
| Attention | #FFFBEB / #B45309 + triangle-alert | Severity Attention, renewal due/expired, not logged |
| Positive | #ECFDF5 / #047857 + circle-check | Logged, done, coach reviewed |
| Info | #EFF6FF / #1D4ED8 + info | Submitted, asked coach, visible-to-client note |
| Neutral | #F3F4F6 / #374151 + circle-dashed etc. | Active (lifecycle), planned, invited, changed, private, coming soon |
| Rings | kcal #4527C6, protein #1A1248, carbs #7C6CF0, fat #0E7490 | Nutrition only; never good/bad; numbers always beside them |

Every state chip has an icon plus text, with a 1 px tinted border so it holds up on white and tinted surfaces. WhatsApp is always a neutral secondary button with the official glyph colours, never green-filled.

## Type (Satoshi 400/500/600/700, embedded from packages/brand/fonts; tabular numbers on all counts, times and kcal)
- Web: Display 28/36 700 · H1 24/32 700 · H2 18/26 600 · H3 15/22 600 · Body 14/20 · Body-sm 13/18 · Label 13/16 500 · Caption 12/16 500 · Numeral-L 24/28 700 tabular. Display gets −0.02em tracking.
- Mobile: Display 28/34 · H1 24/30 · H2 20/26 · H3 17/24 · Body 16/24 (never below 16 for content) · Body-sm 14/20 · Label 14/18 · Caption 12/16. Exceptions: tab labels 11–12 (platform norm), 12 px metadata captions.

## Spacing, radius, elevation
- 4 px base: 4 · 8 · 12 · 16 · 24 · 32 · 40. Web content padding 32, section gap 24, card header 16/20. Mobile gutter 16, card padding 16, section gap 24.
- Radius: web cards 16, inputs and buttons 10 (small buttons 8), chips 999. Mobile cards 20 (spec decision 3), controls 16, the hero 22.
- Elevation: level 1 `0 1px 2px rgb(26 18 72 / 6%)` plus a border on every card; level 2 `0 8px 24px rgb(26 18 72 / 10%)` for menus and popovers. The trainee hero has a soft navy drop shadow.

## Components used
App shell (navy 240 px sidebar, Honest Week mark, Home/Clients/Check-ins/Templates/More, Help (mailto) and the trainer at the bottom; top bar with page title, ⌘K search and bell) · count tiles as filters · AttentionRow (56 px, fixed columns: avatar+name · plain-words issue + "+N more" · one severity chip · "since N d" · Review · ⋯) · list sections with count badges · WorkspaceHeader (name H1, lifecycle + adherence chips, meta line as separate items, Message on WhatsApp secondary, one primary CTA, ⋯, underline tabs with a badge only on Check-ins) · WeeklyConsistency week strip with counts · compact NutritionRings (web) and full NutritionRings (mobile) · ReasonLine card · activity rows with chips and relative times · side cards (Check-in, Plan, Reminders, Progress sparkline, Renewal, Coach notes with Private/Visible badges) · trainee DateNavigator week strip · Next-up hero · workout card · meal rows with Logged / Up next / Later · coach note card and reviewed signal · TM-01 attention cards · segmented filter chips · iOS tab bar and Android M3 navigation bar · auth forms with a disabled "Coming soon" WhatsApp option.

**Button hierarchy:** one filled indigo primary per screen or card (Sign in, Review issue, Start workout, Send code). When the same primary repeats down a list (Review on every row/card, Mark answered, Review intake), it uses the **tinted primary** (lavender fill, indigo text, 7.55:1), so a list never becomes a wall of identical heavy buttons. Then come the secondary (white, border), tertiary (text link) and ⋯ overflow.

## Data and time
Sun 18 Oct 2026. Web at about 9:40 am; trainee Today at 7:30 am (early-morning meal logged at 6:42 am, breakfast at 8:00 am up next, the rest later; workout planned for 6:30 pm). Aarav's meal kcal add up to the 1,850 kcal plan (50 + 420 + 560 + 180 + 640). Rohan's week (2 of 4 workouts, 18 of 25 meals, missed Tue and Thu, lunch and dinner not logged Fri) matches his Home row ("Missed 2 workouts (Tue, Thu) +2 more") and his trainee-side numbers. Ended clients (Kavya, Nikhil) never appear.

## QA run on the final files
- Banned strings (`banned-strings.json`, rendered text plus title/aria-label/placeholder/alt, device status bars excluded): 12 files, 0 errors, 0 warnings. The checker was confirmed to catch %, ISO, snake_case and 24 h test strings.
- Contrast audit on solid backgrounds: no text below AA. Text on gradients (sidebar, hero, sign-in panel) was checked by hand: white at 64–84% on navy/indigo is ≥ 5:1.
- No clipped text and no horizontal scroll at the target viewports.

## Deviations from the spec (minimal, with reasons)
1. **Demo surnames.** The seed's display names are state placeholders ("Rohan Slipping", "Aarav Ontrack"). The mockups use realistic surnames (Rohan Mehta, Aarav Shah, Rahul Verma…), and the 8-row list adds clients the seed doesn't have (Arjun, Neha, Priya, Karthik, Tanvi, Varun, Siddharth) to show a full list. Priya Sharma is used as a client, as in the guide's examples, even though the seed's "Priya" is a second trainer.
2. **Home layout.** The guide's section order is kept in the main column (Needs attention → Asked you on WhatsApp → Reviewed, still open → Getting started → Re-engage). **Check-ins to review** and **Renewals** sit in a 320 px right rail, so they're visible without scrolling at 1440. On narrower widths they should fall back into the single column in guide order.
3. **"Recent activity" on Home.** You asked for it, but it isn't a TW-04 section. It's a quiet, read-only rail card in client time and easy to drop.
4. **Greeting.** TW-04.11 says H1 "Today" with no greeting line. The primary mockup follows the spec (eyebrow "Sun 18 Oct", H1 "Today", one factual summary line). `02b-…-greeting-variant.png` shows "Good morning, Rahul" for comparison. The trainee Today greeting ("Good morning, Aarav. Here's your day.") is from TR-06.
5. **Workspace header label.** The guide's secondary button is "WhatsApp". It reads **"Message on WhatsApp"** as you asked, still neutral secondary. A "Week 6" meta item was added because you asked for the week.
6. **Overview "open items".** By contract the Needs attention card shows **one** open item (the most severe), not a backlog. The submitted check-in is surfaced in the Check-in side card and the tab badge.
7. **Trainee hero + next meal.** TR-06 has a hero and also a "Next meal to log" card inside Nutrition. When the hero *is* the next meal (breakfast, within 60 min), the nutrition card shows the meal-slot list (state per slot) instead of a second identical action card. The hero's primary is a white button on navy, the only non-indigo primary, because indigo on navy lacks contrast.
8. **Sign-in gradient.** The guide gradient is indigo → coral. It's rendered as navy with an indigo glow and a coral corner, so the panel doesn't read as a 2016 gradient. The same two brand stops are used. The web panel adds a small static "Needs attention" product glimpse.
9. **Trainee sign-in.** It's delivered as two iOS screens: password (default) and "Sign in with a code" (Email selected, WhatsApp disabled with "Coming soon" and the guide note). The spec models them as separate states, and putting both on one screen would break "one primary per screen".
10. **TM-01 title.** "Attention" (spec decision 2), with the guide's segments "Needs you · Asked · Check-ins". The full-width Review uses the tinted primary (see button hierarchy). The swipe actions aren't visible in a static frame; the ⋯ fallback is.

## Open founder decisions
- **Navy sidebar vs light sidebar** (compare `02-…-home.png` with `02c-…-light-sidebar-variant.png`). Navy gives depth and brand presence; light is closer to Linear/Stripe and makes the content the hero. I recommend navy.
- **Home greeting**: spec "Today" (recommended for a triage screen) vs "Good morning, Rahul" (`02b`).
- **Recent activity on Home**: keep it as a quiet rail card, or drop it to stay strictly to TW-04.
- **Tinted primary** for repeated row actions, as a formal Button variant (Batch 0.17).
- **Demo seed names**: retitle the seed to realistic surnames so the evidence screenshots look like the product.

## Mobile set 2 (screens 07–19, iOS 393 × 852 @3x)
Files: `src/<name>-ios.html` → `html/` → `png/07…19-*.png`; contact sheet `overview-mobile-2.png`. One shared stylesheet, `html/m2.css` (on top of `tokens.css` + the `m-style` partial); new partials `diet-body`, `tabs-tr`, `tabs-tm` (tab bars with an `active` param; the approved Today/Attention partials are untouched). Build: `node tools/build.mjs && node tools/render2.mjs && node tools/overview2.mjs`. `build.mjs` now follows Lucide alias re-exports (e.g. `history`). QA: `check.mjs` 25 files, 0 errors, 0 warnings; `contrast.mjs` all OK; every visible tap target ≥ 44 pt.

Story: trainee **Rohan Mehta** (coach Rahul Verma), the same numbers as his web workspace: 86.4 kg, −2.1 kg since Mon 7 Sep, 1,950 kcal and 4 meals a day, week 6, missed Tue and Thu workouts, Lower body B done Sat in 52 min. Workout screens are Sat 17 Oct, the check-in form is Fri 16 Oct, Diet / Notifications / Progress / More are Mon 19 Oct, and the trainer screens are Sun 18 Oct at 9:41 am.

### Where set 2 differs from the spec
1. **Trainee is Rohan, not Aarav.** The 09 capture accounts use Aarav for TR-10…TR-20. Rohan's slipping week is what exercises the late-log, missed and closed states. Today (04) still shows Aarav.
2. **TR-07 "Closed by Rahul" on today's list.** The spec only describes locking for *past* meals. Here today's 8:30 am breakfast went overdue and Rahul resolved it, so it's locked in today's list. This makes Diet a Mon 19 Oct screen.
3. **TR-07 MealCard actions.** "Eaten as planned" (56 pt, indigo) and "Something different" sit side by side, and "Something different" is a secondary button rather than a text button. ⋯ moved into the card header. The day summary is a kcal ring plus macro bars with numbers ("26 of 125 g"), not four rings.
4. **TR-08.** "Log what I ate" is a tinted row button, so **Save** stays the sheet's only filled primary. Photo is one camera button (Camera or Gallery is chosen in the system sheet).
5. **TR-26** is shown with the quantity sheet open, which covers the pinned total bar. The sheet repeats the total instead ("Lunch total becomes 610 kcal · plan 620").
6. **Tab bar hidden** on modal or immersive flows: active workout, workout summary, check-in form, food search and TM-06 (its sticky review sheet takes the bottom). Notifications keeps the bar with Today active.
7. **TR-11** is a dark, immersive screen. Elapsed time and rest are in words ("24 min", "58 seconds left") rather than m:ss, so no `24h-time` warnings. Session RPE appears on TR-12 as "7 of 10 · How hard it felt".
8. **TR-13** puts check-in history on Progress (asked for; not in TR-13's list). Measurements is one row with Log, and Photos and Compare are below the fold.
9. **TR-14** groups the form into 3 steps (Body and photos · Your week · Reflection) before Review → Send to Rahul. A draft-saved line sits under Continue.
10. **TR-15**: the relative time is in the row's subline, with only the unread dot on the right.
11. **TR-20**: the Steps row is hidden (`steps_enabled` off). "Ask coach on WhatsApp" lives in the My coach card, with "You press Send" helper text. Past coaching uses an invented "Aditi Rao · Mon 4 May – Fri 31 Jul". Help (with the one-day reply promise), Privacy and Sign out are below the fold.
12. **TM-02**: the "On track" and "Reviewed, still open" chips are plain-word states, not core labels; check them against `labels.ts`.
13. **TM-03**: "Edit plan on web" is an icon button next to WhatsApp and Nudge…. Recent activity and Coach notes are below the fold. There's no timezone badge, because Rohan is in IST.
14. **TM-06**: the outcomes are Acknowledged · Needs follow-up · Adjust coaching, and the switch reads "Visible to Rohan". Photos and "Since last check-in" sit under the sticky sheet (they're there when you scroll).

## Set 3 changes (19 Oct 2026)
- 08 is now a three-option sheet (Ate out / Log it myself / Changed the portion). It replaces the spec's chips and the Smaller/Bigger portion control. 08b = portion change, 08c = ate out, 09 = library search (the quantity sheet is gone; you set quantity with an inline stepper).
- 07b: the log is saved first and the photo prompt is shown inline. The Undo snackbar was dropped because it covered the Camera/Gallery buttons.
- 10b, 11, 11b hide the tab bar (detail and focus screens). 11/11b are light so they match the rest of the trainee app and stay readable in gym lighting; dark is kept only for full-screen rest timers if wanted later.
- 11 logging: a set table (previous · kg · reps · check), prefilled from the plan, one tap to confirm. A 64 px log bar sits in the thumb zone and the rest band starts automatically.
- 25 is shown over the 5:40 pm Diet. The 26 button sits above the tab bar.
- Compare: the built captures mix accounts and branches (ma = Aarav, mb = Rohan). TR-02/05/09/18/23 were recaptured on cursor/mb-trainee-workout-progress-c688, then db:reset was run.

## Set 4 · notifications (19 Oct 2026, 27–30)
- 27 Live Activity (TR-21): exercise, "Set 2 of 3 done", 58 s rest countdown, +30 s / Skip rest. The spec's optional "Done" button is not shown. 27b: expanded Dynamic Island plus compact pill.
- 28 meal push: P-MEAL copy verbatim; actions Eaten as planned (background, logs via outbox), Snooze 30 min, Open Diet. "1 more from FitBud" shows grouping. No food names.
- 29/29b in-app banners over Today (a banner is shown only while the app is open): meal reminder and coach note ("Tap to read it on Today"; note text never shown). Today behind is the static 7:30 demo, so its next-up card differs from the banner's Lunch (cosmetic).
- 30 lock screen: P-CHK "Weekly check-in is ready" plus P-NOTE "Rahul has a note for you!". Text only, no % or streaks, nothing auto-sent; wording from 05-notifications.md.
- New CSS: html/l3.css. Banner buttons are 44 pt tinted/primary pairs. The lock-screen clock has no am/pm, as on iOS (check.mjs 24h warning is expected).
