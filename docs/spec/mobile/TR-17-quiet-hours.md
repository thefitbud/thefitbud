# TR-17 · Quiet hours

**ID:** TR-17 · **Name:** Quiet hours · **Priority:** P1 · **Route/screen:** `QuietHours` · **Batch:** M-5 (see `../BATCHES.md`)

**Files to touch:**
- (the guide lists none; find the owning file with `rg` before you start)

**API (from the guide):** `quietHoursStart` and `quietHoursEnd` (HH:MM)

**Code status:** the guide says "Missing" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.6) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-17 -->
### TR-17 · Quiet hours

> **Priority:** P1 · **Screen:** `QuietHours` · **API:** `quietHoursStart` and `quietHoursEnd` (HH:MM)

1. **Purpose.** Set the times when FitBud never sends a notification.
2. **Entry.** TR-16, TR-05.
3. **Legacy (do not keep).** None in the UI.
4. **Gaps to close.** Not built.
5. **Target design.**
   - Two time pickers (From, To), with the default 22:00–07:00 and a 24 h preview bar showing the shaded quiet period.
   - Explanation: "No notifications during these hours. Reminders that would fall here are skipped, not saved for later. Your coach can't override this."
   - Presets: "Night 10 pm–7 am", "Late night 11 pm–6 am", "Custom".
6. **States.** Validation: the range must be at least 6 h and at most 12 h. Ranges that cross midnight are handled.
7. **Edge cases.**
   - The **D7 rule:** nothing after 22:00 even if quiet hours start later. Show "FitBud never sends reminders after 10 pm."
   - Ranges are stored in local time, using the user's timezone.
8. **Notifications.** The engine **expires** (doesn't defer) time-bound reminders whose relevance passes during quiet hours (§3.6). The current code defers, so that's a change.
9. **References.** Apple HIG notifications (respect focus) [R58].
10. **UX decisions.** Expiring rather than deferring prevents a burst of stale reminders at 7 am.
11. **Implementation.** API-CHG in `apps/api/src/domain/reminders.ts`: the quiet-hours behaviour per type. Expire meal, workout and summary reminders. Defer check-in and plan reminders to quiet-hours end.
12. **Acceptance criteria.**
    - [ ] Persisted.
    - [ ] The engine respects it.
    - [ ] Nothing is sent after 22:00.
13. **Priority:** P1.
<!-- END VERBATIM TR-17 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-17.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-17.1** [guide §12] Persisted.
2. **TR-17.2** [guide §12] The engine respects it.
3. **TR-17.3** [guide §12] Nothing is sent after 22:00.
4. **TR-17.4** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
5. **TR-17.5** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: presets plus 24 h preview bar; fine.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **aarav.ontrack@demo.fitbud.test** · route `overlay quiet_hours` · 18 Oct capture `fitbud-mobile-shots/ios/TR-17-quiet-hours.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-17.png`. Save extra states as `docs/spec/evidence/TR-17--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

