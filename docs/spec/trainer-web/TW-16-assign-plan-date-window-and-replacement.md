# TW-16 · Assign plan: date window and replacement preview

**ID:** TW-16 · **Name:** Assign plan: date window and replacement preview · **Priority:** P0 · **Route/screen:** a modal over the builder or plan, `?assign=1` · **Batch:** TW-D (see `../BATCHES.md`)

**Files to touch:**
- `components/plan/AssignModal.tsx` [new]
- `components/DateWindowPicker.tsx` [new]
- `apps/trainer-web/src/components/plan/AssignPlanModal.tsx` (actual file; its CSS classes have no rules)

**API (from the guide):** publish, plus `POST /workouts/…/assignments/generate` and `POST /meals/…/assignments/generate` (`fromDate`, `toDate`). API-NEW combined `POST /plans/:planId/versions/:vid/assign {window, effectiveFrom, effectiveTo?, dietChangeScope?}` with a dry-run

**Code status:** the guide says "Missing" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 1544–1585. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-16 -->
### TW-16 · Assign plan: date window and replacement preview

> **Priority:** P0 · **Route:** a modal over the builder or plan, `?assign=1` · **Files:** `components/plan/AssignModal.tsx` [new], `components/DateWindowPicker.tsx` [new] · **API:** publish, plus `POST /workouts/…/assignments/generate` and `POST /meals/…/assignments/generate` (`fromDate`, `toDate`). API-NEW combined `POST /plans/:planId/versions/:vid/assign {window, effectiveFrom, effectiveTo?, dietChangeScope?}` with a dry-run

1. **Purpose.** Make a plan effective and generate its first assignment window consistently for workouts and meals. Show what gets replaced.
2. **Entry.** Builder Publish, Plan *Replace from template*, and a template *Use for client*.
3. **Legacy (do not keep).** Separate generate endpoints exist. There's no trainer workflow (an explicit gap in the contract). The seed generation 500s.
4. **Gaps to close.** Everything listed in the purpose.
5. **Target design.** A modal, 640 wide.
   1. **When does this plan start?**
      - Effective from: a date (default today, trainee-local).
      - Validity: Ongoing (default) or End on a date.
      - The copy explains: "Validity is separate from the first schedule window."
   2. **First schedule window:** three radio cards (`DateWindowPicker`).
      - **Next 7 days**: "Today, Wed 14 Oct → Tue 20 Oct".
      - **Next calendar week**: "Mon 19 Oct → Sun 25 Oct".
      - **Custom dates**: an inclusive range picker.
      - Helper: "After this, FitBud keeps the next 7 days scheduled automatically."
   3. **Preview grid:** dates by workouts and meals, with cells such as "Upper A", "Rest" and "5 meals".
   4. **Replacement**, only if a plan is active: "From Wed 14 Oct, this replaces *Fat loss v3*. 6 upcoming workouts and 28 meals that haven't started will be replaced. Anything already logged stays as it is."
   5. **Diet scope** (TW-15), when relevant.
   6. **Notify client** switch (default on). This sends P-PLAN.
   - Primary button: **Publish & schedule**.
6. **States.**
   - Dry-run loading.
   - Partial failure (meals generated, workouts failed): show which part failed with Retry. Generation is idempotent, so a retry is safe.
   - Ended: blocked.
7. **Edge cases.**
   - Trainee timezone differs from the trainer's: show every date and time in the **trainee's timezone** (D22), with a `TimezoneBadge` in the modal header ("Dates use Priya's time · Dubai · 1 h 30 m behind you").
   - Custom range longer than 28 days: show a warning.
   - Effective date in the past: not allowed.
8. **Deep links.** The trainee gets P-PLAN with a deep link to `/plan` (TR-06 opens the "What changed" card).
9. **References.** Adapt the TrueCoach program assignment to a start date [R3].
10. **UX decisions.** Implements decision B exactly. The preview prevents silent overwrites (contract: "surface actionable trainer warnings, not silent changes").
11. **Implementation.** API-NEW combined assign endpoint (preferred), so workouts and meals succeed or fail as a unit. If the endpoint isn't built yet, call publish, then both generate endpoints in sequence with idempotency keys, and surface partial failures.
12. **Acceptance criteria.**
    - [ ] The three window options produce the documented date ranges in the trainee timezone.
    - [ ] The preview matches the generated assignments.
    - [ ] The replacement counts are shown before confirming.
    - [ ] A retry is safe.
    - [ ] The client notification is optional.
13. **Priority:** P0.
<!-- END VERBATIM TW-16 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- The guide has no image for this screen. Build from the text above and `00-foundations.md`.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-16.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-16.1** [guide §12] The three window options produce the documented date ranges in the trainee timezone.
2. **TW-16.2** [guide §12] The preview matches the generated assignments.
3. **TW-16.3** [guide §12] The replacement counts are shown before confirming.
4. **TW-16.4** [guide §12] A retry is safe.
5. **TW-16.5** [guide §12] The client notification is optional.
6. **TW-16.6** [QA checklist #1] A centred modal, ~640 px wide.
7. **TW-16.7** [QA checklist #2] "When does this plan start?": Effective from (default today, client-local), Validity Ongoing / End on a date, copy "Validity is separate from the first schedule window."
8. **TW-16.8** [QA checklist #3] First schedule window: three radio cards, **Next 7 days** / **Next calendar week** / **Custom dates**, with concrete date ranges and the helper "After this, FitBud keeps the next 7 days scheduled automatically."
9. **TW-16.9** [QA checklist #4] A preview grid of dates × workouts/meals ("Upper A", "Rest", "5 meals").
10. **TW-16.10** [QA checklist #5] A replacement warning ("this replaces <plan>. N upcoming workouts and M meals … Anything already logged stays as it is.").
11. **TW-16.11** [QA checklist #6] A **Notify client** switch (default on), and the primary **Publish & schedule**.
12. **TW-16.12** [QA checklist #7] Past effective date not allowed. For Deepak (`/clients/f2a64fdb-96ad-46f3-a95e-99151b4a25f1/plan?assign=1`, needs a draft): a TimezoneBadge in the header ("Dates use Deepak's time · Dubai …").
13. **TW-16.13** [18 Oct QA] The modal has computed styles (e.g. `max-width` ≈640 px, a background and border on radio cards). No unstyled `modal-card`/`radio-row` markup.
14. **TW-16.14** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
15. **TW-16.15** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- RCA.md §4: `components/plan/AssignPlanModal.tsx` (+176, new) uses the classes `modal-card`, `modal-wide`, `radio-row`, `assign-preview` and `switch-row`, which have **no CSS rules anywhere**, so the modal renders unstyled.
- Code fact: the file is `AssignPlanModal.tsx`, not `AssignModal.tsx` as the guide says. There's no `components/DateWindowPicker.tsx` yet.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `R/plan?assign=1` (needs a draft; click **Adjust plan** first, then reload with `?assign=1`, or press Publish… in the builder)
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-16.png`. Save extra states as `docs/spec/evidence/TW-16--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

