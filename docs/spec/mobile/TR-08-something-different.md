# TR-08 · "Something different" (meal change sheet, with food logging)

**ID:** TR-08 · **Name:** "Something different" (meal change sheet, with food logging) · **Priority:** P0 (sheet, chips), P1 (food logging, TR-26) · **Route/screen:** `MealSheet` (bottom sheet over Diet or Today) → `FoodSearch` (TR-26) · **Batch:** M-2 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainee/MealDeviationScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/trainee/SomethingDifferentSheet.tsx` (exists)

**API (from the guide):** meal deviate (API-CHG: kind `logged_foods` with `items[]`); trainee food search (API-NEW)

**Code status:** old code exists (the guide labelled it "Implemented (full screen)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-08 -->
### TR-08 · "Something different" (meal change sheet, with food logging)

> **Priority:** P0 · **Screen:** `MealSheet` (bottom sheet over Diet or Today) → `FoodSearch` (TR-26) · **Files:** `src/trainee/MealDeviationScreen.tsx` (kinds: portion_adjustment, substitute, restaurant, repeat_recent, manual, other; "Save deviation") · **API:** meal deviate (API-CHG: kind `logged_foods` with `items[]`); trainee food search (API-NEW) · **Decision:** D28

1. **Purpose.** Record what was actually eaten, quickly and without judgement, **with real foods and quantities** so the rings and the trainer's view reflect reality.
2. **Entry.** MealCard "Something different", the Today next-meal card, a notification deep link `?action=change`.
3. **Legacy (do not keep).** A full-screen form titled "Meal Deviation", with the subtitle "lightweight change" and the dev copy "Photos are evidence context, not proof or lie detection." There's no food search.
4. **Gaps to close.** The title is jargon. It's a full-screen context switch. There are no smart defaults, and no way to say *what* was eaten in structured form, so the macros are unknown.
5. **Target design.** A modal **bottom sheet** ([R49]) titled "What did you have instead?".
   - **Primary path: "Log what I ate"** (a full-width button at the top), which opens **TR-26 Food search**, prefilled with the planned items as editable rows:
     - Each planned item shows as a row with its quantity and serving ("2 × roti"), which the trainee can keep, change or remove.
     - **+ Add food** searches the library.
     - A running total sits at the bottom: "610 kcal · P 24 · C 80 · F 20 g", and the plan comparison "plan 520 kcal".
   - **Quick options as chips (one tap):**
     - **Smaller portion** / **Bigger portion**: a portion slider at ½×, ¾×, 1¼×, 1½×. This maps to `portion_adjustment`, and the macros are the plan × multiplier.
     - **Same as earlier meal**: lists the last 5 logged meals, with kcal. This maps to `repeat_recent`, which copies those items and their macros.
     - **Ate out**: an optional restaurant or dish text, plus an optional "Add foods" link. Without foods, the macros are unknown (the rings show "≥"). This maps to `restaurant`.
     - **Type it in**: free text, for example "2 idli, sambar", with unknown macros. Helper: "Tip: *Log what I ate* lets Rahul see the nutrition too." This maps to `manual`.
     - **Other**.
   - Optional photo (Camera or Gallery).
   - Optional note.
   - Primary: **Save**.
   - Footer link: *Ask Rahul about this meal* (TR-18).
   - Copy: no "deviation" wording anywhere in the UI. The status chip reads "Changed".
6. **States.**
   - Offline: saved to the outbox. Food search works from the on-device index (TR-26).
   - Validation: Save is disabled until an option is picked or at least one food is added.
7. **Edge cases.**
   - The sheet expands to full height when the keyboard opens.
   - Back or swipe dismisses with "Discard changes?" when something was entered.
   - Editing a changed meal later (until end of day) reopens the logged items.
   - A late log uses the same sheet (D23).
8. **Deep links.** `/meal/:id?action=change` and `/meal/:id/foods` (straight to TR-26).
9. **References.**
   - Material 3 bottom sheets [R49] https://m3.material.io/components/bottom-sheets/guidelines
   - MyFitnessPal Quick Add [R32] and Copy meal [R31].
   - HealthifyMe Indian food logging [R34].
10. **UX decisions.**
    - Structured food logging is the *recommended* path, because it feeds the rings and the trainer's view. The chips stay for speed.
    - Prefilling the plan's items means the trainee only edits what differed. Usually that's one or two taps.
    - The neutral language avoids shame.
11. **Implementation.**
    - Use `@gorhom/bottom-sheet` or an equivalent.
    - API-CHG: add the deviation kind `logged_foods` with `items: [{foodId|null, customName?, servingId|null, unit, quantity, grams|null, kcal|null, protein|null, carbs|null, fat|null}]` and the computed `totals` (server recomputes from `foodId` and serving; client values are only for offline display).
    - Other kinds may also carry `items` (portion, repeat) so totals are always derivable.
    - The portion multiplier goes into the deviation details.
    - The trainer sees the items in TW-17.
12. **Acceptance criteria.**
    - [ ] The common change can be saved in 3 taps or fewer.
    - [ ] "Log what I ate" prefills the planned items, and the totals update live.
    - [ ] The saved foods drive the TR-06 rings and the TW-17 meal panel.
    - [ ] Works offline.
    - [ ] No "deviation" word in the UI.
13. **Priority:** P0 (sheet, chips), P1 (food logging, TR-26).
<!-- END VERBATIM TR-08 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-08.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-08.1** [guide §12] The common change can be saved in 3 taps or fewer.
2. **TR-08.2** [guide §12] "Log what I ate" prefills the planned items, and the totals update live.
3. **TR-08.3** [guide §12] The saved foods drive the TR-06 rings and the TW-17 meal panel.
4. **TR-08.4** [guide §12] Works offline.
5. **TR-08.5** [guide §12] No "deviation" word in the UI.
6. **TR-08.6** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
7. **TR-08.7** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: the bottom sheet "What did you have instead?" renders over Diet; no failure noted. Verify the full check list.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **lakshmi.foods@demo.fitbud.test** · route `tab diet › Something different sheet` · 18 Oct capture `fitbud-mobile-shots/ios/TR-08-something-different-sheet.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-08.png`. Save extra states as `docs/spec/evidence/TR-08--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

