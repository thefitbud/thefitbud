# TM-07 · More (settings, notifications, profile)

**ID:** TM-07 · **Name:** More (settings, notifications, profile) · **Priority:** P1 · **Route/screen:** — · **Batch:** M-8 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/trainer/TrainerShell.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/trainer/MoreScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**Code status:** the guide says "Missing (placeholder)" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TM-07 -->
### TM-07 · More (settings, notifications, profile)

> **Priority:** P1 · **Files:** `TrainerShell.tsx` More tab → `src/trainer/MoreScreen.tsx` [new]

1. **Purpose.** Trainer notification settings (TW-29 parity), profile, switch role, help and sign out.
2. **Entry.** Tab.
3. **Legacy (do not keep).** A placeholder.
4. **Gaps to close.** No settings.
5. **Target design.**
   - Rows: Notifications (opens the TW-29 categories and quiet hours), Profile (name, mobile / WhatsApp, email, timezone, change password), Open FitBud on web (copy link), Switch to client view (dual-role only), **Help**, which opens the support `mailto` (D19, §1.6.10), Sign out.
   - Permission row: "Notifications: On / Off · Open settings".
6. **States.** Permission denied: deep-link to OS settings.
7. **Edge cases.** Android 13+ needs the POST_NOTIFICATIONS runtime permission ([R52]).
8. **Deep links.** `/coach/settings`.
9. **References.** Android notification permission [R52] https://developer.android.com/develop/ui/compose/notifications/notification-permission
10. **UX decisions.** Parity with web settings.
11. **Implementation.** `expo-notifications` permissions API ([R61]).
12. **Acceptance criteria.**
    - [ ] The permission state is accurate.
    - [ ] Toggles persist through the preferences API.
    - [ ] Help opens the mail composer with the subject and context, and if no mail app is installed it copies the address.
13. **Priority:** P1.
<!-- END VERBATIM TM-07 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TM-07.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TM-07.1** [guide §12] The permission state is accurate.
2. **TM-07.2** [guide §12] Toggles persist through the preferences API.
3. **TM-07.3** [guide §12] Help opens the mail composer with the subject and context, and if no mail app is installed it copies the address.
4. **TM-07.4** [18 Oct QA] Help opens `mailto:tech@thefitbud.com?subject=…` with the screen context (TM-07) and shows "We'll get back to you within a day."
5. **TM-07.5** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
6. **TM-07.6** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: settings buttons render, no failure noted. Verify the Help mailto and permission row against the spec.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **rahul.coach@demo.fitbud.test** · route `tab more` · 18 Oct capture `fitbud-mobile-shots/ios/TM-07-more.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TM-07.png`. Save extra states as `docs/spec/evidence/TM-07--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

