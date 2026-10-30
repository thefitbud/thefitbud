# TM-08 · Role select (dual-role users)

**ID:** TM-08 · **Name:** Role select (dual-role users) · **Priority:** P2 · **Route/screen:** — · **Batch:** M-8 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/screens/RoleSelectScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/screens/UnsupportedRoleScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/navigation/resolveRoute.ts` (exists: old code. Rebuild it to the target; do not patch it)

**Code status:** old code exists (the guide labelled it "Implemented"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../04-flows.md` (§3.5) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TM-08 -->
### TM-08 · Role select (dual-role users)

> **Priority:** P2 · **Files:** `src/screens/RoleSelectScreen.tsx`, `UnsupportedRoleScreen.tsx`; routes `role_select`, `unsupported_role` in `src/navigation/resolveRoute.ts`

1. **Purpose.** Pick the coach or client view when the user has both roles.
2. **Entry.** After auth.
3. **Legacy (do not keep).** Implemented.
4. **Gaps to close.** Shows "Selected role · userId" dev copy elsewhere (the trainee More tab).
5. **Target design.** Two large cards, "Coach" ("Manage your clients") and "Client" ("Follow your plan"), plus "Remember my choice". Switching later lives in More.
6. **States.** Unsupported role: "This account can't use the app yet. Contact support."
7. **Edge cases.** A deep link to the other role's item prompts "Switch to coach view to open this?"
8. **Deep links.** The resolver handles the role (§3.5).
9. **References.** None needed.
10. **UX decisions.** Remembering the choice avoids repeated friction.
11. **Implementation.** Persist with `expo-secure-store` or AsyncStorage (choose one, OQ-6).
12. **Acceptance criteria.**
    - [ ] The choice is remembered.
    - [ ] No user ids shown.
13. **Priority:** P2.
<!-- END VERBATIM TM-08 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TM-08.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TM-08.1** [guide §12] The choice is remembered.
2. **TM-08.2** [guide §12] No user ids shown.
3. **TM-08.3** [18 Oct QA] No dev copy ("Trainee daily execution", "Selected role · userId"); two cards "Coach" and "Client".
4. **TM-08.4** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
5. **TM-08.5** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: karan.dual sees "Choose mode" with Trainee · Trainer. The guide wants two large cards "Coach"/"Client" plus "Remember my choice". `RoleSelectScreen.tsx:33` uses the label "Trainee daily execution" (dev copy).
- Mobile QA index (TR-04): sneha.review (trainee-only seed account) also lands on Choose mode, because `/me` returned trainee+trainer roles in the Expo session. USAGE.md saw `permittedRoles:["trainee"]` for her on web. Investigate in Batch 0.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **karan.dual@demo.fitbud.test** · route `role_select (dual role)` · 18 Oct capture `fitbud-mobile-shots/ios/TM-08-role-select.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TM-08.png`. Save extra states as `docs/spec/evidence/TM-08--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

