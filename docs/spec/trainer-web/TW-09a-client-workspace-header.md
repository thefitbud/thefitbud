# TW-09a · Client workspace header (shared by all workspace tabs)

**ID:** TW-09a · **Name:** Client workspace header (shared by all workspace tabs) · **Priority:** P0 · **Route/screen:** — · **Batch:** TW-C (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/ClientWorkspaceLayout.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/styles/workspace.css` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/components/workspace/WorkspaceHeader.tsx`

**API (from the guide):** `GET /workspaces/relationships/:relationshipId` (header: display name, onboardingStatus, goalShort, adherenceState, traineeProfile age/gender, effective plan, renewal state)

**Code status:** old code exists (the guide labelled it "Implemented (needs rework)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-09a -->
### TW-09a · Client workspace header (shared by all workspace tabs)

> **Priority:** P0 · **Files:** `pages/ClientWorkspaceLayout.tsx`, `styles/workspace.css` · **API:** `GET /workspaces/relationships/:relationshipId` (header: display name, onboardingStatus, goalShort, adherenceState, traineeProfile age/gender, effective plan, renewal state)

1. **Purpose.** Keeps the trainer oriented across tabs: who the client is, their state, and the one next action.
2. **Entry.** Any `/clients/:rid/*` route.
3. **Legacy (do not keep).** The header has the correct contracted fields, but the meta line is one long run-on string (`sbs/overview.png`). Tabs: Overview, Plan, Activity, Progress, Check-ins, History (Onboarding and Configure open from the More menu). An unknown id still shows "Client 00000000" with Message enabled (`shots/d1440_98_client_not_found.png`).
4. **Gaps to close.** The hierarchy is weak. Message is enabled on errors. There's no asked-coach or reminder signal. Mobile layout is missing.
5. **Target design.**
   - **Row 1:** avatar initials · **name** (H1) · lifecycle chip · adherence chip.
   - **Row 2:** meta in body-sm, separated by ·: goalShort · plan title (linked to Plan) · "Next check-in Fri 16 Oct" · "34 · Female" (only when present) · renewal chip (only when not current).
   - **Row 3, time and schedule signals (D22, D24):**
     - `TimezoneBadge`, for example "🕐 Priya's time 6:10 am · 5 h 30 m behind you". It's hidden when the offsets are equal, and refreshes every minute.
     - A **"Custom meal times"** chip when the trainee has changed any meal time (D24). It links to the Plan tab's week strip, which shows plan time against client time.
   - **Right:** one **primary** CTA chosen by state:

     | State | Primary CTA |
     |---|---|
     | Onboarding submitted | Review intake |
     | Coaching ready | Set up coaching |
     | Active, open check-in submission | Review check-in |
     | Active, open Critical exception | Review issue |
     | Otherwise | Adjust plan |
     | Ended (this trainer) | **Reactivate coaching** (TW-30, D21) |

   - **Secondary:** a **WhatsApp** button (disabled with the tooltip "No WhatsApp number on file" when the number is missing).
   - **Overflow ⋯:** Configure coaching, Onboarding answers, Reminder settings for this client, **Add note** (TW-34), End coaching (TW-30).
   - **Tabs:** Overview · Plan · Activity · Progress · Check-ins · History. A count badge shows only on Check-ins (submitted awaiting review).
   - Never show an exception count in the header (contract).
6. **States.**
   - Header skeleton.
   - 404: replace the whole workspace with "Client not found" and a "Back to clients" button. No fake header, no Message button.
   - Ended: a neutral banner under the header ("Coaching ended 3 Oct. Read-only."), with all mutating CTAs hidden except **Reactivate coaching**.
7. **Interactions.** The header stays sticky on scroll and collapses to one line (name and chips) after 120 px of scroll.
8. **Deep links.** `/go/client/:rid` opens Overview.
9. **References.** Adapt the persistent client header from the TrueCoach client profile [R1]. Avoid the Stitch header's biometrics (`sbs/client_detail_stitch.png`).
10. **UX decisions.** The state-driven single CTA follows UX §14. WhatsApp stays secondary and is never the primary action (UX §15).
11. **Implementation.**
    - New `components/workspace/WorkspaceHeader.tsx`.
    - Derive the CTA in a pure function `primaryActionFor(header)` in `packages/core` so trainer mobile can reuse it.
    - Stop the retry on 404 (gap analysis: 4 failed requests).
    - API-CHG: the workspace header adds `traineeTimezone` (IANA name) and `hasCustomMealTimes` (boolean). The trainer's timezone comes from `GET /me`.
12. **Acceptance criteria.**
    - [ ] Meta items are separate spans, and missing values are omitted rather than shown as "No …".
    - [ ] A 404 shows no header.
    - [ ] Ended hides the CTA.
    - [ ] Exactly one primary CTA.
    - [ ] The time difference shows when the timezones differ, and is hidden when they're the same.
    - [ ] The "Custom meal times" chip appears within one refresh of the trainee changing a time.
13. **Priority:** P0.
<!-- END VERBATIM TW-09a -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-09a.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-09a.1** [guide §12] Meta items are separate spans, and missing values are omitted rather than shown as "No …".
2. **TW-09a.2** [guide §12] A 404 shows no header.
3. **TW-09a.3** [guide §12] Ended hides the CTA.
4. **TW-09a.4** [guide §12] Exactly one primary CTA.
5. **TW-09a.5** [guide §12] The time difference shows when the timezones differ, and is hidden when they're the same.
6. **TW-09a.6** [guide §12] The "Custom meal times" chip appears within one refresh of the trainee changing a time.
7. **TW-09a.7** [QA checklist #1] Row 1: avatar, **name** (H1), lifecycle chip, adherence chip. Row 2: meta as separate items joined by "·" (goal · plan title link · "Next check-in …" · age·gender when present · renewal chip). Missing values are omitted, not shown as "No …".
8. **TW-09a.8** [QA checklist #2] Deepak: a `TimezoneBadge` ("Deepak's time … · 1 h 30 m behind you"). It's hidden for same-timezone clients (Rohan).
9. **TW-09a.9** [QA checklist #3] Exactly **one primary CTA** by state: Rohan (open critical) → "Review issue"; Sneha → "Review intake"; Kavya (ended) → **Reactivate coaching**.
10. **TW-09a.10** [QA checklist #4] A secondary **WhatsApp** button (neutral style, never the primary). Overflow ⋯: Configure coaching, Onboarding answers, Reminder settings for this client, **Add note**, End coaching.
11. **TW-09a.11** [QA checklist #5] Tabs: Overview · Plan · Activity · Progress · Check-ins · History. Only Check-ins has a count badge. **No exception count in the header.**
12. **TW-09a.12** [QA checklist #6] Ended (Kavya): a neutral banner "Coaching ended … Read-only." and every mutating CTA hidden except Reactivate.
13. **TW-09a.13** [QA checklist #7] Unknown id: the whole workspace is replaced by "Client not found" plus **Back to clients**. No fake header and no Message/WhatsApp button.
14. **TW-09a.14** [18 Oct QA] The header WhatsApp button's href is `https://wa.me/<CLIENT number>?text=…`, never the trainer's own number.
15. **TW-09a.15** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
16. **TW-09a.16** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- USAGE.md: `components/workspace/WorkspaceHeader.tsx:76–77` builds the client WhatsApp link from `header.trainerWhatsappE164`, which is the **trainer's** number. The workspace header contract has no client number (`apps/api/src/domain/workspace.ts:678`): API-CHG in Batch 0.
- Guide legacy: `impl_d1440_98_client_not_found` shows a fake header on an unknown id.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** `R/overview` (Rohan), `/clients/f2a64fdb-96ad-46f3-a95e-99151b4a25f1/overview` (Deepak, Dubai), `/clients/b9f01670-8acc-45f6-adab-d7728bca88a6/overview` (Kavya, ended), `/clients/00000000-0000-4000-8000-000000000000` (404)
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-09a.png`. This screen has mobile-web rules, so also save **390×844** as `docs/spec/evidence/TW-09a-390.png`. Save extra states as `docs/spec/evidence/TW-09a--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

