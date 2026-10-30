# TR-15 · Notifications inbox

**ID:** TR-15 · **Name:** Notifications inbox · **Priority:** P1 · **Route/screen:** `Notifications` · **Batch:** M-4 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainee/NotificationsScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** notifications list, mark read

**Code status:** the guide says "Missing (list API exists)" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.5) · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-15 -->
### TR-15 · Notifications inbox

> **Priority:** P1 · **Screen:** `Notifications` · **Files:** `src/trainee/NotificationsScreen.tsx` [new] · **API:** notifications list, mark read

1. **Purpose.** One place for reminders, coach updates and plan changes, including the ones that weren't pushed (informational items go to the inbox only).
2. **Entry.** The Today bell, push long-press, the P-EOD "See all".
3. **Legacy (do not keep).** None.
4. **Gaps to close.** Not built.
5. **Target design.**
   - Sections **Today** and **Earlier**.
   - `NotificationRow`: type icon · title ("Lunch isn't logged yet") · relative time · unread dot. Tapping deep-links (§3.5), and expired items open the current state of the item ("Already logged ✓").
   - **Coach notes** (P-NOTE, D20) appear as "Rahul has a note for you" rows. Tapping opens Today at the note (`/today?note=:id`) and marks it seen. If Rahul made the note private again, the row says "This note is no longer shared."
   - **Reactivation requests** (P-REACT) open TR-22's confirmation card.
   - Header: "Mark all read".
   - Footer link: "Notification settings" (TR-16).
6. **States.** Empty: "No notifications yet." Offline: cached.
7. **Edge cases.**
   - Items for superseded assignments show "This meal was replaced by a plan update."
   - Retention: show 30 days.
8. **Deep links.** `/notifications`.
9. **References.** Apple HIG notifications [R58].
10. **UX decisions.** The inbox lets push caps hold without losing information.
11. **Implementation.** Read the list endpoint, then mark read on view. The badge count goes on the bell.
12. **Acceptance criteria.**
    - [ ] Lists the last 30 days.
    - [ ] Tapping routes exactly.
    - [ ] Mark read syncs.
13. **Priority:** P1.
<!-- END VERBATIM TR-15 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-15.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-15.1** [guide §12] Lists the last 30 days.
2. **TR-15.2** [guide §12] Tapping routes exactly.
3. **TR-15.3** [guide §12] Mark read syncs.
4. **TR-15.4** [18 Oct QA] Pull-to-refresh; no "Refresh" button.
5. **TR-15.5** [product rule] Lists refresh by **pull-to-refresh** (the shared Screen wrapper). There's no manual "Refresh" button.
6. **TR-15.6** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
7. **TR-15.7** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: empty inbox "No notifications yet."; fine but thin. Console: 403 errors.
- Code at 7f74108: `NotificationsScreen.tsx:148` has a manual "Refresh" button.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **aarav.ontrack@demo.fitbud.test** · route `overlay notifications` · 18 Oct capture `fitbud-mobile-shots/ios/TR-15-notifications-inbox.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-15.png`. Save extra states as `docs/spec/evidence/TR-15--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

