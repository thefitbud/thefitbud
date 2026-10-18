# TW-31 · Reminder responsiveness panel

**ID:** TW-31 · **Name:** Reminder responsiveness panel · **Priority:** P1 · **Route/screen:** a side card on Overview (summary), a side panel opened by *Details*, and a line in TW-05 and TW-20 · **Batch:** TW-G (see `../BATCHES.md`)

**Files to touch:**
- (the guide lists none; find the owning file with `rg` before you start)

**API (from the guide):** API-NEW `GET /notifications/relationships/:rid/responsiveness?days=14`

**Code status:** the guide says "New-proposed" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.6) · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 2137–2180. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-31 -->
### TW-31 · Reminder responsiveness panel

> **Priority:** P1 · **Where:** a side card on Overview (summary), a side panel opened by *Details*, and a line in TW-05 and TW-20 · **API:** API-NEW `GET /notifications/relationships/:rid/responsiveness?days=14`

1. **Purpose.** Let the trainer see whether reminders reach and help this client (D12). That tells them whether the client "didn't see it" or "didn't do it".
2. **Entry.** The Overview Reminders card, the exception drawer, and check-in review context.
3. **Legacy (do not keep).** None. The data exists in `notifications` and `notification_deliveries` (states pending, queued, delivered, read, failed, suppressed, deferred), plus the logging times.
4. **Gaps to close.** Not exposed.
5. **Target design.**
   - **Summary label** (one of these, derived deterministically, **no %**):

     | Label | Rule (last 14 days, per category) |
     |---|---|
     | **Logs on own** | ≥ 70% of items logged *before* any reminder fired. Shown as a count ("Logged 18 of 21 meals before a reminder"). The threshold is internal, and only the counts are shown. |
     | **Responds to reminders** | Most reminded items were logged within 2 h of the reminder. |
     | **Often misses reminders** | ≥ 3 consecutive reminders with no log within 2 h. |
     | **Reminders paused** | Back-off pause active (§3.6), with the date it ends. |
     | **Notifications off** | `pushEnabled = false` or no valid device token. Add "· WhatsApp reminders on" when opted in (only when `wa_automation` is on). |
     | **Not enough data** | < 5 reminder-eligible items. |

   - **Details panel:** per category (Workouts, Meals, Check-ins), with these counts: sent · opened · logged after reminder · logged on own · not logged · suppressed (quiet hours or already logged). Also the trainee's **preferred workout time** (set or learned, "~7:15 pm, learned") and their **quiet hours**.
   - **WhatsApp reminders block (D17).** While `wa_automation` is off, the block shows only "WhatsApp reminders · **Coming soon**", with no counts. When the flag is on, it shows:
     - Opt-in status ("Opted in on 2 Oct" or "Not opted in").
     - The WhatsApp reminders sent in 14 days, and how many were delivered or read.
     - Why WhatsApp is used for this client ("App notifications off" or "Logging has been inconsistent").
     - When the platform cap is reached: "WhatsApp reminders are paused for everyone until 1 Nov (monthly limit). App notifications continue." Trainers never see rupee amounts; budget figures are admin-only (§4.5).
   - Copy: "Reminders are timed by FitBud and respect Priya's settings and meal times. You can switch categories on or off in Configure."
6. **States.** Not enough data. Push off (with the suggestion "Ask Priya to turn on notifications · WhatsApp").
7. **Edge cases.** Counts exclude superseded assignments. "Opened" needs the notification-open event from the mobile app (`read` state). If that's missing, show "—".
8. **Deep links.** None.
9. **References.**
   - TrueCoach compliance rates [R2] https://help.truecoach.co/en/articles/2403738-compliance-rates. Adapt the idea with counts instead of %.
   - HeartSteps micro-randomised trial evidence on prompt timing [R64].
10. **UX decisions.** Labels plus counts give the insight without an opaque score (the contract bans numeric adherence scores).
11. **Implementation.**
    - Server read model in `apps/api/src/domain/reminders.ts`: a new function `responsivenessFor(relationshipId, days)`.
    - API-NEW route under `/notifications`.
    - The mobile app must call mark-read when a push is opened (TR-23).
12. **Acceptance criteria.**
    - [ ] The label follows the rule table.
    - [ ] Counts only.
    - [ ] Preferred and learned time shown.
    - [ ] Push off detected.
13. **Priority:** P1.
<!-- END VERBATIM TW-31 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- The guide has no image for this screen. Build from the text above and `00-foundations.md`.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-31.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-31.1** [guide §12] The label follows the rule table.
2. **TW-31.2** [guide §12] Counts only.
3. **TW-31.3** [guide §12] Preferred and learned time shown.
4. **TW-31.4** [guide §12] Push off detected.
5. **TW-31.5** [QA checklist #1] The summary label is one of: Logs on own / Responds to reminders / Often misses reminders / Reminders paused / Notifications off / Not enough data. It shows **counts, never %** ("Logged 18 of 21 meals before a reminder").
6. **TW-31.6** [QA checklist #2] Farhan → "Reminders paused" (with an end date). Ishita → "Notifications off" plus the suggestion "Ask … to turn on notifications · WhatsApp". Rohan → currently "Not enough data".
7. **TW-31.7** [QA checklist #3] Details panel: per category (Workouts, Meals, Check-ins), counts sent · opened · logged after reminder · logged on own · not logged · suppressed. A missing "opened" shows "—".
8. **TW-31.8** [QA checklist #4] Preferred workout time ("~7:15 pm, learned") and quiet hours shown.
9. **TW-31.9** [QA checklist #5] WhatsApp reminders block shows only **"WhatsApp reminders · Coming soon"** (no counts, no rupee amounts).
10. **TW-31.10** [QA checklist #6] Copy: "Reminders are timed by FitBud and respect …'s settings and meal times. You can switch categories on or off in Configure."
11. **TW-31.11** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
12. **TW-31.12** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- USAGE.md: the re-engage WhatsApp link in the responsiveness read model uses the trainer's number (`domain/responsiveness.ts:183–186`). Rohan currently shows "Not enough data" (checklist).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** `R/overview` → Reminders card → **Details** (or header ⋯ → "Reminder settings for this client"). Also Farhan `/clients/778a793a-d04e-44bc-b7aa-187f70573275/overview` (paused) and Ishita `/clients/0a72ab36-f042-46dc-bceb-67725d78b46a/overview` (push off).
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-31.png`. Save extra states as `docs/spec/evidence/TW-31--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

