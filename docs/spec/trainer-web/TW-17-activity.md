# TW-17 · Activity

**ID:** TW-17 · **Name:** Activity · **Priority:** P1 · **Route/screen:** `/clients/:rid/activity` (`?type=workout|meal|checkin&state=&from=&to=&item=`) · **Batch:** TW-E (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/ClientActivityPage.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** `GET /workspaces/relationships/:rid/activity` (one activity type per page, derived state, civil date range), nudge

**Code status:** old code exists (the guide labelled it "Implemented"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-17 -->
### TW-17 · Activity

> **Priority:** P1 · **Route:** `/clients/:rid/activity` (`?type=workout|meal|checkin&state=&from=&to=&item=`) · **Files:** `pages/ClientActivityPage.tsx` (`nudgeActivity`, generate assignments) · **API:** `GET /workspaces/relationships/:rid/activity` (one activity type per page, derived state, civil date range), nudge

1. **Purpose.** A day-by-day record of what was expected and what happened, plus nudges on specific unresolved items.
2. **Entry.** Workspace tab, Overview "View all activity", exception source links, and `/go/meal/:id` and `/go/workout/:id` for trainers.
3. **Legacy (do not keep).** `shots/d1440_10_client1_activity.png`. Server filters work. Some clients have no assignments because of the seed 500. A "generate assignments" button is exposed to the trainer.

4. **Gaps to close.**
   - A manual "generate" button is a developer affordance. The rolling horizon should be automatic.
   - Items aren't grouped by day.
   - Meal photos and deviation detail are hidden.
   - There's no asked-coach marker.
   - Nudge has no context about rate limits or quiet hours.
5. **Target design.**
   - **Type segmented control:** Workouts · Meals · Check-ins. One type at a time, matching the API.
   - **State filter pills,** using the type-specific derived states. Workouts: completed, modified, skipped, missed, pending. Meals: logged, changed, skipped, logged late, overdue, pending.
   - **Date range:** This week (default), Last week, or Custom.
   - **Grouped by day** with a sticky day header ("Tue 13 Oct · 2 of 5 meals logged").
   - **Row:** time (in the **client's** timezone, D22, with the trainer's time in the tooltip) · item name · state chip · detail line (deviation text such as "Swapped rice for 2 roti", **logged foods with kcal against plan** such as "Ate: 3 roti, 1 katori rajma · 610 kcal (plan 520)", the photo thumbnail, or "Skipped · 'travelling'") · `AskedCoachMarker` · action. *Nudge* shows only on pending or overdue items not yet logged. *View* opens a side panel with the full workout execution (sets done versus prescribed) or the meal compliance detail.
   - **Meal panel (D28):** planned items against **actual logged items** (food, serving, quantity, kcal, P, C, F), with totals and the difference ("+90 kcal · +6 g protein"). Unknown values are shown as "—" and totals as "≥". Custom foods are marked "Custom · not in library", with **Add to my food library**, which opens the TW-26 food drawer prefilled with the name.
   - **Non-assignment entries** in the Meals view, as single-line events: "Priya changed Lunch time 1:30 pm → 2:30 pm (from Wed)" (D24), and "Logged late on Fri for Wed" (D23).
6. **States.**
   - Empty: "No meals in this range." When there are no assignments at all: "No schedule yet. Publish a plan to create one."
   - The nudge button has three states: available, "Sent 10:12" (disabled), and rate-limited.
7. **Edge cases.**
   - Superseded assignments from a plan replacement show a muted "Replaced by plan v4" badge and are excluded from counts.
   - Logged late shows both the scheduled and logged times. Late logs are possible until the trainer resolves the related exception (D23). After that, the item is locked, and the panel shows "Locked · exception resolved 16 Oct".
8. **Deep links.** `?item=meal:<id>` opens the side panel. `/go/meal/:id` resolves to it for trainers.
9. **References.** Adapt the Trainerize meal-photo sharing view [R22] https://help.trainerize.com/hc/en-us/articles/360058683772-Sharing-Meal-Photos-In-App.
10. **UX decisions.** Remove the manual generate button. Replenishment is a system job (`jobs/replenishment.ts`), and keep a dev-only control behind a flag. Nudges sit at item level, per decision C.
11. **Implementation.** Add `ActivityDayGroup` and `ActivityRow`, plus `ExecutionPanel` for workouts and `MealPanel` for meals. Photos come from the file download target.
12. **Acceptance criteria.**
    - [ ] Rows are grouped by day.
    - [ ] Nudge shows only for unresolved, actionable items, with its states.
    - [ ] Deviation detail and photos are visible.
    - [ ] No generate button in production.
    - [ ] Logged foods, and their kcal against plan, are visible for changed meals.
    - [ ] Meal-time changes appear as activity entries.
13. **Priority:** P1.
<!-- END VERBATIM TW-17 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-17.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-17.1** [guide §12] Rows are grouped by day.
2. **TW-17.2** [guide §12] Nudge shows only for unresolved, actionable items, with its states.
3. **TW-17.3** [guide §12] Deviation detail and photos are visible.
4. **TW-17.4** [guide §12] No generate button in production.
5. **TW-17.5** [guide §12] Logged foods, and their kcal against plan, are visible for changed meals.
6. **TW-17.6** [guide §12] Meal-time changes appear as activity entries.
7. **TW-17.7** [QA checklist #1] A type segmented control **Workouts · Meals · Check-ins** (one type at a time).
8. **TW-17.8** [QA checklist #2] State filter pills (Workouts: completed, modified, skipped, missed, pending. Meals: logged, changed, skipped, logged late, overdue, pending) and a date range (This week default / Last week / Custom).
9. **TW-17.9** [QA checklist #3] **Grouped by day** with sticky headers ("Tue 13 Oct · 2 of 5 meals logged").
10. **TW-17.10** [QA checklist #4] Row: time in the client's timezone · item · state chip · detail (deviation text, logged foods with kcal vs plan, photo, "Skipped · '…'") · action.
11. **TW-17.11** [QA checklist #5] *Nudge* only on pending or overdue unlogged items. Its states: available / "Sent hh:mm" (disabled) / rate-limited.
12. **TW-17.12** [QA checklist #6] *View* opens a side panel (sets vs prescribed, or meal planned vs actual with "—" for unknown values and "≥" totals).
13. **TW-17.13** [QA checklist #7] **No manual "Generate assignments" button.** Empty: "No meals in this range."
14. **TW-17.14** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
15. **TW-17.15** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- RCA.md §5: TW-17 was ⚠️ in run 3 and became ✅ in run 4 with no review. The guide bans the manual "Generate assignments" button. Check that it's gone.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `R/activity` (also Lakshmi-style deviations aren't in Rahul's roster; use Rohan or Meera `/clients/40248941-017c-48ea-b3df-7cc877c3533b/activity`)
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-17.png`. Save extra states as `docs/spec/evidence/TW-17--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

