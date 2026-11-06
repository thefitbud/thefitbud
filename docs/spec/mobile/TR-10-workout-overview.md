# TR-10 · Workout overview

**ID:** TR-10 · **Name:** Workout overview · **Priority:** P1 · **Route/screen:** `Workout` · **Batch:** M-3 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainee/WorkoutTab.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/trainee/WorkoutOverviewScreen.tsx` (exists)

**API (from the guide):** workout assignments, get assignment, start, skip

**Code status:** old code exists (the guide labelled it "Implemented"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../05-notifications.md` · `../04-flows.md` (§3.7 Late logging) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-10 -->
### TR-10 · Workout overview

> **Priority:** P1 · **Screen:** `Workout` · **Files:** `src/trainee/WorkoutTab.tsx` ("Start Workout", "Continue Workout", "Skip workout"; calls `generateWorkoutAssignments`) · **API:** workout assignments, get assignment, start, skip

1. **Purpose.** See today's session and start it. Also see the week ahead.
2. **Entry.** Tab, Today hero, workout push, `/workout/:id`.
3. **Legacy (do not keep).** Today's assignment with Start, Continue and Skip buttons.
4. **Gaps to close.** No exercise preview. No week view. "Skip workout" is as prominent as "Start workout". Client-side generation.
5. **Target design.**
   - **Week strip** (Mon–Sun: session name, Rest, or ✓).
   - **Session card:** title ("Upper body A"), estimated duration *only if* the plan stores rest and set data to compute it (otherwise omit), the trainer's instruction note, and an exercise list (name, sets × reps, load label, thumbnail).
   - Primary: **Start workout** (or **Continue**, which shows "Paused at 3 of 6 exercises").
   - Overflow: *Not today* (skip, with an optional reason chip: Sick, Travelling, No time, Injury, Other) and *Ask coach*.
   - Completed state: a summary row with *View summary*.
6. **States.**
   - Rest day: "Rest day" with a tip from the trainer if the plan has one.
   - No plan.
   - Offline: start works offline and sets are logged to the outbox.
   - Missed earlier: "Mon's workout wasn't logged. If you did it, log it now." with *Log it* (opens the late log flow). **Logging late is allowed until your coach resolves the missed-workout exception** (D23). The banner lists every late-loggable workout, max 3.
7. **Edge cases.** Once the trainer resolves the exception, the workout becomes read-only "Missed · closed by Rahul", with no guilt copy. Optional workouts aren't late-loggable (D34). Until resolution, the item shows "Missed · you can still log it".
8. **Deep links.** `/workout/:assignmentId`. P-WO opens here.
9. **References.**
   - Everfit client app: Track a workout [R9] https://help.everfit.io/en/articles/5829094-client-app-track-a-workout
   - Hevy track workouts [R26] https://www.hevyapp.com/features/track-workouts/
10. **UX decisions.** Skipping is demoted to the overflow, but stays honest and available (an explicit skip is different from a silent miss).
11. **Implementation.** Remove the generate call. Cache the assignment and the plan content locally.
12. **Acceptance criteria.**
    - [ ] The week strip.
    - [ ] Start works offline.
    - [ ] Skip is in the overflow with reasons.
    - [ ] The late-log path works until the exception is resolved, and is locked after.
13. **Priority:** P1.
<!-- END VERBATIM TR-10 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-10.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-10.1** [guide §12] The week strip.
2. **TR-10.2** [guide §12] Start works offline.
3. **TR-10.3** [guide §12] Skip is in the overflow with reasons.
4. **TR-10.4** [guide §12] The late-log path works until the exception is resolved, and is locked after.
5. **TR-10.5** [18 Oct QA] No "2026-09-28 · completed"; past items are never labelled "Upcoming"; status chips are human labels with icons.
6. **TR-10.6** [18 Oct QA] Pull-to-refresh; no "Refresh" button.
7. **TR-10.7** [product rule] Lists refresh by **pull-to-refresh** (the shared Screen wrapper). There's no manual "Refresh" button.
8. **TR-10.8** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
9. **TR-10.9** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: the overview shows raw "2026-09-28 · completed" (lowercase status); the Upcoming list on the Workout tab shows **past** ISO dates labelled "Upcoming".
- Code at 7f74108: `apps/mobile/src/trainee/WorkoutTab.tsx:328` has a manual "Refresh" button.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **aarav.ontrack@demo.fitbud.test** · route `tab workout › See workout overview` · 18 Oct capture `fitbud-mobile-shots/ios/TR-10-workout-overview.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-10.png`. Save extra states as `docs/spec/evidence/TR-10--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

