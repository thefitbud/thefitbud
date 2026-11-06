# TR-05 · Reminder setup (onboarding step)

**ID:** TR-05 · **Name:** Reminder setup (onboarding step) · **Priority:** P0 (permission, preferred time, timezone), P1 (OEM guide, WhatsApp consent) · **Route/screen:** `ReminderSetup` · **Batch:** M-1 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainee/setup/ReminderSetupScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** notification preferences (PUT), device token registration; API-NEW fields `channelPreference: 'app'|'app_and_whatsapp'`, `whatsappOptIn: {granted, at, source, textVersion}`, `preferredWorkoutTime: HH:MM|null`, `traineeTimezone` (IANA), `locale`; meal-time overrides live in TR-24

**Code status:** the guide says "New-proposed" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../05-notifications.md` · `../04-flows.md` (§3.6 Reminder engine) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-05 -->
### TR-05 · Reminder setup (onboarding step)

> **Priority:** P0 · **Screen:** `ReminderSetup` · **Files:** `src/trainee/setup/ReminderSetupScreen.tsx` [new] · **API:** notification preferences (PUT), device token registration; API-NEW fields `channelPreference: 'app'|'app_and_whatsapp'`, `whatsappOptIn: {granted, at, source, textVersion}`, `preferredWorkoutTime: HH:MM|null`, `traineeTimezone` (IANA), `locale`; meal-time overrides live in TR-24

1. **Purpose.** Gets the trainee's permission and preferences so reminders reach them at sensible times (D11).
2. **Entry.** After intake submit, before Waiting. It can be skipped, and it's repeatable from TR-16.
3. **Legacy (do not keep).** None.
4. **Gaps to close.** Without this, Android OEM battery savers silently kill pushes, and there's no WhatsApp consent.
5. **Target design.** Four short steps, each skippable, with a progress dot strip.
   1. **"When do you usually work out?"**
      - Chips: Morning (6–9), Midday (12–2), Evening (5–8), Night (8–10), Varies.
      - An exact time picker under "Set exact time".
      - Helper: "We'll only remind you if your workout isn't logged about an hour after this. You can change it anytime."
   2. **"How should we remind you?"**
      - **App notifications (recommended)**, selected by default.
      - **App + WhatsApp backup**: **disabled, with a "Coming soon" chip** while `wa_automation` is off. The note reads: "WhatsApp reminders are coming soon. For now we'll remind you in the app. Your coach can still message you on WhatsApp anytime." No consent is collected while the flag is off.
      - **When the flag is on**, the helper explains: "If app notifications don't reach you, or a few logs slip, we'll send a WhatsApp reminder instead. At most one a day." Choosing it opens an **explicit consent** card with the full text: "I agree to receive coaching updates from FitBud on WhatsApp at +91 98xxxx1234. I can stop anytime from Settings or by replying STOP." It has a checkbox (unchecked by default) and the number, which can be edited.
      - Trainees who finished setup before the flag turned on see a one-time inbox item and a TR-16 prompt: "WhatsApp reminders are here. Want them as a backup?" (D17).
   3. **"Allow notifications"** (pre-permission screen).
      - A visual of a sample reminder: "Lunch isn't logged yet · Eaten as planned".
      - Primary: **Allow notifications**, which triggers the OS prompt (Android 13+ POST_NOTIFICATIONS, iOS authorisation).
      - Secondary: *Not now*.
      - If denied: "No problem. You can turn them on later in Settings."
   4. **"Keep reminders working"** (Android only, shown only when the device maker is on a known list: Xiaomi, Redmi, POCO, OnePlus, Oppo, Realme, Vivo, Samsung, Huawei).
      - Maker-specific steps, for example "Settings › Apps › FitBud › Battery › No restrictions" and "Enable Autostart", with an **Open settings** button (an intent to the app details or battery optimisation screen).
      - "Done" and "Skip" buttons.
      - A link: "Why?" opens the dontkillmyapp page for that maker.
   - **Quiet hours** default to 22:00–07:00. They're shown on the last step as a line with *Change*.
   - **Your time zone** (D22): a line on the last step, "Times shown in India Standard Time (from your phone) · *Change*". It's stored as `traineeTimezone` (IANA).
   - **Meal times** line: "Meal reminders follow your plan's times. You can adjust them anytime in Settings › Meal times" (TR-24).
6. **States.**
   - Permission already granted: skip step 3.
   - iOS: skip step 4.
   - Offline: preferences are saved locally and synced later.
7. **Edge cases.**
   - Consent **must** be stored with a timestamp, source ("onboarding") and text version for audit (Meta opt-in rules [R44] and DPDP consent [R60]).
   - WhatsApp reminders are sent through the **Meta WhatsApp Cloud API** with approved utility templates (D17, §4.2, §4.6), **only once `wa_automation` is on**. They take effect as soon as the consent is stored. The number is the account mobile by default.
   - If the platform budget cap is reached (§4.5), the consent stays valid, and reminders fall back to push without telling the trainee.
   - A "Varies" workout time means the learned time is used, with 18:00 as the fallback.
8. **Notifications.** Sets up all of §4. Send no test notification without consent.
9. **References.**
   - Android notification permission best practice [R52].
   - Meta "Getting opt-in" [R44] https://developers.facebook.com/docs/whatsapp/overview/getting-opt-in (mirror verified: https://whatsapp-docs.kap.so/documentation/whatsapp/getting-opt-in).
   - WhatsApp Business Messaging Policy [R45] https://business.whatsapp.com/policy
   - Don't kill my app [R54] https://dontkillmyapp.com/ , https://dontkillmyapp.com/xiaomi , https://dontkillmyapp.com/oneplus
   - DPDP Act 2023 [R60].
   - Apple HIG notifications [R58] https://developer.apple.com/design/human-interface-guidelines/notifications
10. **UX decisions.**
    - A pre-permission screen before the OS prompt raises grant rates, and leaves a second chance if the user isn't ready.
    - WhatsApp is opt-in, defaults off, and is limited to important updates, to protect trust and comply with the opt-in rules.
    - The OEM guide addresses the top Indian Android failure mode.
11. **Implementation.**
    - `expo-notifications` `requestPermissionsAsync`.
    - `expo-device` or `Platform.constants` for the manufacturer.
    - `expo-intent-launcher` for the battery settings intents. Every intent falls back to the app details screen.
    - Persist preferences through the existing preferences `PUT`, plus the new fields (API-NEW).
12. **Acceptance criteria.**
    - [ ] Defaults: App only, quiet hours 22:00–07:00.
    - [ ] While `wa_automation` is off, the WhatsApp option is disabled with "Coming soon" and no consent is stored.
    - [ ] When it's on, the WhatsApp consent checkbox is unchecked by default, and storage includes time and text version.
    - [ ] The OEM step appears only on the listed makers.
    - [ ] Every step can be skipped.
    - [ ] The preferred workout time saves (or stays null).
13. **Priority:** P0 (permission, preferred time, timezone), P1 (OEM guide, WhatsApp consent).
<!-- END VERBATIM TR-05 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-05.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-05.1** [guide §12] Defaults: App only, quiet hours 22:00–07:00.
2. **TR-05.2** [guide §12] While `wa_automation` is off, the WhatsApp option is disabled with "Coming soon" and no consent is stored.
3. **TR-05.3** [guide §12] When it's on, the WhatsApp consent checkbox is unchecked by default, and storage includes time and text version.
4. **TR-05.4** [guide §12] The OEM step appears only on the listed makers.
5. **TR-05.5** [guide §12] Every step can be skipped.
6. **TR-05.6** [guide §12] The preferred workout time saves (or stays null).
7. **TR-05.7** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
8. **TR-05.8** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: "Step 1 of 4" reminder setup renders; no failure noted.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **aarav.ontrack@demo.fitbud.test** · route `trainee_shell › overlay reminder_setup` · 18 Oct capture `fitbud-mobile-shots/ios/TR-05-reminder-setup.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-05.png`. Save extra states as `docs/spec/evidence/TR-05--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

