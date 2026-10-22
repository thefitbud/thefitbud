# TW-23 · Templates hub (type tabs)

**ID:** TW-23 · **Name:** Templates hub (type tabs) · **Priority:** P1 · **Route/screen:** `/templates/:type` (type ∈ `workouts`, `diets`, `full-plans`, `checkins`, `onboarding`, `libraries`; `/templates` redirects to `/templates/workouts`), with `?scope=all|bases|mine&q=` · **Batch:** TW-F (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/TemplatesPage.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/pages/templates/PlanTemplateFamily.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/pages/templates/OnboardingTemplates.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/pages/templates/LibrariesPanel.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/pages/templates/shared.ts` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/pages/templates/useCursorPage.ts` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/pages/TemplatesHub.tsx`
- `apps/trainer-web/src/lib/http-api.ts` (envelope bug, Batch 0)

**API (from the guide):** `GET/POST /templates` (`templateType` workout, nutrition or combined), get, put (with `expectedVersion`), delete; onboarding form templates; check-in form templates (`/checkins/form-templates`); `/libraries`

**Code status:** old code exists (the guide labelled it "Implemented (needs rework)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 1814–1895. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-23 -->
### TW-23 · Templates hub (type tabs)

> **Priority:** P1 · **Route:** `/templates/:type` (type ∈ `workouts`, `diets`, `full-plans`, `checkins`, `onboarding`, `libraries`; `/templates` redirects to `/templates/workouts`), with `?scope=all|bases|mine&q=` · **Files:** `pages/TemplatesPage.tsx` ("Templates & Libraries"), `pages/templates/PlanTemplateFamily.tsx` (fork, apply), `OnboardingTemplates.tsx`, `LibrariesPanel.tsx`, `shared.ts`, `useCursorPage.ts` · **API:** `GET/POST /templates` (`templateType` workout, nutrition or combined), get, put (with `expectedVersion`), delete; onboarding form templates; check-in form templates (`/checkins/form-templates`); `/libraries` · **Decision:** D26

1. **Purpose.** Manage reusable starting points: use the global bases as they are, fork them, or create your own. Maintain the exercise and food libraries.
2. **Entry.** Navigation, and the builder's *Duplicate as template*.
3. **Legacy (do not keep).** `shots/d1440_06_templates*.png`. Family tabs with counts (Onboarding · Workout · Nutrition · Combined · Libraries), Global (read-only) and Trainer badges, Fork and New version. Cards are tiny on a large canvas. Open and Read versions expand inline. Libraries is about 6,200 px tall.

   ![Figma vs implemented templates](../img/sbs_templates.jpg){.shot}

4. **Gaps to close.**
   - There's no Check-in forms family in the UI (the route exists in the API).
   - No clear separation between global and mine.
   - Inline expansion pushes content down.
   - The labels "Nutrition" and "Combined" are model words, not trainer words.
   - Figma shows usage counts and "Verified", which are banned.
5. **Decision: subtabs or filter pills (D26).** The user suggested type subtabs instead of filter pills. **Adopted, as a secondary tab bar of six tabs.** The global-or-own **scope** stays a filter inside each tab.

   | Option | For | Against |
   |---|---|---|
   | **Secondary tab bar, one tab per type** (chosen) | Each type is a **different object** with its own editor, its own card summary ("4 days · 18 exercises" against "12 questions") and its own actions (plans: Use for client; forms: Set as default; libraries: a table, not cards). Tabs are meant for switching between peer views of different content, while filters narrow one homogeneous set (Material 3 tabs [R86]; NN/g "Tabs, used right" [R87]; NN/g "Filters vs facets" [R88]). Every tab gets its own URL (`/templates/diets`), so the browser back button and deep links work. **The current code already renders families as tabs**, so the effort is renaming, reordering, adding Check-ins, and routing each tab. Libraries stops being a hidden 6,200 px panel. | Six tabs need short labels. Below 768 px the bar scrolls horizontally, and the last tabs can be off-screen. You can't see all types in one list. |
   | Filter pills on one combined list | One search over everything. Multi-select. | It mixes cards whose actions and summaries differ, so each card needs a type badge, which adds noise. Libraries don't fit a card list at all. Pills are also how the scope filter appears, so two pill rows would compete. It's more work, because today's tabs would have to be torn out. |

   **Mitigations for the trade-offs:**
   - Labels are one or two words.
   - Order follows frequency of use: Workouts · Diets · Full plans · Check-ins · Onboarding · Libraries.
   - Each tab carries a count badge (Mine count) so empty types are obvious.
   - The ⌘K palette (TW-03) searches template titles across all types, which covers the "one search over everything" case.
   - Below 768 px the bar scrolls with fade edges.
6. **Target design.**
   - **Secondary tab bar** under the page title. The labels and their model mapping:

     | Tab label | Holds | Model |
     |---|---|---|
     | **Workouts** | Workout templates | `templateType: workout` |
     | **Diets** | Diet templates | `templateType: nutrition` |
     | **Full plans** | Workout plus diet | `templateType: combined` |
     | **Check-ins** | Check-in forms | check-in form templates |
     | **Onboarding** | Intake forms | onboarding form templates |
     | **Libraries** | Exercises and Foods, as a segmented control inside the tab | `/libraries` |

   - **Inside each template tab:**
     - **Scope** segmented control: **All · FitBud bases · Mine**, with counts. The default is All, with bases first.
     - Search box.
     - **New** button ("New workout template", and so on).
   - **Card grid** (3 columns at 1280). Each card shows the title, owner chip (FitBud base or Mine), "Updated 3 Oct", a structure summary and the actions:
     - Base: **Use** (primary: plans open the client picker and then TW-16; forms are set as the default for new invites or check-ins) and *Fork to edit*.
     - Mine: **Edit** (primary) and ⋯ Duplicate, Delete (blocked when a form version is pinned, with the copy "Forms in use can't be deleted").
   - Clicking a card opens the **full-page editor**: TW-13 or TW-14 in template mode, or TW-24 or TW-25. The **Libraries** tab shows TW-26.
   - No usage counts, no "Verified", no ratings.
7. **States.**
   - Empty "Mine" in a tab: "You haven't made any diet templates yet. Fork a FitBud base or start blank."
   - Empty search: "No templates match 'pcod'."
   - Errors are per tab, with Retry.
8. **Edge cases.**
   - Editing a base is impossible. The UI offers Fork instead, because the API rejects in-place mutation of global templates.
   - Plan templates are edited in place with `recordVersion` (409 on a stale save). Form templates create new immutable versions on save ("Saved as v4. Clients already invited keep their version.").
   - Old links to `/templates?family=…`, if any, redirect to the matching tab.
9. **Deep links.** `/templates/:type` is linkable.
10. **References.**
    - Adopt: Material 3 tabs, secondary tabs [R86] https://m3.material.io/components/tabs/guidelines
    - Adopt: NN/g "Tabs, used right" [R87] https://www.nngroup.com/articles/tabs-used-right/ and "Filters vs facets" [R88] https://www.nngroup.com/articles/filters-vs-facets/
    - Adapt: Everfit premade program templates [R11] and TrueCoach programs [R3].
    - Avoid: Figma's usage and retention counts (`screens/trainer_03_templates.png`).
11. **UX decisions and why.**
    - Tabs separate *kinds of thing*. The scope filter narrows *within* a kind. Use/Fork stays on the card, where the decision is made.
    - The Use/Fork vocabulary maps directly onto the 10 Oct ownership contract.
    - Full-page editors replace the inline expansion.
12. **Implementation.**
    - Rename and reorder the existing family tabs into `TemplateTypeTabs`. Each tab is a route under `/templates/:type`.
    - Add the Check-ins tab using the existing `checkinFormTemplateRoutes`.
    - Map UI slugs to API types in `packages/core/src/labels.ts`.
    - `TemplateCard` and `ScopeFilter` components.
13. **Acceptance criteria.**
    - [ ] Six tabs, in the stated order, each with its own URL.
    - [ ] Scope filter and search inside each template tab.
    - [ ] Bases are read-only, with Use and Fork.
    - [ ] Mine is editable.
    - [ ] The deletion guard is in place.
    - [ ] No usage counts.
    - [ ] The bar scrolls at 390 px without wrapping.
14. **Priority:** P1.
<!-- END VERBATIM TW-23 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- **LEGACY + REFERENCE (side by side): left = Figma/Stitch reference for density and hierarchy only (its banned elements, per 00-foundations.md §1.5, must not be built); right = old implemented UI, LEGACY: do not copy** (embedded in the guide section): `sbs_templates.jpg`

  ![sbs_templates.jpg](../img/sbs_templates.jpg)

- **LEGACY: shows old UI, do not copy** (cited by the section or by guide Appendix D): `impl_d1440_06_templates.jpg`

  ![impl_d1440_06_templates.jpg](../img/impl_d1440_06_templates.jpg)

- **LEGACY: shows old UI, do not copy** (cited by the section or by guide Appendix D): `impl_d1440_06_templates_3_New_trainer_template.jpg`

  ![impl_d1440_06_templates_3_New_trainer_template.jpg](../img/impl_d1440_06_templates_3_New_trainer_template.jpg)

- **LEGACY: shows old UI, do not copy** (cited by the section or by guide Appendix D): `impl_d1440_06_templates_4_Open.jpg`

  ![impl_d1440_06_templates_4_Open.jpg](../img/impl_d1440_06_templates_4_Open.jpg)

- **REFERENCE: target/inspiration (Figma). Remove every banned element listed in this section and in §1.5** (cited by the section or by guide Appendix D): `figma_trainer_03_templates.jpg`

  ![figma_trainer_03_templates.jpg](../img/figma_trainer_03_templates.jpg)

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-23.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-23.1** [guide §12] Six tabs, in the stated order, each with its own URL.
2. **TW-23.2** [guide §12] Scope filter and search inside each template tab.
3. **TW-23.3** [guide §12] Bases are read-only, with Use and Fork.
4. **TW-23.4** [guide §12] Mine is editable.
5. **TW-23.5** [guide §12] The deletion guard is in place.
6. **TW-23.6** [guide §12] No usage counts.
7. **TW-23.7** [guide §12] The bar scrolls at 390 px without wrapping.
8. **TW-23.8** [QA checklist #1] A secondary tab bar of exactly six tabs in order: **Workouts · Diets · Full plans · Check-ins · Onboarding · Libraries**. Each has its own URL, and Back works.
9. **TW-23.9** [QA checklist #2] Inside each template tab: a scope control **All · FitBud bases · Mine** (with counts), search, and a **New …** button.
10. **TW-23.10** [QA checklist #3] Card grid (3 columns at 1280): title, owner chip (FitBud base / Mine), "Updated <date>", structure summary.
11. **TW-23.11** [QA checklist #4] Base cards: **Use** (primary) plus *Fork to edit*, no Edit. Mine cards: **Edit** plus ⋯ Duplicate/Delete. A pinned form shows "Forms in use can't be deleted".
12. **TW-23.12** [QA checklist #5] **No usage counts, no "Verified", no ratings.** Labels say "Diets/Full plans", not "Nutrition/Combined".
13. **TW-23.13** [QA checklist #6] Empty Mine: "You haven't made any … templates yet. Fork a FitBud base or start blank." Empty search: "No templates match 'pcod'."
14. **TW-23.14** [QA checklist #7] At 390 px the tab bar scrolls horizontally without wrapping.
15. **TW-23.15** [18 Oct QA] `/templates/workouts` loads the list (5 FitBud bases + 1 Mine) with no "Could not load this list".
16. **TW-23.16** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
17. **TW-23.17** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- USAGE.md: the web shows "Could not load this list" on templates. `apps/trainer-web/src/lib/http-api.ts:30–31` parses the whole `{data:…}` envelope with `planTemplateListResponseSchema` (fails: "items Required"); it must parse `.data`. The API is fine (`/templates?templateType=workout` → 6 items: 5 bases, 1 mine).
- Code at 7f74108: `pages/TemplatesPage.tsx:93` H1 still reads "Templates & Libraries" (banned).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** `/templates` (should redirect to `/templates/workouts`), `/templates/diets`, `/templates/full-plans`, `/templates/checkins`, `/templates/onboarding`, `/templates/libraries`, plus `?scope=bases` / `?scope=mine` / `&q=pcod`
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-23.png`. This screen has mobile-web rules, so also save **390×844** as `docs/spec/evidence/TW-23-390.png`. Save extra states as `docs/spec/evidence/TW-23--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

