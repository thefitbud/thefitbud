# TW-20 · Check-in review

**ID:** TW-20 · **Name:** Check-in review · **Priority:** P0 (action bar, formatting), P1 (visible note) · **Route/screen:** `/clients/:rid/check-ins/:checkinId` · **Batch:** TW-E (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/CheckinReviewPage.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** get check-in, review context, `POST …/review` (acknowledged, needs follow-up, adjust coaching), notes, schedule-next

**Code status:** old code exists (the guide labelled it "Implemented (needs rework)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-20 -->
### TW-20 · Check-in review

> **Priority:** P0 · **Route:** `/clients/:rid/check-ins/:checkinId` · **Files:** `pages/CheckinReviewPage.tsx` · **API:** get check-in, review context, `POST …/review` (acknowledged, needs follow-up, adjust coaching), notes, schedule-next

1. **Purpose.** Review a submitted check-in, record an outcome, and close the loop with the client.
2. **Entry.** Check-ins inbox, Home, header CTA, and trainer push "Priya submitted her check-in".
3. **Legacy (do not keep).** `shots/d1440_11_client1_checkin_review.png`. Submission, measurements, an adherence count grid (10 equal tiles, mostly 0), active exceptions with raw ISO "Detected …Z", plan and notes. The actions (Record Outcome, Schedule Next, Record Note) are at the bottom, below the fold.

4. **Gaps to close.** The primary actions are below the fold. Zero tiles add noise. Raw timestamps. The trainee never sees that the trainer reviewed anything.
5. **Target design.** Two columns at ≥1280.
   - **Left (answers):**
     - Header "Weekly check-in · submitted Thu 15 Oct, 8:10 pm".
     - Answers grouped by section.
     - Measurements, each with its change since the last check-in ("74.2 kg · −0.6 since 8 Oct").
     - Photos, with *Compare with last*.
   - **Right (context):**
     - **Since last check-in**, showing only the non-zero counts: "3 of 4 workouts · 2 workouts modified · 6 meals changed · 1 meal skipped".
     - Open exceptions, one line each, with *Review* opening TW-05.
     - Asked-coach items this period.
     - Reminder responsiveness line.
   - **Sticky bottom action bar:**
     - **Outcome** as a segmented control: Acknowledged · Needs follow-up · Adjust coaching.
     - A **note** text area (optional) with the **"Visible to client"** switch (TW-34, D20). It's off by default. When it's on, the note shows on the trainee's check-in (TR-14) and Today "From your coach" card. When it's off, the note stays private.
     - **Primary:** **Save review**.
     - Secondary: *Schedule next*, prefilled from the cadence.
     - Overflow: *WhatsApp client* (prefilled "Reviewed your check-in…" with the deep link), *Adjust plan*.
6. **States.**
   - Not submitted (due or overdue): answers empty, "Due by Fri 16 Oct, 11:59 pm", plus *Nudge*.
   - Already reviewed: the bar shows "Reviewed · Acknowledged · 16 Oct" with *Edit review* (only if the API allows it; otherwise read-only).
   - Draft only: "Priya has started but not submitted."
7. **Edge cases.**
   - Pinned form version: answers render against the pinned version, never against the latest one.
   - The "Adjust coaching" outcome routes to TW-12 or TW-11 after saving.
8. **Notifications and deep links.** Saving a review sends trainee push **P-CHK-REV** ("Rahul reviewed your check-in"), linking to `/checkin/:id`. That's the "visible trainer review" signal (D13).
9. **References.**
   - Adopt: Everfit check-in dashboard and client insights [R6] [R7] https://help.everfit.io/en/articles/16000596-check-in-dashboard-review-client-insights
   - Avoid: Figma's "Feedback draft (WhatsApp & FitBud App Sync)" label, which implies a messaging sync.
10. **UX decisions.** A sticky outcome bar puts the review action within reach. The client-visible note gives FitBud's equivalent of a reply without becoming chat.
11. **Implementation.**
    - `ReviewActionBar` component. Hide zero counts. Format all dates.
    - The review note is a `trainer_notes` row linked to the check-in (`subjectType: 'checkin'`) with `visibility` (API-CHG, see TW-34).
    - **Push rule:** a visible note saved with a review is delivered *inside* **P-CHK-REV** ("Rahul reviewed your check-in and left a note"). No separate P-NOTE is sent.
    - *Schedule next* uses the client's timezone with `TimezoneBadge` (D22).
12. **Acceptance criteria.**
    - [ ] The outcome and Save are visible without scrolling at 1440×900.
    - [ ] Zero counts are hidden.
    - [ ] Saving sends the trainee review push, when the client's preferences allow it.
    - [ ] A note marked "Visible to client" appears for the trainee. An unmarked note never does.
    - [ ] Answers use the pinned version.
13. **Priority:** P0 (action bar, formatting), P1 (visible note).
<!-- END VERBATIM TW-20 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-20.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-20.1** [guide §12] The outcome and Save are visible without scrolling at 1440×900.
2. **TW-20.2** [guide §12] Zero counts are hidden.
3. **TW-20.3** [guide §12] Saving sends the trainee review push, when the client's preferences allow it.
4. **TW-20.4** [guide §12] A note marked "Visible to client" appears for the trainee. An unmarked note never does.
5. **TW-20.5** [guide §12] Answers use the pinned version.
6. **TW-20.6** [QA checklist #1] Two columns at ≥1280. Left: "Weekly check-in · submitted Thu 15 Oct, 8:10 pm", answers by section, measurements with change ("74.2 kg · −0.6 since 8 Oct"), photos with *Compare with last*.
7. **TW-20.7** [QA checklist #2] Right: "Since last check-in" with **only non-zero counts** (no grid of 0 tiles), open items with *Review*, asked-coach items, reminder line.
8. **TW-20.8** [QA checklist #3] A **sticky bottom bar visible without scrolling at 1440×900**: Outcome segmented control (Acknowledged · Needs follow-up · Adjust coaching), a note with a **Visible to client** switch (off by default), primary **Save review**, secondary *Schedule next*.
9. **TW-20.9** [QA checklist #4] Overflow: *WhatsApp client* (wa.me prefill "Reviewed your check-in…", not auto-sent), *Adjust plan*.
10. **TW-20.10** [QA checklist #5] Already reviewed: "Reviewed · Acknowledged · <date>".
11. **TW-20.11** [QA checklist #6] A "Next ›" control when opened from the inbox's To review list. No raw "Detected …Z" timestamps.
12. **TW-20.12** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
13. **TW-20.13** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- RCA.md §4: `pages/CheckinReviewPage.tsx` changed by **+1/−1** only. The guide asks for a full redesign (two columns, sticky review bar), so this is the legacy page (`img/impl_d1440_11_client1_checkin_review.jpg`).
- Guide legacy: raw "Detected …Z" timestamps and a grid of zero tiles.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** `R/check-ins/744e2975-255c-4469-9f9a-6da0a853c8f2` (Rohan); `/clients/f2a64fdb-96ad-46f3-a95e-99151b4a25f1/check-ins/85cce5da-c7be-4131-85c1-1a9ee6a34bd9` (Deepak)
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-20.png`. Save extra states as `docs/spec/evidence/TW-20--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

