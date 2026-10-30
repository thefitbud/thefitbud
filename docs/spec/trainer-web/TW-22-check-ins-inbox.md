# TW-22 · Check-ins inbox (all clients)

**ID:** TW-22 · **Name:** Check-ins inbox (all clients) · **Priority:** P0 · **Route/screen:** `/checkins` (`?view=due|overdue|submitted|reviewed`) · **Batch:** TW-E (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/CheckinsPage.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** check-in trainer inbox

**Code status:** old code exists (the guide labelled it "Implemented (P0 bug)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-22 -->
### TW-22 · Check-ins inbox (all clients)

> **Priority:** P0 · **Route:** `/checkins` (`?view=due|overdue|submitted|reviewed`) · **Files:** `pages/CheckinsPage.tsx` · **API:** check-in trainer inbox

1. **Purpose.** Process check-ins across all clients.
2. **Entry.** Navigation, Home section "View all", bell.
3. **Legacy (do not keep).** `shots/d1440_05_checkins.png`. Due, Overdue and Submitted tabs with counts. **It lists relationship UUIDs instead of client names.**

4. **Gaps to close.** UUIDs are shown. There's no Reviewed tab. No quick nudge for overdue items.
5. **Target design.**
   - Tabs: **To review** (submitted, the default) · Due · Overdue · Reviewed (last 14 days), each with a count.
   - Rows show client (avatar and name) · form · submitted or due time · chips · action. To review: **Review**. Overdue: **Nudge** plus *WhatsApp*. Due: no action.
   - **Review mode:** opening a check-in from To review keeps a "Next ›" control in the review screen (TW-20), so the trainer can go through the queue.
6. **States.** Empty "To review": "No check-ins waiting. Nice." Error.
7. **Edge cases.** Ended clients are excluded.
8. **Deep links.** `/go/checkin/:id`.
9. **References.** Everfit check-in dashboard [R6] (image under TW-04).
10. **UX decisions.** Default to the tab that needs action.
11. **Implementation.** **P0:** include `traineeDisplayName` in the inbox read model (as `GET /exceptions/attention` already does: `traineeDisplayName: nameByUserId.get(...)` in `routes/exceptions.ts`), or resolve it on the client.
12. **Acceptance criteria.**
    - [ ] No UUIDs.
    - [ ] The To review tab is the default.
    - [ ] Next › works in review mode.
13. **Priority:** P0.
<!-- END VERBATIM TW-22 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-22.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-22.1** [guide §12] No UUIDs.
2. **TW-22.2** [guide §12] The To review tab is the default.
3. **TW-22.3** [guide §12] Next › works in review mode.
4. **TW-22.4** [QA checklist #1] Tabs **To review** (default, selected) · Due · Overdue · Reviewed, each with a count.
5. **TW-22.5** [QA checklist #2] Rows show the client **name plus avatar (no UUIDs)**, form, submitted or due time, chips and an action.
6. **TW-22.6** [QA checklist #3] To review → **Review**. Overdue → **Nudge** plus *WhatsApp* (wa.me). Due → no action.
7. **TW-22.7** [QA checklist #4] Ended clients (Kavya, Nikhil) **excluded**.
8. **TW-22.8** [QA checklist #5] Empty To review: "No check-ins waiting. Nice."
9. **TW-22.9** [18 Oct QA] `/checkins?view=submitted` lists no Kavya or Nikhil row.
10. **TW-22.10** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
11. **TW-22.11** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Checklist pre-observed / USAGE.md: `GET /checkins/inbox?view=submitted` returns 18 items, 3 each from the **ended** relationships Kavya (b9f016…) and Nikhil (8919b5…). They must be excluded (API fix in Batch 0, UI check here).
- Guide legacy (`img/impl_d1440_05_checkins.jpg`): rows show relationship UUIDs instead of names (backlog #4, P0).
- Code at 7f74108: `pages/CheckinsPage.tsx:173` has a manual "Refresh" button.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `/checkins`
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-22.png`. Save extra states as `docs/spec/evidence/TW-22--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

