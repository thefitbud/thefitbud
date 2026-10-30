# TR-18 · Ask coach on WhatsApp

**ID:** TR-18 · **Name:** Ask coach on WhatsApp · **Priority:** P1 · **Route/screen:** a bottom sheet from the meal card, workout or exercise overflow, a check-in, a plan view, a notification · **Batch:** M-4 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainee/ask/AskCoachSheet.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `packages/core/src/whatsapp.ts` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** API-NEW `POST /coach-asks {relationshipId, itemType, itemId, topic}` (outbox-capable), the trainer WhatsApp number on the relationship read (API-NEW)

**Code status:** the guide says "New-proposed" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-18 -->
### TR-18 · Ask coach on WhatsApp

> **Priority:** P1 · **Where:** a bottom sheet from the meal card, workout or exercise overflow, a check-in, a plan view, a notification · **Files:** `src/trainee/ask/AskCoachSheet.tsx` [new], `packages/core/src/whatsapp.ts` (extend) · **API:** API-NEW `POST /coach-asks {relationshipId, itemType, itemId, topic}` (outbox-capable), the trainer WhatsApp number on the relationship read (API-NEW)

1. **Purpose.** Ask the coach about *this specific item* in WhatsApp, with the context and a link back already filled in (D1, D2, D3).
2. **Entry.** "Ask Rahul" in item overflows and in TR-08, TR-09, TR-11 and TR-14.
3. **Legacy (do not keep).** None on the trainee side. The trainer side has `trainer/whatsapp.ts` ("WhatsApp (outside FitBud)") and the web `lib/whatsapp.ts`.
4. **Gaps to close.** The trainee has no way to ask about a specific item.
5. **Target design.**
   - A sheet titled "Ask Rahul about **Lunch · Tue 13 Oct**".
   - **Topic chips:** Swap a food · Portion size · Form check · Pain or discomfort · Can't do this today · Other.
   - A preview of the message that will be prefilled (editable in WhatsApp), for example: "Hi Rahul, question about my Lunch (Tue 13 Oct): portion size. https://fitbud.app/go/meal/7f3a…"
   - Primary: **Open WhatsApp**.
   - Caption: "Your message is sent from your WhatsApp. FitBud only notes that you asked."
   - After returning to the app, the item shows the `AskedCoachMarker` "Asked Rahul · just now". When the trainer marks it answered: "Rahul answered ✓".
6. **States.**
   - No trainer number: "Rahul hasn't added a WhatsApp number yet." (the button is disabled), plus the fallback "Leave a note in your next check-in."
   - WhatsApp not installed: open the wa.me URL in the browser (the WhatsApp web or install page).
   - Offline: the ask is recorded in the outbox. WhatsApp itself needs the network, so show "You're offline. WhatsApp will send when you're back online."
7. **Edge cases.**
   - **Message length:** keep the prefilled text short. Bird notes Meta's guidance of about 140 characters for prefilled text [R43]. Template: `Hi {coach}, question about my {item} ({date}): {topic}. {link}`. Truncate the item name to fit.
   - URL-encode the text with `encodeURIComponent`.
   - The link must be the **https** `/go/` link. WhatsApp only makes http(s) links clickable, so a `fitbud://` link would show as plain text.
   - Pain topic: show "If it's sharp pain or you feel unwell, stop and get medical help." before opening WhatsApp. This is a safety note, not a diagnosis.
   - Recording the ask happens *before* opening WhatsApp. FitBud can't know whether the user actually sent the message, so the marker says "Asked", not "Sent". OQ-21: should the marker be confirmed by the user on return ("Did you send it?")? The default here is no; keep it simple.
8. **Notifications and deep links.**
   - The trainer gets **T-ASK** (push and bell, merged at most once per 15 min).
   - The `/go/meal/:id` link opens the item for the trainee (their own) or the trainer (the client item).
9. **References.**
   - WhatsApp Click to Chat [R41] https://faq.whatsapp.com/5913398998672934/?locale=en_US
   - Linking from another app [R42] https://faq.whatsapp.com/425247423114725/?cms_platform=iphone
   - Bird's click-to-chat explainer [R43] https://bird.com/explained/whatsapp/what-is-a-whatsapp-click-to-chat-link
   - Avoid: Figma's "Ask Coach" in-app chat (`trainee_07`).
10. **UX decisions.**
    - It uses the channel trainers and trainees already live in, and keeps FitBud out of the chat business.
    - Context plus a link saves the coach the "which meal?" back-and-forth.
    - The marker gives accountability without storing content (decision F: sensitive data minimisation).
11. **Implementation.**
    - Extend `packages/core/src/whatsapp.ts` with `buildAskCoachMessage({coachName, itemLabel, date, topic, link})`, which enforces the length.
    - `Linking.openURL(waHref)`.
    - Outbox mutation `coach_ask_create`.
    - **Data model (`coach_asks`):** id, relationship_id, trainee_user_id, item_type (`meal_assignment`, `workout_assignment`, `exercise_execution`, `checkin`, `plan_version`), item_id, topic, asked_at, status (`open`, `answered`, `expired`), answered_at, answered_by, trainer_note_id nullable. No message text.
12. **Acceptance criteria.**
    - [ ] Opening the sheet from a meal prefills the item and date.
    - [ ] The WhatsApp chat opens with the text and the https link.
    - [ ] The marker appears.
    - [ ] The trainer sees the ask.
    - [ ] Prefilled text is ≤ 140 chars excluding the URL. If the full message must be ≤ 140, the URL uses the short `/go/` form (OQ-2).
13. **Priority:** P1.
<!-- END VERBATIM TR-18 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-18.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-18.1** [guide §12] Opening the sheet from a meal prefills the item and date.
2. **TR-18.2** [guide §12] The WhatsApp chat opens with the text and the https link.
3. **TR-18.3** [guide §12] The marker appears.
4. **TR-18.4** [guide §12] The trainer sees the ask.
5. **TR-18.5** [guide §12] Prefilled text is ≤ 140 chars excluding the URL. If the full message must be ≤ 140, the URL uses the short `/go/` form (OQ-2).
6. **TR-18.6** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
7. **TR-18.7** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: the Ask on WhatsApp sheet renders; fine. Verify the prefill goes to the coach's number and the link is https `/go/`.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **aarav.ontrack@demo.fitbud.test** · route `overlay ask_coach (meal_assignment, Lunch)` · 18 Oct capture `fitbud-mobile-shots/ios/TR-18-ask-coach-whatsapp.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-18.png`. Save extra states as `docs/spec/evidence/TR-18--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

