# TM-06 · Check-in review (mobile, lite)

**ID:** TM-06 · **Name:** Check-in review (mobile, lite) · **Priority:** P1 · **Route/screen:** — · **Batch:** M-8 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainer/CheckinReviewScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**Code status:** old code exists (the guide labelled it "Implemented"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TM-06 -->
### TM-06 · Check-in review (mobile, lite)

> **Priority:** P1 · **Files:** `src/trainer/CheckinReviewScreen.tsx` (Record Outcome, Schedule Next, Record Note)

1. **Purpose.** Review a check-in on the phone.
2. **Entry.** TM-05, push.
3. **Legacy (do not keep).** Three actions.
4. **Gaps to close.** Long scroll before the actions. No client-visible note (D20).
5. **Target design.**
   - Answers, then measurements with change, then photos (tap for fullscreen and compare), then "Since last check-in" counts.
   - **Sticky bottom sheet:** an outcome segmented control, a note field with the **Visible to client** switch (TW-34) and **Save review**.
6. **States.** As in TW-20.
7. **Edge cases.** Photos load lazily.
8. **Deep links.** `/coach/checkin/:id`.
9. **References.** Everfit [R7].
10. **UX decisions.** The sticky sheet keeps the outcome in reach.
11. **Implementation.** Bottom sheet component.
12. **Acceptance criteria.**
    - [ ] Save review is reachable without scrolling.
13. **Priority:** P1.
<!-- END VERBATIM TM-06 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TM-06.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TM-06.1** [guide §12] Save review is reachable without scrolling.
2. **TM-06.2** [18 Oct QA] No ISO dates, no lowercase raw status ("submitted"); the outcome control and Save review are visible at 393×852 without scrolling.
3. **TM-06.3** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
4. **TM-06.4** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: "submitted · Due 2026-10-11"; the exception list repeats raw ISO dates and lowercase status.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **rahul.coach@demo.fitbud.test** · route `checkins › first check-in` · 18 Oct capture `fitbud-mobile-shots/ios/TM-06-check-in-review.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TM-06.png`. Save extra states as `docs/spec/evidence/TM-06--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

