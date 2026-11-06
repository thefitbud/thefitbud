# TW-32 · Asked-coach items (trainer)

**ID:** TW-32 · **Name:** Asked-coach items (trainer) · **Priority:** P1 · **Route/screen:** Home section and drawer (`/?ask=:id`), an Activity row marker, and the bell · **Batch:** TW-A (see `../BATCHES.md`)

**Files to touch:**
- (the guide lists none; find the owning file with `rg` before you start)

**API (from the guide):** API-NEW `coach_asks` (see TR-18): `GET /coach-asks?status=open`, `POST /coach-asks/:id/answer {note?}`, `POST /coach-asks/:id/notes`

**Code status:** the guide says "New-proposed" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.5) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-32 -->
### TW-32 · Asked-coach items (trainer)

> **Priority:** P1 · **Where:** Home section and drawer (`/?ask=:id`), an Activity row marker, and the bell · **API:** API-NEW `coach_asks` (see TR-18): `GET /coach-asks?status=open`, `POST /coach-asks/:id/answer {note?}`, `POST /coach-asks/:id/notes`

1. **Purpose.** Close the WhatsApp loop inside FitBud without chat (D2). The trainer sees which items clients asked about, answers in WhatsApp, and marks them answered here.
2. **Entry.** Home "Asked you on WhatsApp", a bell or push notification ("Priya asked about Lunch"), and markers on Activity and exceptions.
3. **Legacy (do not keep).** None.
4. **Gaps to close.** The trainer can't link a WhatsApp conversation to the item it's about.
5. **Target design.**
   - **Drawer:**
     - Header: "Priya asked about **Lunch · Tue 13 Oct**".
     - The topic chip the trainee picked ("Swap a food", "Portion size", "Form check", "Pain or discomfort", "Other").
     - "Asked 2 h ago on WhatsApp."
     - A source card: the item, exactly as in TW-05.
   - **Actions:**
     - Primary: **Mark answered** (an optional note to keep in FitBud).
     - Secondary: *Open WhatsApp chat* (wa.me to the client, with no prefill, or "Re: Lunch Tue").
     - Overflow: *Add note*, *Adjust plan*, *Open item*.
   - Notes are trainer notes: private by default, with the optional "Visible to client" switch (D20). The *Mark answered* note includes the same switch, and a visible answer note shows on the trainee's item.
   - Copy hint: "Reply on WhatsApp as usual. Marking it answered lets Priya see it here too."
   - **Trainee effect:** the TR-18 marker changes to "Coach answered" and the trainee gets I-ANS in their inbox (no push, unless they've opted in).
6. **States.**
   - Already answered: read-only.
   - Pain topic: an **attention** chip, plus a caution note: "Pain was reported. Check in with Priya directly." No triage advice.
7. **Edge cases.**
   - Repeated asks on the same item within 24 h merge (count "asked 2×").
   - Asks auto-expire as "Not marked" after 7 days and leave the open list. They stay in history.
   - An ask never changes adherence (contract: separate domains).
8. **Deep links.** `/go/ask/:id`, which goes to `/?ask=:id` for trainers and to the item for trainees.
9. **References.** No strong external reference. The pattern is unique to FitBud. WhatsApp linking mechanics: [R41], [R42].
10. **UX decisions.** Storing a marker, not message content, keeps privacy (decision F) and avoids a chat product.
11. **Implementation.** New domain table `coach_asks` (§3.5 has the data model), a new route file `routes/coach-asks.ts`, `realtime/emit.ts` hints and history kind `coach_ask`.
12. **Acceptance criteria.**
    - [ ] An ask appears within 5 s of the trainee tapping (after sync).
    - [ ] Mark answered updates the trainee.
    - [ ] No message content is stored.
    - [ ] Asks don't affect adherence.
13. **Priority:** P1.
<!-- END VERBATIM TW-32 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-32.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-32.1** [guide §12] An ask appears within 5 s of the trainee tapping (after sync).
2. **TW-32.2** [guide §12] Mark answered updates the trainee.
3. **TW-32.3** [guide §12] No message content is stored.
4. **TW-32.4** [guide §12] Asks don't affect adherence.
5. **TW-32.5** [QA checklist #1] A drawer with the header "<name> asked about **<item> · <date>**" and a topic chip with a human label ("Portion size", **not** `portion_size`).
6. **TW-32.6** [QA checklist #2] "Asked … ago on WhatsApp." plus a source card for the item.
7. **TW-32.7** [QA checklist #3] Primary **Mark answered** (optional note with a **Visible to client** switch). Secondary *Open WhatsApp chat* (wa.me, no auto-send). Overflow: Add note, Adjust plan, Open item.
8. **TW-32.8** [QA checklist #4] Hint: "Reply on WhatsApp as usual. Marking it answered lets <name> see it here too."
9. **TW-32.9** [QA checklist #5] No message content is shown or stored, and nothing claims a sync with WhatsApp. Once answered it's read-only.
10. **TW-32.10** [QA checklist #6] A pain topic would show an amber chip plus "Pain was reported. Check in with … directly." (not seeded).
11. **TW-32.11** [18 Oct QA] The topic chip reads "Portion size"; no `portion_size` anywhere on `/` or in the drawer.
12. **TW-32.12** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
13. **TW-32.13** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Checklist pre-observed: Home shows "Asked about portion_size" (raw enum; `HomePage.tsx:275`). The drawer must show "Portion size".

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `/?ask=b532e1ca-7fea-4563-8d50-4468bc66f586` (Ishita, portion size) · Home section "Asked you on WhatsApp"
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-32.png`. Save extra states as `docs/spec/evidence/TW-32--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

