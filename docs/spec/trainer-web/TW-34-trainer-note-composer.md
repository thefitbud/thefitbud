# TW-34 · Trainer note composer (private or visible to client)

**ID:** TW-34 · **Name:** Trainer note composer (private or visible to client) · **Priority:** P1 · **Route/screen:** Overview "Coach notes", header ⋯ *Add note*, exception drawer (TW-05), check-in review (TW-20), asked-coach drawer (TW-32), Activity side panel (TW-17); trainer mobile TM-03, TM-04, TM-06 · **Batch:** TW-C (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/components/NoteComposer.tsx` (exists)

**API (from the guide):** notes (exists); API-CHG `visibility`, `subjectType`, `subjectId`

**Code status:** the guide says "New-proposed" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 2258–2300. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-34 -->
### TW-34 · Trainer note composer (private or visible to client)

> **Priority:** P1 · **Where:** Overview "Coach notes", header ⋯ *Add note*, exception drawer (TW-05), check-in review (TW-20), asked-coach drawer (TW-32), Activity side panel (TW-17); trainer mobile TM-03, TM-04, TM-06 · **API:** notes (exists); API-CHG `visibility`, `subjectType`, `subjectId` · **Decision:** D20

1. **Purpose.** Let the trainer write private notes and, when they choose, a short note the client sees. The coach gets a presence in the app without chat.
2. **Entry.** The places listed above.
3. **Legacy (do not keep).** Notes exist and are private (contract). There's no visibility flag.
4. **Gaps to close.** The client never hears from the coach inside the app.
5. **Target design.**
   - **Composer:**
     - A text area (max 1,000 characters) with a counter after 800.
     - A **Visible to client** switch, off by default.
     - When the switch is on, the helper reads "Priya will see this on her Today screen and get a notification", and a preview chip shows how it appears ("From Rahul · just now").
     - **Save note** (primary).
   - **Note list:** each note shows its text, the time and a badge: "Private" (neutral) or "Visible to client" (info, eye icon). Visible notes also show "Seen by Priya · 9:12 am" once the trainee has opened them (P1; needs the read state).
   - **Actions on a visible note:**
     - *Edit*. The trainee sees "edited", and no new push is sent.
     - *Make private*. This removes it from the trainee's view immediately and sends no notification.
     - *Delete*, after a confirm.
   - A visible note can't be made private then visible again to re-push. Re-sharing within 24 h sends no second push.
6. **States.** Saving · Saved toast ("Shared with Priya" or "Saved privately") · error with the text kept · ended relationship (read-only, composer hidden).
7. **Edge cases.**
   - A visible note saved with a check-in review is delivered inside P-CHK-REV, with no separate P-NOTE.
   - Several visible notes in 15 min merge into one push ("Rahul left 2 notes for you").
   - Quiet hours defer the push. The note is visible in the app immediately.
   - Notes never contain medical advice. The helper text for the pain topic repeats the caution from TW-32.
8. **Notifications and deep links.** Push **P-NOTE** "Rahul has a note for you!" (no note text on the lock screen; the body is "Tap to read"). It links to `/today?note=:id` (§4.1).
9. **References.** No strong external reference for the visible or private split. The pattern follows FitBud's no-chat rule (UX §15).
10. **UX decisions.**
    - The default is private, so nothing leaks by accident.
    - The note text stays off the lock screen for privacy.
    - Visible notes are one-way: replies happen on WhatsApp.
11. **Implementation.**
    - API-CHG `trainer_notes`: add `visibility: 'private' | 'client'` (default `private`), `subjectType: 'relationship' | 'checkin' | 'exception' | 'meal' | 'workout' | 'coach_ask'`, `subjectId`, `sharedAt` and `seenAt`.
    - API-NEW (trainee) `GET /me/coach-notes?since=` and `POST /me/coach-notes/:id/seen`.
    - Notification type `trainer_note_shared`.
    - History kinds `note_shared` and `note_unshared`.
12. **Acceptance criteria.**
    - [ ] The default is private.
    - [ ] A visible note appears on the trainee's Today within one sync, and the push arrives once.
    - [ ] Make private removes it from the trainee's view.
    - [ ] Private notes never appear in any trainee API response.
13. **Priority:** P1.
<!-- END VERBATIM TW-34 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- The guide has no image for this screen. Build from the text above and `00-foundations.md`.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-34.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-34.1** [guide §12] The default is private.
2. **TW-34.2** [guide §12] A visible note appears on the trainee's Today within one sync, and the push arrives once.
3. **TW-34.3** [guide §12] Make private removes it from the trainee's view.
4. **TW-34.4** [guide §12] Private notes never appear in any trainee API response.
5. **TW-34.5** [QA checklist #1] A text area (max 1,000 characters; the counter appears after 800).
6. **TW-34.6** [QA checklist #2] A **Visible to client** switch, **off by default**.
7. **TW-34.7** [QA checklist #3] Switch on: the helper "<name> will see this on her Today screen and get a notification" plus a preview chip "From rahul · just now".
8. **TW-34.8** [QA checklist #4] **Save note**. Toast "Saved privately" or "Shared with <name>".
9. **TW-34.9** [QA checklist #5] Note list: text, time, badge **Private** (neutral) or **Visible to client** (info, eye icon). Actions on a visible note: Edit, Make private, Delete (with a confirm).
10. **TW-34.10** [QA checklist #6] Ended client (Kavya): the composer is hidden.
11. **TW-34.11** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
12. **TW-34.12** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- No screen-specific failure recorded. Code fact: `components/NoteComposer.tsx` exists; verify it against the spec.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `R/overview` → Coach notes → **Add note** (or header ⋯ → Add note)
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-34.png`. Save extra states as `docs/spec/evidence/TW-34--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

