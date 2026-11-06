# TR-26 · Food search and quantity (logging actual foods)

**ID:** TR-26 · **Name:** Food search and quantity (logging actual foods) · **Priority:** P1 · **Route/screen:** `FoodSearch` (full-height modal from TR-08) · **Batch:** M-2 (see `../BATCHES.md`)

**Files to touch:**
- `src/trainee/food/FoodSearchScreen.tsx` (not found at this path in the repo; nearest: `apps/mobile/src/trainee/FoodSearchScreen.tsx`)
- `QuantitySheet.tsx` (not found at this path in the repo)
- `src/sync/foodIndex.ts` [new]

**API (from the guide):** API-NEW `GET /me/foods/search?q=&limit=20`, `GET /me/foods/recent`, `GET /me/foods/index?since=` (delta for offline), deviate `kind: logged_foods`

**Code status:** the guide says "New-proposed" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-26 -->
### TR-26 · Food search and quantity (logging actual foods)

> **Priority:** P1 · **Screen:** `FoodSearch` (full-height modal from TR-08) · **Files:** `src/trainee/food/FoodSearchScreen.tsx`, `QuantitySheet.tsx`, `src/sync/foodIndex.ts` [new] · **API:** API-NEW `GET /me/foods/search?q=&limit=20`, `GET /me/foods/recent`, `GET /me/foods/index?since=` (delta for offline), deviate `kind: logged_foods` · **Decision:** D28

1. **Purpose.** Log what was actually eaten, with real foods, quantities and units, in a few taps. That feeds the trainee's rings and the trainer's view.
2. **Entry.** TR-08 "Log what I ate" and "+ Add food", and `/meal/:id/foods`.
3. **Legacy (do not keep).** None on mobile. Foods exist in the trainer library (`/libraries` foods, with servings and nullable nutrients).
4. **Gaps to close.** Trainees can't reach the food library.
5. **Target design.**
   - **Top:** the meal title ("Lunch · Wed") and the list of **items in this log**. It's prefilled with the plan items, each row showing "2 × roti · 240 kcal" with a stepper and ✕. A live total bar is pinned to the bottom: "610 kcal · P 24 · C 80 · F 20 g · plan 520 kcal" and **Save**.
   - **Search field** ("Search foods, e.g. dal, roti, poha"), autofocused when adding.
   - **Before typing:**
     - **Recent**: the last 10 foods this trainee logged, with their last quantity ("1 katori rajma").
     - **Frequent**: the top 10 by count in 30 days.
     - **From your plan**: the foods in the trainee's current plan.
     - One tap adds the food with its last-used or default serving.
   - **Results while typing** (debounced 150 ms, local index first, server merge when online):
     - Ranked by: a prefix match on the name or an alias, then the trainee's own history, then trainer foods, then the global library.
     - **Indian names, spellings and transliterations** match through the aliases ("daal" finds Dal, "chapati" finds Roti, "dahi" finds Curd).
     - Each row shows the name, the default serving and its kcal ("Roti (phulka) · 1 roti · 120 kcal") and a source tag (Your coach, FitBud).
     - Unknown nutrients show "kcal —".
   - **Quantity sheet** (on tapping a result):
     - **Unit chips** from the food's servings: **katori**, **roti/piece**, **cup**, **glass**, **tbsp**, **tsp**, **slice**, **bowl**, plus **g** or **ml** (always available when the basis is mass or volume).
     - A **quantity stepper** in 0.25 steps (¼, ½, ¾, 1, 1½ …) with quick chips ½ · 1 · 2 · 3.
     - **Live macros** for this item: kcal, P, C and F, with "≈ 150 g" shown under household units.
     - **Add** (or **Update**).
   - **Not found:**
     - "Can't find 'thepla'?"
     - **Add 'thepla' as a custom food**: a name and a quantity text ("2 pieces"), with **nutrition unknown**. Optionally the trainee can enter the kcal if they know it (marked "entered by you").
     - Custom foods are saved for this trainee and appear in Recent.
     - Rahul sees "Custom · not in library" and can add it to his library (TW-17, TW-26).
     - Helper: "It's fine to log it anyway. Rahul can add the details."
