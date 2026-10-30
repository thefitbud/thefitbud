# TW-28 · Settings (More)

**ID:** TW-28 · **Name:** Settings (More) · **Priority:** P1 · **Route/screen:** `/settings`, `/settings/profile` · **Batch:** TW-G (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/settings/SettingsLayout.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `ProfilePage.tsx` [new]
- `apps/trainer-web/src/pages/settings/` (check existing files)

**API (from the guide):** `GET /me`; trainer profile [API-NEW, see TW-02]; `DELETE /auth/session`

**Code status:** the guide says "Missing" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-28 -->
### TW-28 · Settings (More)

> **Priority:** P1 · **Route:** `/settings`, `/settings/profile` · **Files:** `pages/settings/SettingsLayout.tsx`, `ProfilePage.tsx` [new] · **API:** `GET /me`; trainer profile [API-NEW, see TW-02]; `DELETE /auth/session`

1. **Purpose.** Account, profile, preferences, help and sign-out. Navigation needs a "More" item (UX §5).
2. **Entry.** The More navigation item, and the sidebar profile.
3. **Legacy (do not keep).** None. "Help & Support" is static text (gap analysis).
4. **Gaps to close.** The whole screen.
5. **Target design.**
   - **Left sub-navigation:** Profile · Notifications (TW-29) · Ended clients (TW-30) · Units & language · Help · Privacy & data · Sign out.
   - **Profile:** display name, mobile / WhatsApp number (sign-in, OTP and client "Ask coach" links), email (sign-in and OTP), timezone, and **Change password** (current password, then the new one; or "Forgot it?", which uses the OTP flow, D18).
   - **Units and language:** kg or lb, cm or in, interface language (English, with Hinglish later; the trainer UI stays English in MVP).
   - **Help:** a single row, **Email FitBud support**, which opens `mailto:tech@thefitbud.com` with a prefilled subject and context (§1.6.10, D19). There's no help site or support page in MVP. Under the row, the reply promise (D33): "We'll get back to you within a day." The copy options are in §1.6.10.
   - **Privacy and data:** what is stored, and a data export request (P2, pending the retention, export and deletion policy, which is a contract open item).
6. **States.** Save toasts. Inline errors.
7. **Edge cases.** Changing the timezone changes renewal-state calculations. Show "Renewal dates are calculated in your timezone."
8. **Deep links.** None.
9. **References.** No strong external reference. This is a standard settings pattern.
10. **UX decisions.** Keep it small. MVP settings need no organisation or team settings (contract: no organisation).
11. **Implementation.** Nested routes in `App.tsx`.
12. **Acceptance criteria.**
    - [ ] More reaches Settings.
    - [ ] Profile saves.
    - [ ] Sign out revokes the session.
    - [ ] No static fake Help text.
    - [ ] Help opens the mail app with the subject and the app version, role and screen in the body.
13. **Priority:** P1.
<!-- END VERBATIM TW-28 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-28.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-28.1** [guide §12] More reaches Settings.
2. **TW-28.2** [guide §12] Profile saves.
3. **TW-28.3** [guide §12] Sign out revokes the session.
4. **TW-28.4** [guide §12] No static fake Help text.
5. **TW-28.5** [guide §12] Help opens the mail app with the subject and the app version, role and screen in the body.
6. **TW-28.6** [QA checklist #1] Left sub-nav: Profile · Notifications · Ended clients · Units & language · Help · Privacy & data · Sign out.
7. **TW-28.7** [QA checklist #2] Profile: display name, mobile/WhatsApp, email, timezone, **Change password** (with a "Forgot it?" OTP path).
8. **TW-28.8** [QA checklist #3] Help: one row, **Email FitBud support** = `mailto:tech@thefitbud.com?subject=…&body=…` (the subject has the screen ID; the body has app/version/role/screen and no client data), with "We'll get back to you within a day." under it.
9. **TW-28.9** [QA checklist #4] No static fake "Help & Support" text and no help-site link.
10. **TW-28.10** [QA checklist #5] Save shows a toast. Sign out returns you to `/sign-in`.
11. **TW-28.11** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
12. **TW-28.12** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- No screen-specific failure recorded. Guide legacy: static "Help & Support" text (banned).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** `/settings` (should redirect to `/settings/profile`), `/settings/help`
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-28.png`. Save extra states as `docs/spec/evidence/TW-28--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

