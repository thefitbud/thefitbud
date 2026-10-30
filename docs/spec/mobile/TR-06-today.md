# TR-06 · Today

**ID:** TR-06 · **Name:** Today · **Priority:** P0 (date navigator, workout card, rings, next meal), P1 (coach notes), P2 (steps) · **Route/screen:** `Today` · **Batch:** M-2 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainee/TodayTab.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** workout and meal assignments for today, the effective plan, check-ins, week read model [API-NEW], notifications unread count

**Code status:** old code exists (the guide labelled it "Implemented (needs redesign)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.9) · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-06 -->
### TR-06 · Today

> **Priority:** P0 · **Screen:** `Today` · **Files:** `src/trainee/TodayTab.tsx` (generate calls on load, "Version N · effective", "Open today's diet", Refresh) · **API:** workout and meal assignments for today, the effective plan, check-ins, week read model [API-NEW], notifications unread count

1. **Purpose.** Answers "what do I do now". It's the daily home (UX §8).
2. **Entry.** App open, tab, most pushes (summary P-EOD), and widget taps.
3. **Legacy (do not keep).** Code: a list of today's items, a plan card with "Version N · effective", and Refresh. Figma `screens/trainee_01_today.png` has a strong hero, but also banned elements (streak, 76% ring, hydration, "Active Plan V2").

4. **Gaps to close.**
   - The code version: no hierarchy, plan version jargon, no "next up", no weekly consistency, no check-in surfacing, manual Refresh, client-side generation, no date navigation, no nutrition totals.
   - The Figma version: streak, % ring, hydration and Ask Coach chat.
5. **Target design** (top to bottom; user 17 Oct nav 3, D25, D27).
   1. **Top bar:** "Today · Wed 14 Oct", the sync indicator and a bell with an unread dot (TR-15).
   2. **Date navigator** (D27). A horizontal **week strip** (Mon–Sun, swipe for other weeks) with ‹ › and a *Today* pill when you're on another day. Each day has a small state dot (all done, some open, rest day) and **no %**.
      - **Today:** fully interactive.
      - **Past days:** read-only, *except* items that can still be logged late (D23): assigned items not yet logged whose exception the trainer hasn't resolved. Those rows keep their action and a "Log late" chip, and a banner says "You can still log 2 items from Mon." Logged items on past days are view-only.
      - **Future days:** a read-only preview ("Preview · Thu 15 Oct"), with planned workouts and meals and no actions. The preview reaches only as far as the assigned horizon; after that: "Your coach hasn't planned beyond Sun yet."
   3. **Next up hero card** (today only), the single most relevant item, chosen in this order:
      1. An overdue required item.
      2. The current or next meal window (within ±60 min).
      3. Today's workout, when it isn't done.
      4. A check-in that's due.

      Each hero has one primary action: *Eaten as planned* for a meal, *Start workout* for a workout, *Start check-in* for a check-in. A secondary action is "Something different" or "Not today".
   4. **Today's workout card:** the session name ("Upper body A"), "6 exercises · ~45 min", the first 3 exercise names, and the state chip. The primary **Start** goes **straight into the active workout** (TR-11), skipping the workout overview. *See workout* opens TR-10. In progress: **Resume** ("3 of 6 done"). Done: collapses to "Upper body A · done 7:40 pm" with *View*. Rest day: "Rest day. Recovery is part of the plan."
   5. **Nutrition card** (D25):
      - **Four progress rings in a row: kcal, Protein, Carbs, Fat.** Each ring shows *logged vs assigned* for the day: the centre reads "1,240" over "of 1,850 kcal", or "62 / 90 g". A ring fills to 100% and then shows a thin outer overflow arc; it never turns red.
      - Totals count **only logged meals**: as planned, at the plan's values, plus "something different" at the values of the foods actually logged (TR-26).
      - Unknown values: the ring shows "≥ 1,240" and a footnote "Some foods have no nutrition data."
      - Ring colours are neutral data tokens (`ring.kcal`, `ring.protein`, `ring.carbs`, `ring.fat`; §1.2), never success, warning or critical. There's no "% of goal" text.
      - **Next meal to log** card (inside the nutrition card): the first unlogged meal by time, showing "Lunch · 1:30 pm · 2 roti · 1 katori dal · 520 kcal" with **Eaten as planned** and *Something different*. When every meal is logged: "All meals logged today."
      - Tapping the rings opens TR-07 for that day.
   6. **Steps card** (optional, P2, TR-25). It shows only when the trainee has connected Health Connect or HealthKit **and** granted the steps permission: "6,240 steps today" with a 7-day mini bar chart and no goal judgement. If permission isn't granted, **the card is hidden** (there's no nag on Today). Setup lives in Settings.
   7. **This week** (`WeeklyConsistency`): Mon–Sun dots and "3 of 4 workouts · 17 of 21 meals". Copy rules are in §1.6.9: when the trainee missed yesterday, "Yesterday got away from you. Today's a fresh start." **Never** a streak count.
   8. **From your coach** (D20):
      - **Notes Rahul marked visible to you**, newest first, max 2 with "See all". Each card shows "From Rahul · 2 h ago", the note text, an unread dot until opened, and its context link (for example "About: Weekly check-in").
      - The review signals: "Rahul reviewed your check-in · Tue", "Rahul answered your question about Lunch", and "New plan from Mon · See what changed".
   9. **Check-in card**, when it's due in ≤2 days: "Weekly check-in due Fri" with *Start*.
   10. **Today's list** (collapsed, "All items"): compact rows for each workout and meal with time (the trainee's timezone), name, state chip and the kcal per meal.
   - No plan version numbers, no % text, no hydration, no streak.
   - **Copy examples:**
     - Morning: "Good morning, Priya. Here's your day."
     - All done: "That's everything for today. Nicely done."