6. **States.**
   - Offline: search the on-device index (global foods, the trainer's foods and the trainee's recent and custom foods). The copy "Showing foods saved on your phone" appears when the server merge isn't available.
   - Loading: skeleton rows (only when the index isn't downloaded yet).
   - Empty search: the not-found block.
   - Error: local results, plus "Couldn't search online".
7. **Edge cases.**
   - Mixed known and unknown items: totals show "≥". The rings use "≥".
   - Quantity 0 removes the item.
   - Very large values ("20 katori") get a confirm prompt.
   - A food archived by the trainer still works in logs that already use it, but is hidden from search.
   - Units: a katori is about 150 ml or g unless the food's serving defines otherwise; a cup is 240 ml; a tbsp is 15 ml; a tsp is 5 ml. The serving's own gram or ml equivalent always wins.
8. **Deep links.** `/meal/:id/foods`.
9. **References.**
   - Adapt: MyFitnessPal recent, frequent and quick add [R31] [R32].
   - Adapt: HealthifyMe Indian food database and household units [R34].
   - Base data: the Indian Food Composition Tables (IFCT 2017, ICMR-NIN) [R70] for global foods, with nutrients left unknown where a source has no value.
10. **UX decisions.**
    - Recent, frequent and from-plan lists cover most logs with no typing.
    - Household units (katori, roti) match how Indians describe portions, and grams are always available.
    - Not-found never blocks logging, and the coach can enrich it later.
11. **Implementation.**
    - The on-device SQLite table `food_index` (id, name, aliases, servings JSON, basis, nutrients, source, updatedAt) gets a full download on first open (~2–3k foods, about 1 MB) and deltas via `GET /me/foods/index?since=`. It uses an FTS5 or prefix index on name and aliases.
    - API-NEW trainee-scoped food endpoints return global foods plus the active trainer's foods (read-only) plus the trainee's custom foods.
    - API-NEW `trainee_custom_foods` (id, trainee_user_id, name, quantity_text, kcal|null, created_at).
    - Macro calculation is a pure function `macrosFor(food, servingId|unit, quantity)` in `packages/core`, with unknowns kept as null.
12. **Acceptance criteria.**
    - [ ] Recent, frequent and from-plan lists show before typing.
    - [ ] "daal" finds Dal.
    - [ ] Katori, roti, cup and g units work, with 0.25 steps.
    - [ ] Live macros and the total are correct against unit tests.
    - [ ] Search works offline.
    - [ ] A custom food can be logged with unknown nutrients and shows to the trainer.
13. **Priority:** P1.
<!-- END VERBATIM TR-26 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-26.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-26.1** [guide §12] Recent, frequent and from-plan lists show before typing.
2. **TR-26.2** [guide §12] "daal" finds Dal.
3. **TR-26.3** [guide §12] Katori, roti, cup and g units work, with 0.25 steps.
4. **TR-26.4** [guide §12] Live macros and the total are correct against unit tests.
5. **TR-26.5** [guide §12] Search works offline.
6. **TR-26.6** [guide §12] A custom food can be logged with unknown nutrients and shows to the trainer.
7. **TR-26.7** [18 Oct QA] Before typing, Recent, Frequent and From your plan sections render (or a clear empty copy for each).
8. **TR-26.8** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
9. **TR-26.9** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: search field only, "Results appear here."; no Recent / Frequent / From your plan lists before typing.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **aarav.ontrack@demo.fitbud.test** · route `overlay food_search` · 18 Oct capture `fitbud-mobile-shots/ios/TR-26-food-search.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-26.png`. Save extra states as `docs/spec/evidence/TR-26--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

