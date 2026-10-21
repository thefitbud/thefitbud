# FitBud mockups · design audit (21 Oct 2026)

Scope: all 226 PNGs in `png/` (01–30 approved baseline, 31–199 batch frames, IP-01–IP-10 in-person set). Every frame was viewed (contact sheets of 4 web / 8 mobile frames at readable size, plus full-size checks of the frames in question). Baseline style = frames 01–30: dark indigo sidebar, Satoshi type, white cards on `--page-web`, chips with icons, one primary CTA per surface, coach Rahul Verma, demo day Sun 18 Oct.

Legend: **KEEP** stable, matches baseline, reference quality · **ADJUST** right screen, needs a fix · **REDO** same screen drawn in a contradicting way, redraw to the canonical design · **DELETE** duplicate, rejected variant or unstable (blank/fake background).

## 1. Trainer web

| Screen (spec) | Frames | Verdict | Notes |
|---|---|---|---|
| Sign in TW-01 | 01 | KEEP | Reference. |
| Home triage TW-04 | 02, 02-full | KEEP | Reference for list density, chips, right rail. |
| Home variants | 02b, 02c | **DELETE** | Already marked "rejected variants" in INVENTORY; two more Homes that disagree with 02. |
| Home states | 134 undo toast, 135 all clear, 186 offline, 190 ⌘K | KEEP | Same Home as 02. |
| Bell | 123 | KEEP | |
| Onboarding TW-02 | 125–128 | KEEP | Own full-bleed wizard; entry = first sign-in. |
| Exception drawer TW-05 | 129–133, 199 | KEEP | Consistent drawer over 02. 131 overflow menu says "Adjust plan" – fine. |
| Client workspace Overview TW-09 | 03, 03-full | **ADJUST** | Reference style, but **This week** has no prev/next week or day navigation (feedback). Add ‹ › week, ‹ › day, selected-day stats. |
| Overview note composer TW-34 | 188, 189 | **REDO** | Replaces the whole Overview with a "Notes / Next up" layout that contradicts 03. Composer must be a drawer opened from 03's *Coach notes › Add note*. |
| Clients roster TW-06 | 136–140 | KEEP | Filters exist (Status, Adherence, Goal, Renewal, Current/Ended). Rows are the documented entry to invite and onboarding pages. |
| Add client TW-07 | 141–143 | KEEP | |
| Pending invite TW-08 | 144 | **REDO** | Floating card with no workspace header, no tabs, no timeline; looks unlike 146/147 which are the next states of the same client. Entry point undocumented. |
| Invite revoke | 145 | **REDO** | Modal over a blank placeholder background (unstable). Redraw over the new 144. |
| Onboarding review TW-10 | 146 | KEEP | Reference for the onboarding layout (main card + Next step + Timeline). |
| Intake not submitted | 147 | **ADJUST** | Overlaps 144 (both are "client hasn't done it yet, remind on WhatsApp"). Align to one onboarding page: same header, same stepper (Invited → Joined → Intake → Ready). |
| Coaching configuration TW-11 | 148, 149 | **REDO** | 148 is drawn on the *Overview* tab, 149 on the *Plan* tab with a different accordion; 149 shows only Nutrition/Workout/Reminders. Both lack **Goal (short + detailed), basic details and Expectations** that drive exceptions/attention flags (feedback). |
| Plan tab TW-12 | 150 | **REDO** | Same tab as 149 but a totally different layout (stacked plan rows, flat version table); no type/status filters. |
| Plan tab empty | 151 | **ADJUST** | Align header/sub-tabs to the new Plan tab. |
| Builders TW-13/14 | 152–154 | KEEP | |
| Assign / scope / partial failure TW-15/16 | 155–157 | KEEP | Modals over dimmed workspace – acceptable. |
| Activity TW-17 | 158, 159 | KEEP | Has All/Meals/Workouts/Weight + week filter. |
| Progress TW-18 | 160, 161 | KEEP | |
| Client check-ins / review TW-19/20 | 162–164 | KEEP | |
| History TW-21 | 165 | KEEP | |
| Check-ins inbox TW-22 | 166, 167 | KEEP | |
| Templates hub TW-23 | 168 | **REDO** | Owner tabs + a single "Type" dropdown; no explicit Workout/Nutrition/Forms type filter, no status (published/draft). Must match the plan-list filter pattern. |
| Templates empty | 169 | **ADJUST** | Same filter bar as new 168. |
| Form builders TW-24/25 | 170, 171 | KEEP | |
| Libraries TW-26 | 172, 173 | KEEP | |
| Use / fork TW-27 | 174, 175 | **REDO** | Modals over an empty page (no templates list behind) – unstable. Redraw over new 168. |
| Settings TW-28/29 | 176, 177 | KEEP | |
| End / ended / reactivate TW-30 | 178–180 | KEEP | |
| Reminder responsiveness TW-31 | 181 | **ADJUST** | **Fake content:** "Usually opens · Around 9:30 pm" and the lightbulb tip "Rohan rarely opens 8:15 pm workout reminders. A 6:00 am reminder may suit his week better." – invented insight, not in TW-31 (spec = deterministic label + counts + preferred workout time + quiet hours). |
| Asked coach TW-32 | 182, 183 | KEEP | |
| System states TW-33 | 184, 185, 187 | KEEP | |
| iPad | 191, 193–198 | KEEP | 192 **ADJUST**: client overview at 1024 drops the week strip and uses a different card set than 03 → align (week card with nav). |
| In-person set | IP-01–IP-10 | KEEP (out of MVP scope) | IP-07 shows a separate "Configure" tab; superseded by Plan › Coaching setup when the in-person set is promoted (noted as open question). |