6. **States.**
   - Loading skeleton.
   - Rest day with no workout: the workout card reads "Rest day", and meals are still listed.
   - No plan (shouldn't happen after TR-04): show the Waiting card.
   - Offline: data is cached from the last sync, actions are queued, and the sync indicator shows "Saved on phone". The rings update immediately from local logs.
   - Error: a cached view with an inline "Couldn't refresh · Retry".
   - Ended relationship: TR-22.
   - Past day with nothing loggable: "Viewing Mon 12 Oct · read-only".
7. **Interactions and edge cases.**
   - Pull to refresh.
   - Day rollover at midnight in the **trainee's timezone** refreshes automatically (D22).
   - The trainee's stored timezone runs every date and time. If the device timezone changes (travel), a one-time banner asks: "You're in Dubai time now. Use Dubai time for your plan? · Switch / Keep India time" (§3.9).
   - Meal times follow the trainee's own meal times when set (TR-24), labelled "your time".
   - Tapping the hero meal opens TR-08.
   - A shared note opened from P-NOTE scrolls to the note and marks it seen.
8. **Notifications and deep links.**
   - `/today` and `/today/:date` (YYYY-MM-DD; future dates open the preview, past dates the read-only view).
   - `/today?note=:id` from P-NOTE.
   - P-EOD opens Today scrolled to the remaining items.
   - Widget taps open Today.
9. **References.**
   - Adapt: the Trainerize client app "today" structure [R21] https://help.trainerize.com/hc/en-us/articles/208689006-What-Does-the-Client-App-Experience-Look-Like
   - Adapt: MyFitnessPal and HealthifyMe macro summaries on the diary [R31] [R34], with rings showing *logged vs assigned* and no good-or-bad colouring.
   - Adopt: the "never miss twice" framing from habit research [R62] and the BPS summary [R65].
   - Avoid: Duolingo-style streak pressure [R63] https://blog.duolingo.com/how-duolingo-streak-builds-habit/. Streaks work for daily-practice apps, but punish planned rest days in training.
10. **UX decisions.**
    - A single hero item reduces choice. The workout card's Start removes a tap for the most common action.
    - The rings show *progress through the plan*, not a score. That's why they're neutral colours with no % text, which keeps the contract's spirit (Confluence conflict C-9).
    - Weekly counts tolerate rest days and single misses (P9).
    - Coach notes make the accountability visible (P10).
    - The date strip makes yesterday's late logging discoverable without a separate screen.
11. **Implementation.**
    - Remove the `generateWorkoutAssignments` and `generateMealAssignments` calls from `TodayTab.tsx`.
    - Read from the local SQLite cache populated by `sync/pull`.
    - Pure selectors in `packages/core`: `nextUp()`, `dayNutrition(assignments, logs) → {kcal, protein, carbs, fat: {logged, assigned, unknown}}`, `nextMealToLog()` and `isLateLoggable(item, exceptionState)`. All are unit-tested.
    - The `NutritionRings` component uses react-native-svg.
    - The week read model is API-NEW (shared with TW-09). The day read model is `GET /me/day/:date` (API-NEW: assignments, logs, totals, the loggable flag).
12. **Acceptance criteria.**
    - [ ] The hero follows the priority order (unit tests cover each case).
    - [ ] The workout card's Start opens the active workout directly.
    - [ ] The rings show logged vs assigned for kcal, P, C and F, and "something different" meals count their logged foods.
    - [ ] The next meal card shows the first unlogged meal.
    - [ ] Past days are read-only except late-loggable items. Future days are a preview with no actions.
    - [ ] The steps card is hidden without permission.
    - [ ] There's no streak, % text, hydration or version label.
    - [ ] The weekly counts equal the trainer's counts.
    - [ ] It works offline from the cache.
    - [ ] No client-side generation calls.
13. **Priority:** P0 (date navigator, workout card, rings, next meal), P1 (coach notes), P2 (steps).
<!-- END VERBATIM TR-06 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-06.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-06.1** [guide §12] The hero follows the priority order (unit tests cover each case).
2. **TR-06.2** [guide §12] The workout card's Start opens the active workout directly.
3. **TR-06.3** [guide §12] The rings show logged vs assigned for kcal, P, C and F, and "something different" meals count their logged foods.
4. **TR-06.4** [guide §12] The next meal card shows the first unlogged meal.
5. **TR-06.5** [guide §12] Past days are read-only except late-loggable items. Future days are a preview with no actions.
6. **TR-06.6** [guide §12] The steps card is hidden without permission.
7. **TR-06.7** [guide §12] There's no streak, % text, hydration or version label.
8. **TR-06.8** [guide §12] The weekly counts equal the trainer's counts.
9. **TR-06.9** [guide §12] It works offline from the cache.
10. **TR-06.10** [guide §12] No client-side generation calls.
11. **TR-06.11** [18 Oct QA] The top bar reads "Today · Sun 18 Oct"; the check-in card reads "Weekly check-in due <Day>", never "Due · 2026-10-18".
12. **TR-06.12** [18 Oct QA] Deepak (Dubai): times show in his timezone and the device-timezone prompt or label is visible where specified (§3.9).
13. **TR-06.13** [product rule] Lists refresh by **pull-to-refresh** (the shared Screen wrapper). There's no manual "Refresh" button.
14. **TR-06.14** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
15. **TR-06.15** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: the check-in card shows raw "Due · 2026-10-18".
- Mobile QA index: Deepak (Dubai) shows **no timezone cue**; Farhan (paused), Meera, Rohan and Aarav look near-identical, so states aren't visually distinguished.
- Mobile QA index: on Expo web the rings render as a kcal line (documented in `docs/LOCAL_TESTING.md`); nutrition 0/957 kcal for Aarav.
- Mobile QA index: Today's header uses "Sunday, October 18" (US long format). Use the shared formatter ("Sun 18 Oct").

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **deepak.dubai@demo.fitbud.test** · route `trainee_shell › tab today` · 18 Oct capture `fitbud-mobile-shots/ios/TR-06-today--deepak-dubai.png`
- Account **farhan.paused@demo.fitbud.test** · route `trainee_shell › tab today` · 18 Oct capture `fitbud-mobile-shots/ios/TR-06-today--farhan-paused.png`
- Account **meera.ack@demo.fitbud.test** · route `trainee_shell › tab today` · 18 Oct capture `fitbud-mobile-shots/ios/TR-06-today--meera-ack.png`
- Account **rohan.slipping@demo.fitbud.test** · route `trainee_shell › tab today` · 18 Oct capture `fitbud-mobile-shots/ios/TR-06-today--rohan-slipping.png`
- Account **aarav.ontrack@demo.fitbud.test** · route `trainee_shell › tab today` · 18 Oct capture `fitbud-mobile-shots/ios/TR-06-today.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-06.png`. Save extra states as `docs/spec/evidence/TR-06--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

---

## Design amendment · 21 Oct 2026 (mockups redesign)

Supersedes the order in §5 items 3–10 (user feedback 21 Oct). Mockups (updated 22 Oct): `docs/design/mockups/png/04-trainee-today-{ios,android}-v3-{empty,partial,done,rest,past}.png` (Option B progress card, locked 21 Oct; replaces the concentric-rings card, the old 04/04b/97 frames and the ring-card crop); states 96, 104, 113, 115; banners 29, 29b (those state frames still show the old ring card, so build the card per the v3 frames).

1. **Top bar:** "Today" with the date and ‹ › day navigation (D27 behaviour unchanged: past days read-only except late-loggable items, future days preview), sync icon, bell.
2. **Progress rings first:** kcal, Protein, Carbs, Fat (logged vs assigned, neutral ring tokens, overflow arc, no %), plus a **Steps** ring only when Health Connect / HealthKit is connected with permission (hidden otherwise). Footer: "2 of 5 meals logged" and *Diet ›*.
3. **Today's workout card:** name, time, "6 exercises · about 50 min", first exercises, **Start** (straight into TR-11). Done → "· done 7:22 pm" with *View*. Rest day → "Rest day. Recovery is part of the plan."
4. **Meals list:** one row per meal in time order. The **active meal** is the next unlogged meal whose time is closest to the device time (window −60 min … next meal's time; overdue unlogged meals win). It is the only expanded card: foods, kcal and macros, **Log** (= eaten as planned) and *Something different*. Every other meal is a collapsed row with time, name, short foods, kcal and a status chip: **Logged**, **Logged · changed**, **Skipped**, **Upcoming**, or **Waiting to send** (offline). Tapping a row expands it in place and collapses the previous one.
5. The dark "Next up" hero card is removed; no single meal may take more than about a quarter of the first screen.
6. "This week", "From your coach" and the check-in card stay below the meals list (unchanged rules).

### Revision · 21 Oct 2026 (round 2; supersedes items 1–3 above)
1. **Week strip** below the title: Mon–Sun chips with date and status dot, today selected, past days tappable (read-only except late-loggable items, with a "Viewing Fri 16 Oct · read-only" banner), ‹ › and swipe for earlier weeks. Mockup 04b shows a past day.
2. **Rings:** concentric, kcal outer then protein, carbs, fat, steps innermost (only when connected), on the left; legend on the right, one row per ring: colour dot, label, done / goal ("460 / 1,850 kcal"). No %.
3. **Workout card** is the highlight: navy filled card with white text and a full-width **Start workout** button; done and rest-day variants keep the same card.


### Amendment · visual polish round 3 (21 Oct 2026)
- Rings: concentric rings 164pt across, ordered from outer to inner: kcal, protein, carbs, fat, steps (steps only when connected). Each ring has its own hue, with a track tinted to match. The centre shows kcal left, or kcal eaten once the goal is reached.
- Legend rows: label, value / goal (tabular figures), and a mini bar in the ring's hue. No percentages.
- Week strip: Mon–Sun pills. The selected day is filled. A completion dot shows green when all done and amber when partial. Swiping or the chevrons change the week; next week is disabled beyond today. The date is shown once. The title reads "Today", or the date when a past day is selected.
- The workout card is the screen's highlight (navy). It has no separate section header.
