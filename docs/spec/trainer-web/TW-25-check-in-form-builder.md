# TW-25 · Check-in form builder

**ID:** TW-25 · **Name:** Check-in form builder · **Priority:** P1 · **Route/screen:** `/templates/checkins/:tid` · **Batch:** TW-F (see `../BATCHES.md`)

**Files to touch:**
- `pages/templates/CheckinTemplates.tsx` [new]

**API (from the guide):** `/checkins/form-templates` (route mounted in `apps/api/src/index.ts`; confirm its operations)

**Code status:** the guide says "Missing (UI)" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 1929–1955. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-25 -->
### TW-25 · Check-in form builder

> **Priority:** P1 · **Route:** `/templates/checkins/:tid` · **Files:** `pages/templates/CheckinTemplates.tsx` [new] · **API:** `/checkins/form-templates` (route mounted in `apps/api/src/index.ts`; confirm its operations)

1. **Purpose.** Reusable, versioned check-in forms (decision E). Today the check-in uses a fixed MVP definition, and the mobile `CheckinScreen` hard-codes Wellbeing, Notes and Body weight.
2. **Entry.** Templates, Check-in forms. TW-11 also picks the form for a client.
3. **Legacy (do not keep).** API route present, no UI.
4. **Gaps to close.** Trainers can't customise check-ins.
5. **Target design.** The same two-pane builder as TW-24, plus **check-in blocks**:
   - **Measurement** (weight, waist, hip, chest or a custom metric with unit). A valid value creates a linked measurement record (decision E).
   - **Progress photos** (front, side, back slots).
   - **Scale 1–5** (energy, hunger, stress). Use labelled anchors ("1 · Very low … 5 · Very high"), **not** sleep or HRV device data.
   - The 6 base field types.
   - The FitBud base: "Weekly check-in": weight, waist, 3 photos, energy 1–5, hunger 1–5, "What went well?", "What was hard?", "Anything for your coach?".
6. **States.** As in TW-24.
7. **Edge cases.** A scheduled check-in pins its version. Editing creates a new version for future check-ins only.
8. **Deep links.** None.
9. **References.**
   - Everfit forms and questionnaires [R16].
   - Everfit check-in insights [R7].
10. **UX decisions.** Keep the scales self-reported and labelled. They're answers, not biometrics.
11. **Implementation.** API-CHG: the check-in definition must support the measurement and photo block types if it doesn't already. Verify against `routes/checkin-forms.ts`.
12. **Acceptance criteria.**
    - [ ] A trainer can fork the base, edit it, and assign it in TW-11.
    - [ ] The trainee sees the new form at the next check-in.
    - [ ] Measurement answers create measurement records.
13. **Priority:** P1.
<!-- END VERBATIM TW-25 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- The guide has no image for this screen. Build from the text above and `00-foundations.md`.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-25.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-25.1** [guide §12] A trainer can fork the base, edit it, and assign it in TW-11.
2. **TW-25.2** [guide §12] The trainee sees the new form at the next check-in.
3. **TW-25.3** [guide §12] Measurement answers create measurement records.
4. **TW-25.4** [QA checklist #1] The same two-pane layout as TW-24, with a live preview.
5. **TW-25.5** [QA checklist #2] Extra blocks: **Measurement** (weight, waist, hip, chest, custom with unit), **Progress photos** (front, side, back), **Scale 1–5** with labelled anchors.
6. **TW-25.6** [QA checklist #3] No sleep or HRV device fields.
7. **TW-25.7** [QA checklist #4] The base is read-only with Fork. Saving creates a new version ("Clients already invited keep their version").
8. **TW-25.8** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
9. **TW-25.9** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- No screen-specific failure recorded (the guide says no UI existed; verify what's there now).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `/templates/checkins/c1000001-0000-4000-8000-000000000001` (global "Weekly check-in")
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-25.png`. Save extra states as `docs/spec/evidence/TW-25--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

