# FitBud trainee app as the union of Hevy and MyFitnessPal (v1)

**Date:** 14 Nov 2026 (IST) · **Author:** FitBud UI · **Status:** proposal for Firoz.

**Rule:**
- FitBud = Hevy (workout, profile, settings) ∪ MyFitnessPal (diet, food) ∪ FitBud's coach layer.
- Each capability has **exactly one home**.
- Today may *show* a read-only glance of other tabs, but every action happens in its home.
- No ads, no Premium, no social graph.
- Indian units throughout: katori, roti and piece alongside g.

**Columns:**
- **Source:** where the pattern comes from.
- **Home:** the one screen that owns it.
- **Duplicate removed:** the competing entry points we're dropping, which one we keep, and why.
- **Plan:** MVP or Later. Every Later has a one-line reason.

Tabs: **Today · Workout · Diet · Progress · More** (floating capsule).

## 1. Today (glance only)

| # | Capability | Source | Home | Duplicate removed | Plan |
|---|---|---|---|---|---|
| 1 | Day glance: next workout, meals logged, calorie ring, steps | FitBud | Today | MFP's Today-as-diary and Hevy's Home feed both drop. Today shows read-only status and deep-links to Workout and Diet. Nothing is logged here | MVP |
| 2 | Steps (Apple Health / Health Connect) | FitBud ring/bar format | Today card | MFP Progress › Steps tab dropped. Diet does not show steps | MVP |
| 3 | Notifications inbox (bell) | FitBud | Today header | Hevy's Home bell and profile notifications merge into this one | MVP |
| 4 | Check-in due card → check-in form | FitBud (Everfit semantics) | Today card → Check-in screen | Progress does not have its own check-in entry | MVP |

## 2. Workout (Hevy)

| # | Capability | Source | Home | Duplicate removed | Plan |
|---|---|---|---|---|---|
| 5 | Today's assigned session, with Start / Continue / View summary | Hevy routine card + FitBud plan | Workout tab | Hevy's Routines folders, New Routine, Explore programs and "Start Empty Workout" as the default are dropped. Sessions come from the coach | MVP |
| 6 | Active log: SET · PREVIOUS · KG · REPS · ✓, one scrolling list | Hevy `21`, `23` | Active workout | — | MVP |
| 7 | Coach targets visible while logging | FitBud | Active workout: a target chip under the exercise, and ghost values in the inputs | No separate "plan" screen during a session | MVP |
| 8 | Coach cue per exercise | FitBud | Active workout, under the exercise name | Coach notes aren't repeated in an Info tab | MVP |
| 9 | Add a set or exercise beyond the plan (coach sees it) | Hevy + FitBud decision | Active workout (+ Add set, + Add exercise) | — | MVP |
| 10 | Rest timer | Hevy / Strong | **The rest bar** in the active log. Rest length comes from the coach's plan and is shown on the exercise chip | Hevy has three entry points: header timer button, per-exercise "Rest: OFF" chip, Settings default. We keep the plan value plus the bar's ±15 and Skip. The header button and the Settings default are dropped | MVP |
| 11 | Exercise note (trainee) | Hevy Note chip | Active workout, per exercise; the coach sees it | A separate session caption on Save (Hevy `31`) is dropped. The summary has one "Note for Rahul" | MVP |
| 12 | Exercise detail: How to, History, records | Hevy `exdetail-*` | Exercise detail (tap the exercise name) | Per-exercise history lives only here. Progress does not get its own exercise-history list. Leaderboard is dropped | MVP (How to + History) |
| 13 | Replace or remove an exercise (⋯) | Hevy `22` | Exercise ⋯ menu | — | MVP |
| 14 | Reorder exercises | Hevy `22` | Exercise ⋯ menu | — | Later: the plan order is right most of the time, and drag-reorder is costly to build well |
| 15 | Superset | Hevy `22` | Exercise ⋯ menu | — | Later: P2 in spec; needs plan-side support first |
| 16 | Set types (warm-up, drop, failure) | Hevy | Tap a set number | — | Later: the coach already prescribes warm-ups; set types bring volume and PR rules we don't need yet |
| 17 | PR detection + live PR moment | Hevy | PR tag on the set row, then the summary; the coach sees it | Hevy's Profile "Records" tile and Home feed medals are dropped. PRs show on the row, the summary and Exercise detail only | MVP (tag + summary). Celebration animation Later, for the Figma detail phase |
| 18 | Minimised workout bar | Hevy `15`, `28` | Above the tab bar on every tab | — | MVP |
| 19 | Discard workout | Hevy `01`, `20` | Active log footer and Finish-early sheet | The trash icon on Hevy's minimised bar is dropped: too easy to tap by accident on a coached session | MVP |
| 20 | Finish → summary (Duration · Volume · Sets, new bests, optional effort, note for Rahul) | Hevy `31` | Workout summary | Hevy's share card, visibility (Followers), photo and gym fields are dropped. "Shared with Rahul" replaces them | MVP |
| 21 | Past sessions | Hevy Home feed / Profile | Workout tab week strip: tap a past day to open its summary | Hevy's Home feed, Profile workout count and Calendar are all dropped | MVP |
| 22 | Add exercise: search + Recent, "Rahul's picks" first | Hevy `19` | Add Exercise sheet | — | MVP (search + recent) |
| 23 | Muscle and equipment filter sheets | Hevy `17`, `18` | Add Exercise sheet | — | Later: search plus coach picks cover the MVP; the filters need original muscle art |
| 24 | Create custom exercise | Hevy `16` | Add Exercise › Create | — | Later: the coach owns the library; trainee-made exercises need a coach "add to plan" flow |
| 25 | Duration edit / "unusual duration" prompt | Hevy `32`, `33` | Workout summary | — | Later: an edge case; the auto timer is good enough for launch |
| 26 | Plate calculator, warm-up calculator, keep-awake, RPE settings | Hevy `08` | — | — | Later: power-user tools, not in spec |
| 27 | Live Activity / lock-screen rest timer | FitBud / Hevy | System | — | Later: native module work that doesn't block logging |

