# TW-11 · Coaching configuration ("Configure")

**ID:** TW-11 · **Name:** Coaching configuration ("Configure") · **Priority:** P1 (reminder toggles P0, since they're needed for D4–D8) · **Route/screen:** `/clients/:rid/configure` · **Batch:** TW-C (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/ConfigureCoachingPage.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** `GET/PUT /configurations/relationships/:rid[/draft]`, `POST …/configure`, `POST …/activate`, `POST …/versions`; `GET/PUT /relationships/:rid/subscription`; `GET/PUT` reminder rules (notifications routes)

**Code status:** old code exists (the guide labelled it "Implemented (needs rework)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-11 -->
### TW-11 · Coaching configuration ("Configure")

> **Priority:** P1 · **Route:** `/clients/:rid/configure` · **Files:** `pages/ConfigureCoachingPage.tsx` · **API:** `GET/PUT /configurations/relationships/:rid[/draft]`, `POST …/configure`, `POST …/activate`, `POST …/versions`; `GET/PUT /relationships/:rid/subscription`; `GET/PUT` reminder rules (notifications routes)

1. **Purpose.** Set the coaching baseline: goal, workout and nutrition expectations, check-in cadence, tracking requirements, subscription dates, and (new here) **automatic reminders on or off per category**.
2. **Entry.** After TW-10, the header overflow, and the Home Renewals CTA.
3. **Legacy (do not keep).** `shots/d1440_10_client1_configure.png`. A long page (about 2,000 px) with every section expanded. It fires 404s for clients with no subscription or configuration. It doesn't load reminder rules.

4. **Gaps to close.**
   - No progressive disclosure.
   - Reminder toggles are missing (the contract says showing them is a wiring task).
   - Empty 404s show as console errors.
   - The draft, configured and active lifecycle is unclear to trainers.
5. **Target design.** An **accordion** with a summary line on each collapsed section.

   | Section | Fields | Collapsed summary example |
   |---|---|---|
   | Goal | goalShort (required, 120, live counter), goalDescription (500) | "Lose 6 kg by March · description added" |
   | Workouts | sessions per week (stepper 1–7), completion window | "4 sessions/week · log within 24 h" |
   | Nutrition | meals per day, confirmation window, photo requirement (none, selected meals, all meals) | "5 meals/day · photo for lunch & dinner" |
   | Check-ins | cadence (weekly, biweekly, monthly), due window hours, form (select from check-in templates, TW-25) | "Weekly · 48 h window · Standard check-in" |
   | Tracking | body weight, progress photos, session RPE (switches) | "Weight weekly · photos · RPE" |
   | **Automatic reminders** | Workout, Meal, Check-in switches (the `reminder_rules` booleans) plus a read-only note | "On for workouts and meals · off for check-ins" |
   | Subscription | plan name, payment frequency, start date, renewal date (no amounts) | "Monthly · renews 1 Nov" |

   - The **Automatic reminders** note reads: "FitBud times reminders around Priya's meal times and workout time, only when something isn't logged, and never in her quiet hours (10 pm–7 am). Priya controls her own notification settings and can adjust her meal times." When she has changed any times, the note adds "Priya's meal times: Lunch 2:30 pm (plan 1:30 pm)" (D24).
   - **WhatsApp reminders** status line (read-only). While `wa_automation` is off, which is today's state: "WhatsApp reminders · **Coming soon**. FitBud reminds Priya in the app for now." When it's on: "WhatsApp reminders: opted in · used when app notifications don't reach Priya" or "Not opted in". The trainer can't opt a client in (D17).
   - The trainer can always message Priya themselves with **Open WhatsApp**, which uses `wa.me` and trainer-signed text (D31).
   - **Sticky footer:** a status pill (Draft / Configured / Active) and the primary action, which depends on state: *Save draft*, *Activate* (when complete), or *Create new version* (when active; active rows aren't edited in place).
6. **States.**
   - Empty (no configuration yet): start a draft with sensible defaults. Treat a 404 as "none", not as an error.
   - `CONFIGURATION_INCOMPLETE`: open the Goal section with an inline error.
   - `CONFIGURATION_NOT_EDITABLE`: prompt "This version is active. Create a new version to change it."
   - Version conflict (409): reload prompt.
   - Ended: read-only.
7. **Edge cases.**
   - Reminder toggles save **independently** of the configuration lifecycle (separate route), with an immediate toast.
   - When a client has turned off push themselves, show "Priya has turned off app notifications. Reminders can't reach her." (from the TW-31 read model).
8. **Deep links.** `/go/client/:rid/configure`.
9. **References.** No strong external reference for this exact screen. Progressive disclosure follows NN/g [R66] https://www.nngroup.com/articles/progressive-disclosure/.
10. **UX decisions.**
    - Accordions with summaries cut cognitive load.
    - Reminders sit here because trainers own the per-client switches (decision C), while the trainee owns timing preferences.
    - There's no coaching-config preset family (contract). Optional "Copy settings from another client" is P2, scoped to the trainer's own clients.
11. **Implementation.**
    - `components/configure/Section.tsx` (accordion).
    - Fetch the reminder rules route on mount.
    - Handle a 404 as empty in `api-client` (a `notFoundAsNull` option).
12. **Acceptance criteria.**
    - [ ] No console errors for new clients.
    - [ ] Every section shows a summary when collapsed.
    - [ ] Reminder toggles load and save.
    - [ ] Lifecycle actions follow the draft, configured, active, superseded rules.
13. **Priority:** P1 (reminder toggles P0, since they're needed for D4–D8).
<!-- END VERBATIM TW-11 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-11.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-11.1** [guide §12] No console errors for new clients.
2. **TW-11.2** [guide §12] Every section shows a summary when collapsed.
3. **TW-11.3** [guide §12] Reminder toggles load and save.
4. **TW-11.4** [guide §12] Lifecycle actions follow the draft, configured, active, superseded rules.
5. **TW-11.5** [QA checklist #1] An **accordion**. Each collapsed section shows a summary line: Goal, Workouts, Nutrition, Check-ins, Tracking, **Automatic reminders**, Subscription (no amounts).
6. **TW-11.6** [QA checklist #2] Automatic reminders: Workout / Meal / Check-in switches that save on their own with a toast, plus the note "FitBud times reminders around …, only when something isn't logged, and never in her quiet hours (10 pm–7 am)…".
7. **TW-11.7** [QA checklist #3] **WhatsApp reminders · Coming soon** (read-only, with no opt-in control for the trainer) and "FitBud reminds <name> in the app for now."
8. **TW-11.8** [QA checklist #4] An **Open WhatsApp** link (wa.me, trainer-signed text, the trainer sends it).
9. **TW-11.9** [QA checklist #5] Sticky footer: status pill (Draft/Configured/Active) plus one primary (*Save draft* / *Activate* / *Create new version*).
10. **TW-11.10** [QA checklist #6] Ishita (push off): "…has turned off app notifications. Reminders can't reach her."
11. **TW-11.11** [QA checklist #7] No console 404 errors for a client without a config or subscription (check DevTools). Ended clients are read-only.
12. **TW-11.12** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
13. **TW-11.13** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- No screen-specific failure recorded. Check DevTools for 404s on a client without a config or subscription (checklist TW-11 #7).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `R/configure` (also Farhan `/clients/778a793a-d04e-44bc-b7aa-187f70573275/configure`, Ishita `/clients/0a72ab36-f042-46dc-bceb-67725d78b46a/configure`)
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-11.png`. Save extra states as `docs/spec/evidence/TW-11--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

---

## Design amendment · 21 Oct 2026 (mockups redesign)

Location and sections (mockups 148, 149):
- Configure lives in the client **Plan tab** as the sub-tab **Coaching setup** (next to *Plans*); route `/clients/:rid/plan?view=setup`. Entry: Plan tab; onboarding page › *Mark ready & configure*; header ⋯ › *Coaching setup*; Home Renewals CTA → Subscription section.
- Accordion order: **Goal** (goalShort shown to the client, 120 chars; **detailed goal**, private, 500) · **Basics** (age, sex, height, start weight from intake, diet preference, timezone) · **Expectations** · Workouts · Nutrition · Check-ins · Reminders · Subscription. Tracking switches move into Expectations.
- **Expectations** table: Expectation · Target · "Raises a flag when". Rows: Workouts per week + log window; Meals logged per week ("at least 22 of 28"); Check-in cadence + window; Weight trend range per week + weigh-in day; Steps (optional, only when the client connects a health app). Each row states which Attention/Critical rule it feeds. Counts only, no %. Changes apply from tomorrow and never re-flag past days. Saving on an active setup creates a new version (sticky footer: status pill + Save as vN).
- **Open question (behaviour):** today's exception thresholds are global (00-foundations "does not reopen accepted behaviour"). Making them per-client from Expectations needs product sign-off and an API change.
