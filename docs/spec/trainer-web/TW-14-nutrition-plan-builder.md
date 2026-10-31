# TW-14 · Nutrition plan builder

**ID:** TW-14 · **Name:** Nutrition plan builder · **Priority:** P1 · **Route/screen:** the same builder route with `?tab=nutrition`; template mode `/templates/nutrition/:tid` · **Batch:** TW-D (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/components/plan-composition/PlanCompositionEditor.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `builder/MealsPane` [new]

**API (from the guide):** plan version get and put; `GET /libraries/foods?q`

**Code status:** the guide says "Figma-only (content partially implemented)" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-14 -->
### TW-14 · Nutrition plan builder

> **Priority:** P1 · **Route:** the same builder route with `?tab=nutrition`; template mode `/templates/nutrition/:tid` · **Files:** `PlanCompositionEditor.tsx` (meal sections) → `builder/MealsPane` [new] · **API:** plan version get and put; `GET /libraries/foods?q`

1. **Purpose.** Compose meal slots per applicable day: type, custom label, time, and items with servings and quantities. Nutrition totals are calculated, and unknown values stay unknown.
2. **Entry.** The same as TW-13.
3. **Legacy (do not keep).** Composition editor meal sections. Food library items are being migrated to a canonical basis (per 100 g or ml) plus serving conversions (10 Oct contract gap).
4. **Gaps to close.** No meal time field (the contract needs an explicit time). No applicable-days control. Totals don't show unknown values honestly. No Indian serving labels in the UI.
5. **Target design.**
   - **Left pane:** day applicability. Choose "Every day", or pick days. Several day patterns are allowed, for example "Training days" vs "Rest days".
   - **Centre:** meal slot cards, each with
     - **Meal type** (breakfast, lunch, snack, dinner, pre/post-workout),
     - a **label** ("Meal 1"),
     - a **time** (a required time picker that sets the *default* time; the trainee may adjust their own time later, D24, and reminders follow the trainee's time),
     - and items. Each item has the food name, a serving select (food-specific, for example "1 katori (150 g)", "1 roti (40 g)", "100 g"), a quantity stepper, and calculated kcal, P, C and F. A value is shown as "—" with the tooltip "Not known for this food" when the basis is null.
     - Slot totals show "≥ 420 kcal" plus the footnote "+1 item with unknown calories" when any value is unknown.
     - Each slot has an optional **photo requested** switch (if configuration says "selected meals") and **instructions**.
   - **Right:** a food library drawer with search, a veg / non-veg / egg filter (only if the food classification includes it; otherwise omit), and *Add to meal*.
   - **Day total bar:** kcal and macros for the selected day, with the same unknown rule.
6. **States.** As in TW-13. A missing meal time blocks publish ("Set a time for Snack 2 so reminders work").
7. **Edge cases.**
   - Changing a food in the library later doesn't alter the plan, because copies are snapshots (contract). Show "From library · snapshot" in the item's caption.
   - Allow manual items ("Home-cooked dal, 1 bowl") with nutrition left unknown.
8. **Deep links.** None.
9. **References.**
   - Adapt: the Trainerize flexible meal planner [R23] https://help.trainerize.com/hc/en-us/articles/47042957643156-Flexible-Meal-Planner
   - Adopt: Indian food data from IFCT 2017 [R70] https://www.nin.res.in/ebooks/IFCT2017.pdf (dataset mirror: https://ifct2017.github.io/)
   - Avoid: MyFitnessPal's crowd-sourced inaccuracy [R33].
10. **UX decisions.**
    - The required meal time is the default anchor for D6 reminders. A trainee's override (TR-24) replaces it for that client only, and the plan itself never changes.
    - Showing "—" rather than 0 follows the contract ("Unknown values remain unknown") and keeps nutrition honest.
11. **Implementation.**
    - API-CHG: a meal slot gains `type`, `label` and `time` (HH:MM local) as separate attributes (decision B).
    - Nutrition totals are computed by the backend. The UI shows the backend's calculated values from preview, or computes locally with the same pure function from `packages/core` to give instant feedback.
12. **Acceptance criteria.**
    - [ ] Every slot has a type, label and time.
    - [ ] Unknown nutrients display as "—" and totals say "≥".
    - [ ] Servings come from food-specific conversions.
    - [ ] Publish is blocked without times.
13. **Priority:** P1.
<!-- END VERBATIM TW-14 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-14.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-14.1** [guide §12] Every slot has a type, label and time.
2. **TW-14.2** [guide §12] Unknown nutrients display as "—" and totals say "≥".
3. **TW-14.3** [guide §12] Servings come from food-specific conversions.
4. **TW-14.4** [guide §12] Publish is blocked without times.
5. **TW-14.5** [QA checklist #1] Left: day applicability ("Every day" or picked days).
6. **TW-14.6** [QA checklist #2] Meal slot cards, each with **Meal type**, **label**, a required **time**, and items.
7. **TW-14.7** [QA checklist #3] Each item: food name, a food-specific serving select ("1 katori (150 g)", "1 roti (40 g)"), a quantity stepper, and kcal/P/C/F.
8. **TW-14.8** [QA checklist #4] An unknown nutrient shows "—" with the tooltip "Not known for this food". Totals show "≥ … kcal" plus "+1 item with unknown calories".
9. **TW-14.9** [QA checklist #5] Right: a food library drawer with search and *Add to meal*. A day total bar at the bottom.
10. **TW-14.10** [QA checklist #6] A missing meal time blocks publish ("Set a time for … so reminders work"). Item caption "From library · snapshot".
11. **TW-14.11** [18 Oct QA] No "Library snapshot <uuid>" text.
12. **TW-14.12** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
13. **TW-14.13** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Code at 7f74108: `PlanCompositionEditor.tsx:247,1047` show "Library snapshot <uuid>". The guide wants the caption "From library · snapshot" (checklist TW-14 #6).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** template mode `/templates/diets/e1c7e062-9478-4378-949a-dfea84a7bfa8` (also base `/templates/diets/92918a3a-49bc-574f-b1b5-311684b40adf`). Client mode: the same builder route as TW-13 with `?tab=nutrition`.
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-14.png`. This screen has mobile-web rules, so also save **390×844** as `docs/spec/evidence/TW-14-390.png`. Save extra states as `docs/spec/evidence/TW-14--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