## 2. Trainee mobile

| Screen | Frames | Verdict | Notes |
|---|---|---|---|
| Today TR-06 | 04-ios, 04-ios-full, 04-android | **REDO (one design)** | Three Today versions plus 94/97/113/115/29/29b/104 each draw Today differently (hero meal card dominating, rows-only, steps-only). Feedback: one Today = rings on top (kcal + macros, steps when connected) → today's workout → meals with the next meal expanded. |
| Today · steps | 94 | **DELETE** | Another Today layout (steps chart + workout, no meals). Steps become a ring in the canonical Today. |
| Today · full scroll | 04-ios-full | **DELETE** | Long variant of the old hero layout. Canonical 04 iOS covers the screen. |
| Today states | 96 loading, 97 all done, 104 offline (Android), 89 ended | 96/97/104 **REDO**, 89 KEEP | Must use the canonical layout. |
| Today under banners | 29, 29b, 113, 115 | **REDO** | Banners over the old hero Today / rows-only Today. Redraw over canonical Today. 115 back-off pause is spec'd (P-PAUSE, TR-16) – not fake. |
| Sign in | 06, 06b, 103 | KEEP | |
| Diet TR-07 | 07, 07b, 86, 102 | KEEP | |
| Something different / portion / ate out / search | 08, 08b, 08c, 09 | KEEP | |
| Workout | 10, 10b, 11, 11b, 12 | KEEP | |
| Workout not today | 99 | **REDO** | Sheet over a grey placeholder background (unstable). Redraw over Workout tab 10. |
| Progress, check-in | 13, 14, 100, 101 | KEEP | |
| Notifications inbox | 15, 98, 114 | KEEP | |
| More, reminders, quiet hours, meal times, sync | 16, 76–88 | KEEP | |
| Invite / intake / waiting / reminder setup | 20–23 | KEEP | |
| Meal plan, ask coach, unavailable | 24–26 | KEEP | |
| Ended / reactivation | 89–92 | KEEP | |
| Steps setup | 93, 95 | KEEP | Entry: More › Steps. |

## 3. Lock screen, Live Activity, notifications

