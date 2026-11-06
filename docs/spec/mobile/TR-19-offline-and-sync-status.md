# TR-19 · Offline and sync status

**ID:** TR-19 · **Name:** Offline and sync status · **Priority:** P0 · **Route/screen:** `Sync` + global `SyncIndicator` · **Batch:** M-5 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/sync/engine.ts` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/sync/SyncProvider.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/components/SyncIndicator.tsx`

**API (from the guide):** `POST /sync/push`, `GET /sync/pull`

**Code status:** old code exists (the guide labelled it "Implemented (partial: no UI, memory store)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-19 -->
### TR-19 · Offline and sync status

> **Priority:** P0 · **Screen:** `Sync` + global `SyncIndicator` · **Files:** `src/sync/engine.ts`, `src/sync/SyncProvider.tsx` · **API:** `POST /sync/push`, `GET /sync/pull`

1. **Purpose.** Trainees never lose a log, and always know whether it reached the coach.
2. **Entry.** The top-bar sync glyph, More › Sync status, error snackbars.
3. **Legacy (do not keep).** An engine plus a memory-store provider. Screens bypass it.
4. **Gaps to close.** No persistence (SQLite). No UI. No conflict display.
5. **Target design.**
   - **SyncIndicator** in the top bar (hidden when everything is synced for more than 2 s).
   - **Sync status screen:**
     - "Last synced 2 min ago".
     - **Waiting to send (3):** a list, for example "Lunch · Eaten as planned · 1:52 pm".
     - **Couldn't send (1):** with the reason and **Retry**. Examples: "This meal was changed by your coach", "Photo too large", "Rahul closed this meal before your log was sent" (late log after resolution, D23).
     - *Sync now*.
     - A diagnostics disclosure (app version, device id hash) for support, with **Email support**, which opens the support `mailto` with the diagnostics included (D19).
   - Copy: "Your logs are saved on this phone and sent to Rahul when you're online."
6. **States.** Conflict: a server rejection (for example, the assignment was superseded) shows the item with "Your coach updated this. Your log was kept in history." (if the server keeps it). If not, the copy is "Couldn't save. The meal was replaced." and *Log against the new meal* is offered.
7. **Edge cases.**
   - Sign-out with unsent items: "3 logs haven't been sent. Sign out anyway?" Recommend syncing first.
   - Storage-full errors.
8. **Deep links.** `/settings/sync`.
9. **References.**
   - web.dev offline UX guidelines [R69] https://web.dev/articles/offline-ux-design-guidelines
   - Trainerize known sync issues [R25] (avoid).
10. **UX decisions.** A quiet indicator by default, with detail on demand, so being offline never looks like an error (P11).
11. **Implementation.**
    - `expo-sqlite` store for the cache and outbox.
    - The outbox drains with exponential backoff on app foreground and on connectivity change (`@react-native-community/netinfo`).
    - Background sync on Android with `expo-background-fetch` or `expo-task-manager` (best effort).
12. **Acceptance criteria.**
    - [ ] Logs survive an app kill and a reboot.
    - [ ] The indicator shows four states.
    - [ ] Conflicts are explained.
    - [ ] Sign-out warns about unsent items.
13. **Priority:** P0.
<!-- END VERBATIM TR-19 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-19.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-19.1** [guide §12] Logs survive an app kill and a reboot.
2. **TR-19.2** [guide §12] The indicator shows four states.
3. **TR-19.3** [guide §12] Conflicts are explained.
4. **TR-19.4** [guide §12] Sign-out warns about unsent items.
5. **TR-19.5** [18 Oct QA] Queued and failed items read as human sentences ("Lunch · Eaten as planned · 1:52 pm"), never op names (`workout.start`) or UUID fragments.
6. **TR-19.6** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
7. **TR-19.7** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: shows the raw op "workout.start", a truncated UUID "270d4194…" and a FAILED item ("already has a finished execution") created by the TR-11 capture.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **aarav.ontrack@demo.fitbud.test** · route `overlay sync` · 18 Oct capture `fitbud-mobile-shots/ios/TR-19-offline-sync.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-19.png`. Save extra states as `docs/spec/evidence/TR-19--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