## 3. Diet (MyFitnessPal)

| # | Capability | Source | Home | Duplicate removed | Plan |
|---|---|---|---|---|---|
| 28 | Diet day: calorie ring + macro bars, week strip | FitBud ring format (kept) | Diet tab | MFP's bar-only calorie header is not used. MFP's separate macros card is folded into the ring card | MVP |
| 29 | Meals as collapsed cards (name, time, foods, kcal, state) | MFP `08`, `13`, `14` | Diet tab | MFP's "View diary" second list is dropped; the cards *are* the diary | MVP |
| 30 | **Eaten as planned** (one tap + Undo) | FitBud | Meal card | — | MVP |
| 31 | Something different → Ate out (**exact kcal only**) | FitBud + MFP Quick add | Meal card › Something different | **MFP "Quick add" and FitBud "Ate out" are the same capability.** We keep Ate out because the wording fits eating out and it's exact kcal by decision | MVP |
| 32 | Something different → Changed the portion (½ steps, katori / roti / piece) | FitBud + MFP `11` servings | Meal card › Something different | — | MVP |
| 33 | Something different → Log it myself → Food search → Food detail | MFP `10`, `11` | Food search (opened from a meal) | MFP's global "+ › Log Food" entry is dropped. Search always opens *from a meal*, so the meal picker dropdown (`09`) isn't needed | MVP |
| 34 | Food search default list: From your plan, then Recently logged | MFP `10` | Food search | MFP's My Meals / My Recipes / My Foods tabs collapse into one list | MVP |
| 35 | Global "+" quick-log sheet | MFP `01` | — (dropped) | **Dropped.** The meal card is the one logging entry. Weight moves to Progress (#41) and Exercise to Workout. Water is out | — |
| 36 | Copy from (another day's meal) | MFP `12`, `13` | Meal ⋯ | — | Later: needs a rule for how the coach sees a copied meal vs the plan |
| 37 | Barcode scan, voice log, meal scan | MFP `01`, `10` | — | — | Later: Indian home food is rarely barcoded, and scan/voice need paid APIs |
| 38 | Nutrition detail (calories by meal, nutrients table, macro pie) | MFP `04`–`06` | Diet › ring card tap | — | Later: the ring card covers MVP needs and the coach sees detail on web |
| 39 | Full meal plan view (week) | FitBud | Diet header button | — | Later: P2 in spec; today's plan is already on the cards (the mock's header button would be hidden for MVP) |
| 40 | Meal photo | FitBud / Healthify | Meal card | — | Later: P1; upload and storage work isn't needed to log |
| 41 | Water tracking, exercise-calorie burn, streak flame | MFP `01`, `08` | — | — | Later / dropped: not in spec; burn-netting conflicts with a fixed coach plan |
| 42 | Ask Rahul (WhatsApp) | FitBud | Meal ⋯ and Exercise ⋯ open the **same** Ask sheet | One sheet, item context prefilled; no separate chat tab | MVP |

## 4. Progress

| # | Capability | Source | Home | Duplicate removed | Plan |
|---|---|---|---|---|---|
| 43 | Body weight: log + Start / Current / Change | MFP `07` card + Hevy Measures | Progress | **MFP's "+ › Weight", MFP's Progress Weight tab and Hevy's Measures tile are three entry points; Progress keeps the only one.** It's the place people go to see change | MVP |
| 44 | Measurements (waist, etc.) | Hevy Measures | Progress | — | Later: weight covers the MVP; measurements come through check-in forms if the coach wants them |
| 45 | Progress photos | Hevy / Everfit | Captured in the **check-in**, viewed read-only in Progress | A standalone "add photo" in Progress is dropped, so the coach reviews photos in one flow | MVP (via check-in) |
| 46 | Weekly workout charts (duration / volume / reps) | Hevy `13` | Progress | Hevy Profile's chart is dropped; this is its only home | Later: charts are polish; the coach already sees adherence |
| 47 | Exercise charts (1RM, heaviest) | Hevy `exdetail-d520c03e` | Exercise detail | Not repeated in Progress | Later: History covers the MVP |

## 5. More (Hevy profile and settings)

| # | Capability | Source | Home | Duplicate removed | Plan |
|---|---|---|---|---|---|
| 48 | Profile (name, photo) | Hevy `13`, `14` | More › Profile | Follower counts, public / private split and the bio are dropped | MVP |
| 49 | Account: email, password, delete account | Hevy `11` | More › Account | — | MVP (store-required delete) |
| 50 | Reminders + quiet hours | Hevy `09` + FitBud TR-16/17 | More › Reminders, **one screen** | Hevy's separate Notifications and Workout Settings screens merge here | MVP (fixed default quiet hours); editable quiet hours Later: P1, and the default protects users at launch |
| 51 | Steps connection | Hevy `06` Apple Health / Integrations | More › Steps | — | MVP |
| 52 | Sync status / outbox | FitBud | More › Sync (+ inline chips) | — | MVP |
| 53 | Help: contact by email with the app version | Hevy `02`, `05` | More › Help | — | MVP (mailto). FAQ Later: no content yet |
| 54 | Units (kg/lbs, cm/in) | Hevy `07` | More › Units | — | Later: India defaults to kg and cm |
| 55 | Theme (dark), language | Hevy `06` | More | — | Later: light-only for launch; Hindi needs copy work |
| 56 | Export data | Hevy `06` | More | — | Later: not in spec |
| 57 | Subscription / PRO, ads, social feed, likes, follows, leaderboard, share to Stories, Explore programs | Hevy, MFP | — | — | Dropped: coach-led app, no Premium or social |

## Top duplicates removed

1. **Weight logging** in three places (MFP + sheet, MFP Progress, Hevy Measures) → **Progress only**.
2. **Quick add vs Ate out** → one **Ate out**, exact kcal.
3. **Global + quick-log sheet vs meal-card Log** → **the meal card is the only logging entry**.
4. **Rest timer** in three places (header button, per-exercise chip, settings default) → **coach plan value + the rest bar**.
5. **Workout history** spread across the Hevy Home feed, Profile and Calendar → **past sessions via the Workout week strip**, with per-exercise history only in **Exercise detail**.
6. (Also: the discard trash on the minimised bar, MFP's "View diary" second list, steps on Progress, and a standalone progress-photo upload.)

## Top MVP deferrals

1. Barcode, voice and meal scan.
2. Nutrition detail screens (calories by meal, nutrients, macro pie).
3. Copy from another day's meal.
4. Set types, supersets, reorder, plate calculator.
5. Progress and exercise charts.
6. (Also: create custom exercise, muscle/equipment filters, units / theme / language, Live Activity, meal photo, streaks.)

---

## Trainer side: gaps Everfit reveals

Everfit is used for structure and naming only. **Attention is a FitBud original**: Everfit's first screen is a plain client list (`everfit-firoz-14nov/10`).

| # | Gap | Everfit evidence | FitBud answer | Plan |
|---|---|---|---|---|
| T1 | Attention dashboard: who needs action today | none (FitBud original) | Grouped by reason (missed sessions, check-ins to review, off-plan nutrition, nudges due), one inline action per row, a pulse bar for act now / today / on track, plus a PR "wins" row | MVP |
| T2 | Roster counts above the client list | `10` Connected / Pending / Offline | Our counts: pending invites, overdue, check-ins due. Not Everfit's model | MVP |
| T3 | Dirty-state Discard on the workout builder | `01` | "Discard changes?" with Discard / Keep editing (Hevy wording) | MVP |
| T4 | Designed empty builder | `03` | One line + Add exercise | MVP |
| T5 | Limitations / injuries and notes on the client | `08` Others | Two fields on the client profile; shown to the coach when building plans | MVP (safety) |
| T6 | Coach sees PRs and highlights | `09` Highlights | PRs in Attention "wins" and on the client overview. Badges and countdowns dropped | MVP (PRs); highlights grid Later: not needed to coach |
| T7 | Library as a primary surface on mobile | `05`, `06` | Web keeps Templates; mobile library is browse-only | Later: building plans is a web task |
| T8 | Section-based builder (warm-up, circuit, EMOM) | `03`, `05` | Flat list stays | Later: big data-model change |
| T9 | Richer New Exercise (modality, movement pattern, custom fields) | `04` | Name, muscle, equipment, video link | Later: metadata beyond search isn't needed yet |
| T10 | Edit client on mobile; Archive vs End coaching | `07` | End coaching (TW-30) keeps its name; mobile edit profile | Later: web covers edits |
| T11 | Check-in review and nutrition plan builder | none | FitBud originals | MVP (already in spec) |
