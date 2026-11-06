# TR-04 · Waiting for coach

**ID:** TR-04 · **Name:** Waiting for coach · **Priority:** P1 · **Route/screen:** `Waiting` · **Batch:** M-1 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/screens/WaitingReviewScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**Code status:** old code exists (the guide labelled it "Implemented"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-04 -->
### TR-04 · Waiting for coach

> **Priority:** P1 · **Screen:** `Waiting` · **Files:** `src/screens/WaitingReviewScreen.tsx` (green `#D1FAE5` banner, "Refresh status")

1. **Purpose.** Holds the trainee after intake until the plan is ready, without them feeling stuck.
2. **Entry.** After submit, and on app open while the status is `onboarding_submitted` or `coaching_ready` without an effective plan.
3. **Legacy (do not keep).** A green banner and a Refresh button.
4. **Gaps to close.** Manual refresh. No expectations set. No useful action.
5. **Target design.**
   - Illustration-free calm card: "Rahul is preparing your plan".
   - A checklist (derived status):
     - ✓ Joined
     - ✓ Intake sent (Mon 12 Oct)
     - ○ Coach reviews your answers
     - ○ Your plan is ready
   - **Meanwhile:**
     - **Set up reminders** (TR-05, when not done).
     - **Add your starting weight** (optional, creating a measurement).
     - **Message Rahul on WhatsApp** (prefilled "Hi Rahul, I've filled my FitBud intake…").
   - Auto-refresh on app focus, and on realtime or push P-PLAN.
6. **States.** Status coaching_ready with no plan: step 3 is ticked, with "Rahul is building your plan."
7. **Edge cases.** Use the neutral or info banner, not green, because nothing is "successful" yet.
8. **Deep links.** `/waiting`.
9. **References.** No strong external reference.
10. **UX decisions.** Give the trainee useful tasks during the wait, and use it to set up reminders.
11. **Implementation.** Poll on focus. The push P-PLAN routes to Today.
12. **Acceptance criteria.**
    - [ ] Auto-advances when the plan becomes effective.
    - [ ] The checklist reflects the derived status.
13. **Priority:** P1.
<!-- END VERBATIM TR-04 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-04.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-04.1** [guide §12] Auto-advances when the plan becomes effective.
2. **TR-04.2** [guide §12] The checklist reflects the derived status.
3. **TR-04.3** [18 Oct QA] sneha.review lands directly on the waiting screen (no Choose mode); there's no "Refresh status" button (auto-refresh on focus).
4. **TR-04.4** [product rule] Lists refresh by **pull-to-refresh** (the shared Screen wrapper). There's no manual "Refresh" button.
5. **TR-04.5** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
6. **TR-04.6** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: sneha.review first lands on **Choose mode** (`/me` returned trainee+trainer for a trainee-only seed account); after picking Trainee the waiting screen looks right. Console: 403 errors (no visible banner).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **sneha.review@demo.fitbud.test** · route `role_select → Trainee → waiting_review` · 18 Oct capture `fitbud-mobile-shots/ios/TR-04-waiting-for-coach.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-04.png`. Save extra states as `docs/spec/evidence/TR-04--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