| Screen | Frames | Verdict | Notes |
|---|---|---|---|
| Workout Live Activity | 27 (lock, compact ✓), 27b ("Notification Centre · expanded" with kg/reps steppers under a Dynamic Island), 27c (compact, rest) | **REDO 27b, ADJUST 27/27c** | Two unrelated designs: a one-tap ✓ card and an editable card in a different context with different header. Canonical model: **one Live Activity** – *collapsed* (lock screen, exercise · set · kg × reps · ✓ Log set) and *expanded* (long-press, same card grows to kg/reps steppers + Log set). Frames labelled as states of the same activity. |
| Android workout notification | 27-android | KEEP (labelled expanded) | Android ongoing notification already shows the expanded content; documented as the Android equivalent. |
| Push frames | 28, 30, 105–112, 116–122, 124 | KEEP | 30 "Rahul has a note for you!" – fine copy. |

## 4. Trainer mobile
31–75, 05, 17–19: **KEEP**. Consistent iOS style, sheets drawn over real screens, entry points clear (Attention list → review). 18 client status shows a "This week" strip – mobile, no nav needed in MVP (open question).

## 5. Fake / assumption content found
| Frame | Content | Fix |
|---|---|---|
| 181 | "Usually opens · Around 9:30 pm"; tip "Rohan rarely opens 8:15 pm workout reminders. A 6:00 am reminder may suit his week better." | Remove; show spec labels/counts only. |
| 188 | Note "Asked about protein powder. Suggested whey isolate…" | Frame redone; note copy replaced with plan-related notes. |
| 04/29/29b hero | none fake, but hero "Next up · in 30 min" dominates | Replaced by canonical Today. |
No AI features, scores or predictions were found elsewhere (grep of all sources for AI/insight/suggest/predict/likely/smart).

## 6. Missing / unclear entry points
| Frame | Problem | Decision |
|---|---|---|
| 144 invite detail | No route documented; overlaps 147 | Clients roster row with status *Invited* (or Home › Getting started row) → `/clients/:rid` shows the onboarding page in state 1. |
| 147 / 146 | Same page, later states | Same row (status *Onboarding*) → same page, states 2 and 3. |
| 148 / 149 coaching setup | Drawn on two different tabs | Plan tab › *Coaching setup* sub-tab; also 146 *Mark ready & configure* and header ⋯ › *Coaching setup*. |
| 188 note composer | Unclear (whole page) | Overview › Coach notes › *Add note* → drawer. |
| 27b expanded Live Activity | Unclear trigger | Long-press / tap-and-hold on the collapsed activity (27). |
| 99 skip workout | Background missing | Workout tab (10) › today's card ⋯ › *Not today*. |
| 174/175 | Background missing | Templates (168) row *Use* / ⋯ *Make my copy*. |

## 7. Missing filters
- Plan versions (150): add **Type** (All · Workout · Nutrition) and **Status** (All · Active · Scheduled · Draft · Superseded).
- Templates (168/169): **Owner** (All · Mine · FitBud base) + **Type** (All · Workout · Nutrition · Intake form · Check-in form) + **Status** (Published · Draft · Archived) + search, same chip-dropdown pattern as Clients 136.
- Clients 136: complete (no change).

## 8. Canonical decisions (applied in phases 2–3)
1. Client Plan tab has two sub-tabs: **Plans** (TW-12) and **Coaching setup** (TW-11). Same workspace header, same sub-tab bar in 148–151.
2. Coaching setup accordion: Goal (short + detailed) · Basics · **Expectations** · Workouts · Nutrition · Check-ins · Reminders · Subscription. Expectations hold the targets that raise attention flags.
3. Onboarding page = one page, stepper Invited → Joined → Intake → Ready (144 → 147 → 146).
4. Trainee Today = rings → workout → meals (next meal expanded, others collapsed rows with status).
5. Live Activity = one activity, collapsed and expanded states.
6. Overview This week has ‹ › week and ‹ › day; stats under the strip follow the selected day/week.
