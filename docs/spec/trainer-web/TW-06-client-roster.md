# TW-06 · Client roster

**ID:** TW-06 · **Name:** Client roster · **Priority:** P1 (P0 for the 390 px reflow) · **Route/screen:** `/clients?q=&status=&adherence=&goal=` · **Batch:** TW-B (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/ClientsPage.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/styles/clients.css` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** `GET /clients` (repeatable `status`, `adherenceState`, `goal`, plus `q`, `cursor`, `limit` 30/50)

**Code status:** old code exists (the guide labelled it "Implemented (needs polish)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-06 -->
### TW-06 · Client roster

> **Priority:** P1 · **Route:** `/clients?q=&status=&adherence=&goal=` · **Files:** `pages/ClientsPage.tsx` (`listClients`, "Client Roster"), `styles/clients.css` · **API:** `GET /clients` (repeatable `status`, `adherenceState`, `goal`, plus `q`, `cursor`, `limit` 30/50)

1. **Purpose.** Find a client and see each client's state at a glance.
2. **Entry.** Navigation, search, and the Home "View all" link.
3. **Legacy (do not keep).** `shots/d1440_03_clients.png`, `m390_03_clients.png` and `sbs/clients.png`.
   - 14 rows.
   - Facets are three rows of plain text.
   - "No short goal" and "No effective plan" are repeated in bold.

4. **Gaps to close.**
   - The filters take up a lot of height and have no visible selected state at rest.
   - Empty values are noisy.
   - Truncated plan names have no tooltip.
   - At 390 the table doesn't reflow.
   - Ended clients aren't separated out.
   - There's no renewal filter.
5. **Target design.**
   - **Header:** H1 "Clients" with the count ("14 active"), and a primary **Add client** button.
   - **FilterBar:** a search box, then pills for Status (Invited, Onboarding, Ready to coach, Active), Adherence (On track, Needs attention, No recent data, Not available), Goal and Renewal (Upcoming, Due, Expired). Each option shows a live count once the API supports it (API-NEW: facet counts). Selected pills are filled lavender, and a **Clear** link resets them.
   - A segmented control: **Current · Ended** (`status=ended`, see TW-30).
   - **Table columns:**
     - Client: initials avatar, name, and goalShort in the caption.
     - Status chip.
     - Adherence chip.
     - Next check-in, in relative form.
     - Plan, truncated with a `title` attribute.
     - Renewal chip, only when it isn't current.
     - Action: one contextual button. Pending invite: *Resend invite*. Onboarding submitted: *Review intake*. Coaching ready: *Set up plan*. Active: *Open*.
   - Empty values show a muted "—".
   - **<768:** stacked cards with name, chips, the next check-in and the action.
6. **States.**
   - Skeleton rows.
   - Empty with no clients: "No clients yet. Invite your first client to start coaching." with an **Add client** button.
   - Empty after filtering: "No clients match these filters" with **Clear filters**.
   - Error with Retry, replacing the current API-error panel (`shots/d1440_97_clients_api_error.png`).
   - Pagination: "Load more" (cursor) at the bottom.
7. **Interactions.**
   - Filters update the URL query, so the browser back button restores them.
   - The cursor resets when a filter changes (already contracted).
   - Row click opens the workspace. Invited rows can't open a workspace. They open the TW-08 invitation detail instead.
   - Keyboard: ↑/↓ moves through rows, Enter opens.
8. **Notifications.** None.
9. **References.**
   - Adopt: Everfit client-list filters and segments [R8] https://help.everfit.io/en/articles/3365958-client-list-filter-and-segment-clients
   - Avoid: Figma's adherence % bars, Flagged and Paused, and Bulk message and Export (§1.5).
10. **UX decisions.**
    - One contextual action per row follows UX §11.
    - "Ended" is a separate view rather than a status mixed into active work.
11. **Implementation.**
    - Rewrite `ClientsPage.tsx` around `GET /clients` only. Per the Current State guide, the screen still reads invitations and relationships separately in one place, so reconcile that.
    - Move to a shared `FilterBar` and `ClientRow`.
    - API-NEW: the `renewal` filter and facet counts.
12. **Acceptance criteria.**
    - [ ] The filters fit on one row at 1280.
    - [ ] Filter state lives in the URL.
    - [ ] Empty values show "—".
    - [ ] Every row has exactly one action.
    - [ ] Cards stack at 390.
    - [ ] Ended clients appear only in the Ended view.
13. **Priority:** P1 (P0 for the 390 px reflow).
<!-- END VERBATIM TW-06 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-06.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-06.1** [guide §12] The filters fit on one row at 1280.
2. **TW-06.2** [guide §12] Filter state lives in the URL.
3. **TW-06.3** [guide §12] Empty values show "—".
4. **TW-06.4** [guide §12] Every row has exactly one action.
5. **TW-06.5** [guide §12] Cards stack at 390.
6. **TW-06.6** [guide §12] Ended clients appear only in the Ended view.
7. **TW-06.7** [QA checklist #1] H1 "Clients" with a count ("N active") and a primary **Add client** button.
8. **TW-06.8** [QA checklist #2] One-row FilterBar: search plus pills for Status / Adherence / Goal / Renewal. Selected pills are filled lavender, and there's a **Clear** link. Filters are reflected in the URL (Back restores them).
9. **TW-06.9** [QA checklist #3] Segmented control **Current · Ended**. Kavya and Nikhil appear only under Ended.
10. **TW-06.10** [QA checklist #4] Columns: client (avatar, name, goal caption), status chip, adherence chip, next check-in (relative), plan (truncated with a tooltip), renewal chip (only when not current), **exactly one** action.
11. **TW-06.11** [QA checklist #5] Row actions by state: Anita (invited) → *Resend invite* (opens the invitation page, not a workspace); Sneha → *Review intake*; active → *Open*.
12. **TW-06.12** [QA checklist #6] Empty values show a muted "—" (not "No short goal" or "No effective plan"). No % adherence bars, no "Paused", "Flagged", Bulk message or Export.
13. **TW-06.13** [QA checklist #7] Filtering to nothing shows "No clients match these filters" plus **Clear filters**. At 390 px the rows become stacked cards.
14. **TW-06.14** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
15. **TW-06.15** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- RCA.md §4: `ClientsPage.tsx` changed by +1/−1 only, so this is still the legacy roster (`img/impl_d1440_03_clients.jpg`, `img/sbs_clients.jpg`).
- Mobile QA (TM-02): seed display names are lowercase ("deepak dubai") and goals read "Demo goal". Names must be title-cased on render (see 01-product-rules.md).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** `/clients`, `/clients?q=rohan`, `/clients?status=ended` · **Account:** rahul.coach
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-06.png`. This screen has mobile-web rules, so also save **390×844** as `docs/spec/evidence/TW-06-390.png`. Save extra states as `docs/spec/evidence/TW-06--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

