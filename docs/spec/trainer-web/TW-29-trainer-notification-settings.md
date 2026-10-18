# TW-29 · Trainer notification settings

**ID:** TW-29 · **Name:** Trainer notification settings · **Priority:** P1 · **Route/screen:** `/settings/notifications` · **Batch:** TW-G (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/lib/trainer-notification-prefs.ts`

**API (from the guide):** notification preferences (`pushEnabled`, category booleans, `quietHoursStart` and `quietHoursEnd`) for the trainer user [API-CHG: trainer categories]

**Code status:** the guide says "Missing" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 2052–2082. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-29 -->
### TW-29 · Trainer notification settings

> **Priority:** P1 · **Route:** `/settings/notifications` · **API:** notification preferences (`pushEnabled`, category booleans, `quietHoursStart` and `quietHoursEnd`) for the trainer user [API-CHG: trainer categories]

1. **Purpose.** Control which trainer-side alerts reach the trainer (web bell, trainer mobile push, email digest P2).
2. **Entry.** Settings.
3. **Legacy (do not keep).** None. Preferences exist in contracts for any user, but the categories are trainee-oriented.
4. **Gaps to close.** The trainer categories aren't defined.
5. **Target design.**
   - **Switches with one-line descriptions:**
     - *Client asked you on WhatsApp* (on).
     - *Check-in submitted* (on).
     - *Critical items* (on, with "Send at most one summary per hour").
     - *Intake submitted* (on).
     - *Renewals due* (on).
     - *Client changed meal times* (on; bell plus push, merged into the 15-minute batch, D24).
     - *WhatsApp budget alerts* (admins only, D17; email plus bell).
     - *Morning summary at 8:00 am* (off; P2).
   - **Quiet hours:** default 22:00–07:00.
   - **Channels:** mobile push (when the trainer app is installed) and the web bell (always on).
6. **States.** Push permission off on the device: "Turn on notifications in the FitBud app on your phone."
7. **Edge cases.** Trainer alerts batch so there's no burst: at most 1 push per 15 min, with merged content ("3 clients need attention").
8. **Deep links.** None.
9. **References.** Android notification channels [R53] https://developer.android.com/develop/ui/compose/notifications/channels (map each category to a channel).
10. **UX decisions.** Trainers get few pushes too. Home is the main surface.
11. **Implementation.** API-CHG: add the trainer notification types `trainer_ask_coach`, `trainer_checkin_submitted`, `trainer_intake_submitted`, `trainer_critical_digest`, `trainer_renewal`, `trainer_meal_times_changed`, `admin_whatsapp_budget` to `packages/contracts/src/notification.ts`, along with category booleans.
12. **Acceptance criteria.**
    - [ ] Each category toggles.
    - [ ] Quiet hours apply to trainer push.
    - [ ] Merging is limited to 1 per 15 min.
13. **Priority:** P1.
<!-- END VERBATIM TW-29 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- The guide has no image for this screen. Build from the text above and `00-foundations.md`.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-29.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-29.1** [guide §12] Each category toggles.
2. **TW-29.2** [guide §12] Quiet hours apply to trainer push.
3. **TW-29.3** [guide §12] Merging is limited to 1 per 15 min.
4. **TW-29.4** [QA checklist #1] Switches with one-line descriptions: Client asked you on WhatsApp, Check-in submitted, Critical items ("at most one summary per hour"), Intake submitted, Renewals due, Client changed meal times. Morning summary is off/P2.
5. **TW-29.5** [QA checklist #2] WhatsApp budget alerts only for admins (Rahul shouldn't see it, or it's marked admin-only).
6. **TW-29.6** [QA checklist #3] Quiet hours with a default of 22:00–07:00.
7. **TW-29.7** [QA checklist #4] Channels: mobile push and web bell (always on).
8. **TW-29.8** [QA checklist #5] Each toggle persists after a reload.
9. **TW-29.9** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
10. **TW-29.10** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- RCA.md §5: TW-29 was ⚠️ in run 3 and became ✅ in run 4 with no review.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `/settings/notifications`
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-29.png`. Save extra states as `docs/spec/evidence/TW-29--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

