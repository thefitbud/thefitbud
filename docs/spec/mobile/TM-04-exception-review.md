# TM-04 · Exception review (mobile)

**ID:** TM-04 · **Name:** Exception review (mobile) · **Priority:** P1 · **Route/screen:** — · **Batch:** M-7 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainer/ExceptionReviewScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** as in TW-05

**Code status:** old code exists (the guide labelled it "Implemented"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TM-04 -->
### TM-04 · Exception review (mobile)

> **Priority:** P1 · **Files:** `src/trainer/ExceptionReviewScreen.tsx` (Acknowledge and Resolve) · **API:** as in TW-05

1. **Purpose.** Acknowledge or resolve on the go.
2. **Entry.** TM-01, push.
3. **Legacy (do not keep).** Acknowledge and Resolve buttons are present.
4. **Gaps to close.** No source context. No reminder context. The verbs are unexplained.
5. **Target design.** The same content as TW-05 in a full-screen stack, with a sticky bottom pair of buttons: **Mark reviewed** or **Resolve** (state-dependent), plus *Nudge*. ⋯ offers Add note (TW-34 composer, with the visibility switch) and WhatsApp. The resolve helper adds: "Resolving locks this item, so Priya can't log it late anymore" (D23).
6. **States.** As in TW-05.
7. **Edge cases.** As in TW-05.
8. **Deep links.** `/coach/exception/:id`.
9. **References.** As in TW-05.
10. **UX decisions.** Parity with web semantics.
11. **Implementation.** Share the copy and label maps with web through `packages/copy` and `packages/core`.
12. **Acceptance criteria.**
    - [ ] The same verbs and helper copy as web.
13. **Priority:** P1.
<!-- END VERBATIM TM-04 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TM-04.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TM-04.1** [guide §12] The same verbs and helper copy as web.
2. **TM-04.2** [18 Oct QA] No "Source meal_assignment", no "Rule mvp.v2", no "(2026-09-21)". The reason line reads like "Missed breakfast · Mon 21 Sep".
3. **TM-04.3** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
4. **TM-04.4** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: "Source meal_assignment · Rule mvp.v2" raw internals; "Breakfast (2026-09-21)".

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **rahul.coach@demo.fitbud.test** · route `attention › first exception` · 18 Oct capture `fitbud-mobile-shots/ios/TM-04-exception-review.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TM-04.png`. Save extra states as `docs/spec/evidence/TM-04--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

