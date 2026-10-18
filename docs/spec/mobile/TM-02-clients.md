# TM-02 · Clients (search and list)

**ID:** TM-02 · **Name:** Clients (search and list) · **Priority:** P2 · **Route/screen:** — · **Batch:** M-7 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainer/ClientsTab.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** `GET /clients`

**Code status:** old code exists (the guide labelled it "Implemented"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 2342–2362. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TM-02 -->
### TM-02 · Clients (search and list)

> **Priority:** P2 · **Files:** `src/trainer/ClientsTab.tsx` · **API:** `GET /clients`

1. **Purpose.** Find a client quickly.
2. **Entry.** Tab.
3. **Legacy (do not keep).** A list.
4. **Gaps to close.** Search and filters need checking. Chips have no icons.
5. **Target design.**
   - A top segmented control: **Clients · Activity** (Activity is TM-09).
   - A search field, filter chips (Needs attention, Check-in due, Onboarding, Ended), and rows showing name, goalShort and two chips. Tapping opens TM-03.
6. **States.** Empty, error, offline.
7. **Edge cases.** Paging via `cursor`.
8. **Deep links.** None.
9. **References.** Everfit client list [R8].
10. **UX decisions.** Mirror web semantics.
11. **Implementation.** Use the unified `StatusChip`.
12. **Acceptance criteria.**
    - [ ] Search with debounce, 300 ms.
    - [ ] Chips have icons.
13. **Priority:** P2.
<!-- END VERBATIM TM-02 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- **LEGACY: 18 Oct QA capture of the current build at 7f74108 (iPhone 15 profile), do not copy** (Clients, rahul.coach@demo.fitbud.test): `mobile-qa/TM-02-clients.jpg`

  ![mobile-qa/TM-02-clients.jpg](../img/mobile-qa/TM-02-clients.jpg)

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TM-02.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TM-02.1** [guide §12] Search with debounce, 300 ms.
2. **TM-02.2** [guide §12] Chips have icons.
3. **TM-02.3** [18 Oct QA] Names are title-cased; no "Refresh" button (pull-to-refresh).
4. **TM-02.4** [product rule] Lists refresh by **pull-to-refresh** (the shared Screen wrapper). There's no manual "Refresh" button.
5. **TM-02.5** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
6. **TM-02.6** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: the list works, but names are lowercase from the seed ("deepak dubai") and goals read "Demo goal".
- Code at 7f74108: `apps/mobile/src/trainer/ClientsTab.tsx:135` has a manual "Refresh" button.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **rahul.coach@demo.fitbud.test** · route `tab clients` · 18 Oct capture `fitbud-mobile-shots/ios/TM-02-clients.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TM-02.png`. Save extra states as `docs/spec/evidence/TM-02--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

