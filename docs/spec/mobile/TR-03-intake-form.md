# TR-03 · Intake form

**ID:** TR-03 · **Name:** Intake form · **Priority:** P1 · **Route/screen:** `Intake` · **Batch:** M-1 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/screens/IntakeScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** `GET /onboarding/forms/current`, `PUT …/draft`, `POST …/submit`; `PUT /me/trainee-profile` (DOB, gender)

**Code status:** old code exists (the guide labelled it "Implemented"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-03 -->
### TR-03 · Intake form

> **Priority:** P1 · **Screen:** `Intake` · **Files:** `src/screens/IntakeScreen.tsx` (draft, submit) · **API:** `GET /onboarding/forms/current`, `PUT …/draft`, `POST …/submit`; `PUT /me/trainee-profile` (DOB, gender)

1. **Purpose.** Answer the trainer's onboarding questions.
2. **Entry.** After join, or resuming a draft.
3. **Legacy (do not keep).** Draft and submit work.
4. **Gaps to close.** Probably one long scroll. Progress isn't shown. Field types must cover all six.
5. **Target design.**
   - **One section per screen**, with a progress bar ("2 of 5").
   - Fields rendered by `FormRenderer`: short or long text, single choice (radio cards), multiple choice (chips), number (numeric keypad with unit), yes/no (two big buttons).
   - Autosave the draft on every change (debounced), with "Saved" shown in the header.
   - Last screen: a **Review** summary with Edit links, then **Send to Rahul**.
   - Profile basics (date of birth, gender) are asked first only if they're missing.
6. **States.**
   - Offline: answers are saved locally and sent when back online. Submit queues: "Will send when you're online."
   - Validation is inline, per field.
7. **Edge cases.** The form version is pinned (contract): render the pinned version even if the trainer edits the template later.
8. **Deep links.** `/intake`.
9. **References.**
   - Fitbod's one-question-per-screen onboarding [R40] https://www.botsi.com/resources/flows/apps/fitbod (adapt by sectioning rather than one question per screen).
   - Everfit onboarding flow [R13].
10. **UX decisions.** Sectioning lowers the perceived length. Autosave prevents data loss.
11. **Implementation.** Shared `FormRenderer` (also used by TR-14 and the TW-24 preview).
12. **Acceptance criteria.**
    - [ ] All six types.
    - [ ] Autosave.
    - [ ] Offline queue.
    - [ ] Review step.
13. **Priority:** P1.
<!-- END VERBATIM TR-03 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-03.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-03.1** [guide §12] All six types.
2. **TR-03.2** [guide §12] Autosave.
3. **TR-03.3** [guide §12] Offline queue.
4. **TR-03.4** [guide §12] Review step.
5. **TR-03.5** [18 Oct QA] One section per screen with "N of M" progress.
6. **TR-03.6** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
7. **TR-03.7** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: the intake form renders as one long form (cropped at the viewport). The guide wants one section per screen with a progress bar.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **vikram.onboarding@demo.fitbud.test** · route `intake` · 18 Oct capture `fitbud-mobile-shots/ios/TR-03-intake.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-03.png`. Save extra states as `docs/spec/evidence/TR-03--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

