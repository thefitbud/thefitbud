# TW-30 · Ended relationships: end, view, reactivate

**ID:** TW-30 · **Name:** Ended relationships: end, view, reactivate · **Priority:** P1 · **Route/screen:** `/clients?status=ended`; end action from the header overflow; **Reactivate** from the ended header and the ended roster row · **Batch:** TW-G (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/settings/` (check existing files)

**API (from the guide):** API-NEW `POST /relationships/:rid/end`, `POST /relationships/:rid/reactivate`, `POST /relationships/:rid/reactivate/confirm` (trainee); workspace read (ended)

**Code status:** the guide says "Missing" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.8) · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-30 -->
### TW-30 · Ended relationships: end, view, reactivate

> **Priority:** P1 · **Route:** `/clients?status=ended`; end action from the header overflow; **Reactivate** from the ended header and the ended roster row · **API:** API-NEW `POST /relationships/:rid/end`, `POST /relationships/:rid/reactivate`, `POST /relationships/:rid/reactivate/confirm` (trainee); workspace read (ended) · **Decision:** D21

1. **Purpose.** End coaching cleanly, keep read-only access to the history (decision G), and bring the same client back without starting from zero.
2. **Entry.** Header ⋯ *End coaching*, Roster *Ended*, the ended workspace header CTA **Reactivate coaching**, and TW-07 when the invitee was coached before.
3. **Legacy (do not keep).** The workspace header can display ended. There's no end action, no ended view and no reactivation.
4. **Gaps to close.** No workflow. The contract notes that the ended-state guards on mutations and workers need verifying.
5. **Target design.**
   - **End coaching modal:** "End coaching with Priya?" followed by this explanation: "Priya keeps her account and history. You'll both have read-only access. Plans, reminders and nudges stop today. You can reactivate later." An optional reason select (private), then a confirm that requires typing the name (destructive). The button is critical-filled `#B91C1C` with white text.
   - **Ended view:** the roster list with an "Ended 3 Oct" chip and a row action **Reactivate**. The workspace is read-only, with a banner, all mutating CTAs hidden, and History and Progress visible.
   - **Reactivate modal (same trainer and same client):**
     - "Reactivate coaching with Priya?"
     - What comes back: "Her history, your notes, her intake answers, coaching configuration and check-in schedule. Her last plan (*Fat loss v4*) is ready to re-assign."
     - What doesn't: "Reminders and check-ins start again only after you assign a plan and pick a start date. Exceptions that were open when coaching ended stay closed."
     - Optional: **Ask Priya to update her intake** (re-send the onboarding form as a new submission, pinned to the current form version).
     - Primary: **Send reactivation request**. Priya confirms with one tap in the app (TR-22). The trainer sees "Waiting for Priya to confirm · sent 2 h ago", with *Remind on WhatsApp* (wa.me) and *Cancel request*.
   - **After the trainee confirms:** the status becomes `coaching_ready` (or `onboarding_in_progress` if an intake update was requested). The header CTA becomes **Assign plan**, which opens TW-16 with the last plan preselected.
6. **States.**
   - Error ending: "Couldn't end coaching. Nothing has changed." Retry.
   - The reactivation request has expired (14 days, the same expiry as invites): "Request expired · Send again".
   - The trainee has an active relationship with another coach: "Priya is coached by someone else right now. She'll need to end that first." The request can still be sent, and the trainee sees the choice.
7. **Edge cases.**
   - Pending nudges and reminders are cancelled server-side when coaching ends.
   - Exceptions open at the end are system-closed ("Closed · coaching ended"). They're never reopened.
   - The trainee sees TR-22.
   - **A different trainer** coaching the same client creates a *new relationship via a new invite*. It starts blank: no history, no notes, no plans from the earlier coach. The trainee keeps their full history across coaches (TR-13, TR-20 "Past coaching").
   - Reactivation restores the **same relationship id**, so there's no new row and the trainer-trainee uniqueness constraint holds. Its history gets the entries `relationship_ended` and `relationship_reactivated`.
   - Ended for 12 months or more: reactivation still works. Data retention is subject to the open retention policy.
8. **Deep links.** `/go/*` for an ended relationship opens the read-only view.
9. **References.** Trainerize deactivate and reactivate clients [R24] https://help.trainerize.com/hc/en-us/articles/208689116-How-to-Deactivate-and-Reactivate-Clients (adopt: reactivation keeps the client's history).
10. **UX decisions.**
    - Use explicit consequences copy and type-to-confirm to end coaching.
    - Reactivation is cheap and explicit: same thread, history intact, and nothing restarts by surprise.
    - The trainee's tap keeps consent with the client (OQ-25, default accepted 17 Oct).
11. **Implementation.**
    - API-NEW `POST /relationships/:rid/end` and `POST /relationships/:rid/reactivate` (trainer: creates a `reactivation_request` with a 14-day expiry and sends trainee push P-REACT).
    - API-NEW `POST /relationships/:rid/reactivate/confirm` (trainee).
    - Lifecycle states: §3.8.
    - The UI reads `onboardingStatus === 'ended'` and hides mutations everywhere through a `useReadOnly()` hook.
12. **Acceptance criteria.**
    - [ ] After ending, no mutating control is visible anywhere in the workspace.
    - [ ] Reminders stop.
    - [ ] The ended list shows the client.
    - [ ] Reactivating the same client keeps the relationship id, history, notes and configuration.
    - [ ] Nothing is scheduled until a plan is assigned.
    - [ ] A new trainer inviting the same client sees no earlier-coach data.
13. **Priority:** P1.
<!-- END VERBATIM TW-30 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-30.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-30.1** [guide §12] After ending, no mutating control is visible anywhere in the workspace.
2. **TW-30.2** [guide §12] Reminders stop.
3. **TW-30.3** [guide §12] The ended list shows the client.
4. **TW-30.4** [guide §12] Reactivating the same client keeps the relationship id, history, notes and configuration.
5. **TW-30.5** [guide §12] Nothing is scheduled until a plan is assigned.
6. **TW-30.6** [guide §12] A new trainer inviting the same client sees no earlier-coach data.
7. **TW-30.7** [QA checklist #1] The ended list shows Kavya and Nikhil with an "Ended <date>" chip and a row action **Reactivate**.
8. **TW-30.8** [QA checklist #2] Ended workspace: a neutral read-only banner, all mutating controls hidden, and History and Progress visible.
9. **TW-30.9** [QA checklist #3] End coaching modal: "End coaching with <name>?", the consequences copy ("…keeps her account and history … Plans, reminders and nudges stop today. You can reactivate later."), an optional private reason, **type the name to confirm**, and a red `#B91C1C` button with white text.
10. **TW-30.10** [QA checklist #4] Reactivate modal: "Reactivate coaching with <name>?", plus what comes back and what doesn't, the optional "Ask … to update her intake", and primary **Send reactivation request**.
11. **TW-30.11** [QA checklist #5] Pending (Nikhil): "Waiting for <name> to confirm · sent …" with *Remind on WhatsApp* (wa.me) and *Cancel request*.
12. **TW-30.12** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
13. **TW-30.13** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- USAGE.md: ended relationships (Kavya, Nikhil) still have 13 active exceptions each in the seed. The ended view must not show actionable items. The End flow is destructive to local data: cancel at the confirm step or run `pnpm db:reset`.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** `/settings/ended`; roster `/clients?status=ended`; ended workspace `/clients/b9f01670-8acc-45f6-adab-d7728bca88a6/overview` (Kavya), `/clients/8919b5c0-73fa-495a-958e-e9333a41f4e7/overview` (Nikhil, reactivation pending). End flow: `/clients/30e514e1-e3f4-4dac-ae4b-5f45e72c3df6` (Aarav) → ⋯ → End coaching (this is **destructive** to local demo data; cancel at the confirm step unless you intend to rerun `pnpm db:reset`).
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-30.png`. Save extra states as `docs/spec/evidence/TW-30--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

