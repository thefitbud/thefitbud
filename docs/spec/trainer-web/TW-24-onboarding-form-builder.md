# TW-24 · Onboarding form builder

**ID:** TW-24 · **Name:** Onboarding form builder · **Priority:** P1 · **Route/screen:** `/templates/onboarding/:tid` · **Batch:** TW-F (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/templates/OnboardingTemplates.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/pages/templates/onboardingBuilder.ts` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** onboarding form templates and versions

**Code status:** old code exists (the guide labelled it "Implemented (inline)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-24 -->
### TW-24 · Onboarding form builder

> **Priority:** P1 · **Route:** `/templates/onboarding/:tid` · **Files:** `pages/templates/OnboardingTemplates.tsx`, `onboardingBuilder.ts` · **API:** onboarding form templates and versions

1. **Purpose.** Create and edit intake forms. MVP field types: short text, long text, single choice, multiple choice, number, yes/no.
2. **Entry.** Templates, Onboarding forms.
3. **Legacy (do not keep).** `shots/d1440_06_templates_1_Onboarding.png`. An inline builder.
4. **Gaps to close.** Not a full page. No trainee-facing preview side by side. No highlight flag (TW-10). Field type coverage needs checking against the 10 Oct six-type contract.
5. **Target design.**
   - **Two panes.** Left: a question list with drag handles (add, choose type, reorder, duplicate, delete). Each question has a label, help text, required toggle, type-specific settings (choices with stable ids, number min, max and unit) and **Highlight for coach** (API-NEW).
   - Right: a **live phone preview** of TR-03.
   - Top: "Draft · will save as v4" and **Save version**.
   - No branching, no scoring (MVP).
6. **States.** Validation: a choice question needs at least 2 options. Duplicate labels show a warning.
7. **Edge cases.** Saving creates a new version. Existing invitations keep their pinned version.
8. **Deep links.** None.
9. **References.**
   - Trainerize onboarding forms [R20].
   - Everfit onboarding flow [R13].
10. **UX decisions.** The preview prevents trainee-facing surprises.
11. **Implementation.** Reuse `onboardingBuilder.ts` logic. `FormRenderer` powers the preview.
12. **Acceptance criteria.**
    - [ ] All six types supported.
    - [ ] Reorder, duplicate and delete work.
    - [ ] The preview is live.
    - [ ] Save creates a version.
13. **Priority:** P1.
<!-- END VERBATIM TW-24 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-24.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-24.1** [guide §12] All six types supported.
2. **TW-24.2** [guide §12] Reorder, duplicate and delete work.
3. **TW-24.3** [guide §12] The preview is live.
4. **TW-24.4** [guide §12] Save creates a version.
5. **TW-24.5** [QA checklist #1] Two panes: a question list (drag handles, add / type / reorder / duplicate / delete) and a **live phone preview** on the right.
6. **TW-24.6** [QA checklist #2] Each question: label, help text, required toggle, type settings, "Highlight for coach".
7. **TW-24.7** [QA checklist #3] All six types are available: short text, long text, single choice, multiple choice, number, yes/no.
8. **TW-24.8** [QA checklist #4] Top: "Draft · will save as vN" plus **Save version**.
9. **TW-24.9** [QA checklist #5] A choice question with <2 options shows a validation error, and duplicate labels show a warning. No branching or scoring.
10. **TW-24.10** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
11. **TW-24.11** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- RCA.md §4: `pages/templates/OnboardingTemplates.tsx` changed by +21/−5 only. The guide asks for a two-pane builder with a live phone preview, so this is the legacy inline builder.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `/templates/onboarding/10111111-1111-4111-8111-111111111111` (global; expect read-only or Fork) · Fork it first to edit a "Mine" copy.
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-24.png`. Save extra states as `docs/spec/evidence/TW-24--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

