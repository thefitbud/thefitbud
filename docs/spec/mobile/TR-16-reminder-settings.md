# TR-16 · Reminder settings

**ID:** TR-16 · **Name:** Reminder settings · **Priority:** P0 · **Route/screen:** `ReminderSettings` · **Batch:** M-5 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainee/settings/ReminderSettingsScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** notification preferences (`pushEnabled`, 4 category booleans, quiet hours) + API-NEW fields from TR-05

**Code status:** the guide says "Missing" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.6) · `../05-notifications.md` (§4.1, §4.4) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-16 -->
### TR-16 · Reminder settings

> **Priority:** P0 · **Screen:** `ReminderSettings` · **Files:** `src/trainee/settings/ReminderSettingsScreen.tsx` [new] · **API:** notification preferences (`pushEnabled`, 4 category booleans, quiet hours) + API-NEW fields from TR-05

1. **Purpose.** The trainee owns their reminders (decision C: "clients own notification preferences and quiet hours").
2. **Entry.** More › Reminders, the TR-15 footer, notification long-press "Settings".
3. **Legacy (do not keep).** None in the UI. The preferences contract exists.
4. **Gaps to close.** Not built.
5. **Target design.**
   - **Status card:** "Notifications: On" (or "Off in phone settings · Turn on").
   - **Category switches**, each with a one-line description of *when* it fires:
     - **Workout reminder:** "If your workout isn't logged about an hour after **7:00 pm**." Tap to change the time, or choose "Learn from my workouts".
     - **Meal reminders:** "About 40 min after each meal time, if it isn't logged." A row shows "Using your plan's meal times" or "Using your meal times (2 changed)", with **Change**, which opens **TR-24 Meal times** (D24). Reminders follow the trainee's times.
     - **Check-in reminders:** "The day your check-in is due."
     - **Daily summary:** "One evening note if anything's left, by 9:30 pm."
     - **Coach nudges:** this can't be turned off separately; nudges follow the category of the item. Show the copy "Your coach can send a reminder about a specific item. It follows your quiet hours."
   - **Quiet hours** row: "10:00 pm – 7:00 am" (opens TR-17).
   - **WhatsApp reminders:** while `wa_automation` is off, the row is disabled with a **"Coming soon"** chip and the note "WhatsApp reminders are coming soon. For now we'll remind you in the app." When the flag is on: On or Off, with the number. Turning it on shows the consent text (TR-05). The description reads: "Used only when app notifications don't reach you, or when a few logs slip. At most one a day. Reply STOP to stop." (D17). Turning it off, or replying STOP, takes effect immediately.
   - **Paused reminders** notice (back-off, §3.6): "Meal reminders are paused until Mon because they weren't helping. Turn back on?"
   - A link: "Reminders not arriving?" opens the OEM battery guide (TR-05 step 4).
6. **States.**
   - Saving toast.
   - Offline: saved locally and synced later.
   - OS permission denied: the switches are disabled, with a *Turn on in Settings* deep link (`Linking.openSettings()`).
7. **Edge cases.**
   - A trainer-disabled category (reminder rules off) shows "Your coach has turned off workout reminders", greyed out.
   - **Android channels:** each category maps to a channel, so OS-level toggles stay in sync ([R53]).
8. **Notifications.** These settings drive the engine (§3.6).
9. **References.**
   - Android notification channels [R53].
   - Apple HIG notifications [R58].
   - The HealthifyMe "pushy notifications" complaint [R36] https://www.reddit.com/r/Fitness_India/comments/1c9uudx/ (avoid).
10. **UX decisions.** Describing *when* a reminder fires builds trust and reduces opt-outs.
11. **Implementation.**
    - The existing preferences `PUT`, plus the new fields.
    - Android channels are created at app start: `workout`, `meal`, `checkin`, `summary`, `coach`, `plan`.
12. **Acceptance criteria.**
    - [ ] Each switch persists.
    - [ ] The described timing matches engine behaviour.
    - [ ] Trainer-off categories show as greyed out.
    - [ ] The permission-off state is handled.
    - [ ] The meal times row reflects overrides and opens TR-24.
    - [ ] WhatsApp opt-out takes effect immediately.
    - [ ] With `wa_automation` off, the WhatsApp row is visibly disabled with "Coming soon".
13. **Priority:** P0.
<!-- END VERBATIM TR-16 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-16.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-16.1** [guide §12] Each switch persists.
2. **TR-16.2** [guide §12] The described timing matches engine behaviour.
3. **TR-16.3** [guide §12] Trainer-off categories show as greyed out.
4. **TR-16.4** [guide §12] The permission-off state is handled.
5. **TR-16.5** [guide §12] The meal times row reflects overrides and opens TR-24.
6. **TR-16.6** [guide §12] WhatsApp opt-out takes effect immediately.
7. **TR-16.7** [guide §12] With `wa_automation` off, the WhatsApp row is visibly disabled with "Coming soon".
8. **TR-16.8** [18 Oct QA] farhan.paused shows the paused notice; ishita.pushoff shows the permission-off state with switches disabled. They differ visibly from aarav.
9. **TR-16.9** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
10. **TR-16.10** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: the status card shows "Off in phone settings" (web has no push permission). **farhan.paused and ishita.pushoff look identical to aarav** (all toggles on); the paused notice and trainer-off/permission-off states aren't shown. Console: 403 errors.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **farhan.paused@demo.fitbud.test** · route `tab more › overlay reminder_settings` · 18 Oct capture `fitbud-mobile-shots/ios/TR-16-reminder-settings--farhan-paused.png`
- Account **ishita.pushoff@demo.fitbud.test** · route `tab more › overlay reminder_settings` · 18 Oct capture `fitbud-mobile-shots/ios/TR-16-reminder-settings--ishita-pushoff.png`
- Account **aarav.ontrack@demo.fitbud.test** · route `tab more › overlay reminder_settings` · 18 Oct capture `fitbud-mobile-shots/ios/TR-16-reminder-settings.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-16.png`. Save extra states as `docs/spec/evidence/TR-16--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

