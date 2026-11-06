# TW-05 · Exception detail: acknowledge and resolve drawer

**ID:** TW-05 · **Name:** Exception detail: acknowledge and resolve drawer · **Priority:** P0 · **Route/screen:** `/?exception=:id` (drawer) and `/exceptions/:exceptionId` (full-page fallback) · **Batch:** TW-A (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/ExceptionDetailPage.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/components/ExceptionDrawer.tsx` (exists)

**API (from the guide):** `GET /exceptions/:id`, `POST /exceptions/:id/acknowledge`, `POST /exceptions/:id/resolve`, `GET/POST /exceptions/:id/interventions`, plus nudge `{activityType, activityId}`

**Code status:** old code exists (the guide labelled it "Implemented (partial)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-05 -->
### TW-05 · Exception detail: acknowledge and resolve drawer

> **Priority:** P0 · **Route:** `/?exception=:id` (drawer) and `/exceptions/:exceptionId` (full-page fallback) · **Files:** `pages/ExceptionDetailPage.tsx` (Acknowledge plus `resolveException`, around L101) · **API:** `GET /exceptions/:id`, `POST /exceptions/:id/acknowledge`, `POST /exceptions/:id/resolve`, `GET/POST /exceptions/:id/interventions`, plus nudge `{activityType, activityId}`

1. **Purpose.** Understand one problem, then acknowledge it (I've seen it) or resolve it (it's handled), with an optional note, plan adjustment or nudge.
2. **Entry.** Home rows, the Overview's open exception, the Activity feed, the bell, and push.
3. **Legacy (do not keep).** `shots/d1440_07_exception_detail.png` and `m390_07_exception_detail.png`.
   - The page shows Acknowledge and "Publish plan adjustment".
   - It shows a raw source UUID and "Rule mvp.v2".
   - Resolve exists in code but wasn't visible in the captured state.

4. **Gaps to close.**
   - Internal identifiers are exposed.
   - There's no source context, for example what the meal or workout was.
   - The difference between Acknowledge and Resolve isn't explained.
   - There's no nudge here.
   - It's a full page, so the trainer loses their place on Home.
5. **Target design.** A **right-hand drawer, 520 px wide.**
   - **Header:** client name, a severity chip and a close button.
   - **Body:**
     1. Reason sentence (H3): "Missed required workout · Upper body A · Mon 12 Oct".
     2. Source card: what was planned (a workout summary or the meal items), the window ("Due by 11:59 pm"), and what was logged (nothing, "Skipped" with a reason, or "Changed" with the deviation text and photo thumbnail).
     3. Signals: an `AskedCoachMarker` if the client asked on WhatsApp, and a reminder line ("Reminder sent 7:15 pm · not opened") from the responsiveness data (TW-31).
     4. Timeline: detected, acknowledged (by whom and when), notes.
   - **Sticky footer:**
     - **Primary**, which depends on state: *Mark reviewed* (acknowledge) when the item is active, or *Resolve* when it's acknowledged.
     - Secondary: *Nudge* (only if the activity is still actionable and not resolved).
     - Overflow ⋯: Add note, Adjust plan (opens TW-12 with context), WhatsApp client, Open client.
   - **Copy:**
     - Helper under the buttons: "*Mark reviewed* keeps this on the list as seen. *Resolve* closes it. The original log isn't changed."
     - Resolve opens an inline note field (optional), with outcome chips: "Talked to client", "Plan adjusted", "No action needed".
6. **States.**
   - Loading skeleton.
   - 404: "This item no longer exists". It may have been superseded by a plan change.
   - Already resolved: a read-only view showing "Resolved by you · 13 Oct" and no actions.
   - Ended relationship: read-only, with a banner.
   - Nudge rate-limited (`ACTIVITY_NUDGE_HOURLY_LIMIT = 3`): the button is disabled with "You can nudge again in 40 min".
   - The client has quiet hours on: "Nudge will arrive after 7:00 am (client's quiet hours)."
7. **Interactions.**
   - Esc closes the drawer.
   - Arrow up and down move to the previous or next Home item while the drawer stays open (a triage flow).
   - Actions are idempotent, with keys reused on retry.
   - Undo for Mark reviewed lasts 5 s (a client-side delay before the POST, or a compensating action if the API supports it. Today it doesn't, so use the delay).
8. **Notifications and deep links.** `/go/exception/:id` goes to `/?exception=:id`. The full-page route renders Home with the drawer open.
9. **References.**
   - Adapt: TrueCoach "Needs attention" actions [R1].
   - Adopt: the drawer pattern for detail without losing context (no specific external page, so this is FitBud's own decision).
   - Avoid: the merged "Acknowledge & Adjust" from the Stitch reference (`sbs/client_detail_stitch.png`).
10. **UX decisions.**
    - Two distinct verbs with helper copy enforce the contract (Acknowledge is not Resolve).
    - The drawer keeps triage speed: a trainer can clear 10 items without page loads.
    - Show reminder context so the trainer doesn't nudge someone who never got the reminder.
11. **Implementation.**
    - New `components/drawers/ExceptionDrawer.tsx`, reusing the data loading from `ExceptionDetailPage.tsx`.
    - `ExceptionDetailPage` renders `<HomePage drawer="exception">`.
    - Remove `sourceId` and `ruleVersion` from the UI.
    - API-CHG: the detail response should embed a source summary (planned item title, window, logged result). Without that, fetch the source by `domainEntityType` and id.
12. **Acceptance criteria.**
    - [ ] No UUID or rule version is visible.
    - [ ] Mark reviewed and Resolve are separate, and the helper copy is present.
    - [ ] Resolve accepts an optional note, saved as an intervention of kind `resolve` (and `note` when text is entered).
    - [ ] Nudge respects the rate limit and quiet hours, with explanatory copy.
    - [ ] The drawer works with the keyboard, and focus is trapped.
13. **Priority:** P0.
<!-- END VERBATIM TW-05 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-05.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-05.1** [guide §12] No UUID or rule version is visible.
2. **TW-05.2** [guide §12] Mark reviewed and Resolve are separate, and the helper copy is present.
3. **TW-05.3** [guide §12] Resolve accepts an optional note, saved as an intervention of kind `resolve` (and `note` when text is entered).
4. **TW-05.4** [guide §12] Nudge respects the rate limit and quiet hours, with explanatory copy.
5. **TW-05.5** [guide §12] The drawer works with the keyboard, and focus is trapped.
6. **TW-05.6** [QA checklist #1] Opens as a **right-hand drawer (~520 px)** over Home, not a full page. The header has the client name, a severity chip and a close (×) button.
7. **TW-05.7** [QA checklist #2] Reason sentence as H3 ("Missed required workout · … · Mon 21 Sep"), a source card (planned vs logged, "Due by …"), and a timeline (detected or acknowledged, by whom and when).
8. **TW-05.8** [QA checklist #3] Active item: primary **Mark reviewed**. Acknowledged item (Meera): primary **Resolve**. They're separate buttons and states, never a merged "Acknowledge & Adjust".
9. **TW-05.9** [QA checklist #4] Helper copy: "*Mark reviewed* keeps this on the list as seen. *Resolve* closes it. The original log isn't changed."
10. **TW-05.10** [QA checklist #5] Resolve opens an optional note plus outcome chips: "Talked to client", "Plan adjusted", "No action needed".
11. **TW-05.11** [QA checklist #6] Secondary **Nudge** (when actionable); rate limit text "You can nudge again in … min". Overflow: Add note, Adjust plan, WhatsApp client (wa.me), Open client.
12. **TW-05.12** [QA checklist #7] **No UUID and no "Rule mvp.v2"** visible. A resolved item is read-only ("Resolved by you · …") with no actions.
13. **TW-05.13** [QA checklist #8] Esc closes it, focus is trapped inside the drawer, and the `/exceptions/:id` fallback renders Home with the drawer open.
14. **TW-05.14** [18 Oct QA] `/?exception=f588b76a-62a3-42bb-bf85-0570ea52c9eb` (Meera) renders with **Resolve** as primary (no "Invalid datetime" error).
15. **TW-05.15** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
16. **TW-05.16** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- USAGE.md: `GET /exceptions/f588b76a-…` (Meera, acknowledged) fails with `LOCAL_DEV_ERROR "Invalid datetime" detectedAt` because the seed writes a date-only `detected_at` (`apps/api/src/seed/demo/history.ts:338`). The drawer for Meera can't render until Batch 0 fixes the seed and the mapper.
- Code fact: `apps/trainer-web/src/components/ExceptionDrawer.tsx` exists, and `pages/ExceptionDetailPage.tsx` is the old full page. Check both against this spec; don't assume either is done.
- Mobile QA (same data, TM-04): "Source meal_assignment · Rule mvp.v2" and "Breakfast (2026-09-21)" leak, so the web drawer must be checked for the same strings.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** `/?exception=95af751f-156c-44ac-a945-ec30870134ae` (Rohan, active); `/?exception=f588b76a-62a3-42bb-bf85-0570ea52c9eb` (Meera, acknowledged); `/?exception=fa80cb4f-f852-403e-9c91-318a9944f238` (resolved); fallback `/exceptions/95af751f-156c-44ac-a945-ec30870134ae` · **Account:** rahul.coach
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-05.png`. Save extra states as `docs/spec/evidence/TW-05--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

