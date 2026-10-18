# TW-02 · Trainer first-run onboarding

**ID:** TW-02 · **Name:** Trainer first-run onboarding · **Priority:** P1 · **Route/screen:** `/welcome` · **Batch:** TW-B (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/WelcomePage.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** `GET /me`, `PUT /me/trainer-profile` [API-NEW: display name, WhatsApp business number, timezone], `GET /templates?scope=global`

**Code status:** the guide says "New-proposed" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 712–749. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-02 -->
### TW-02 · Trainer first-run onboarding

> **Priority:** P1 · **Route:** `/welcome` · **Files:** `pages/WelcomePage.tsx` [new] · **API:** `GET /me`, `PUT /me/trainer-profile` [API-NEW: display name, WhatsApp business number, timezone], `GET /templates?scope=global`

1. **Purpose and user.** A new trainer reaches the first invite in under 3 minutes. They set up their profile, pick defaults and invite one client.
2. **Entry points.** The first sign-in when `trainer_profiles.display_name` is empty, or no client exists and the trainer hasn't dismissed `/welcome`.
3. **Legacy (do not keep).** None. New trainers land on an empty Home.
4. **Gaps to close.**
   - There's no guidance.
   - The trainer's own WhatsApp number isn't captured, but the trainee "Ask on WhatsApp" flow (TR-18) needs it.
   - The timezone is implicit.
5. **Target design.** A three-step card wizard with a progress bar.
   - **Step 1, "Your coaching profile":** display name (shown to clients), WhatsApp number (+91 prefilled, used for client "Ask coach" links), and timezone (detected, editable).
   - **Step 2, "Your starting templates":** a list of the global bases (onboarding form, check-in form, workout, nutrition), each read-only, with the note "You can use these as they are or make your own copy later." The only action is "Continue". Forking isn't forced.
   - **Step 3, "Invite your first client":** the TW-07 form embedded inline, with "Skip for now".
   - At the end: "You're set. FitBud will show you who needs attention here." The trainer lands on Home.
6. **States.**
   - Loading skeleton.
   - Save errors appear inline per field.
   - Leaving partway keeps the draft and returns the trainer to the step they were on.
7. **Interactions and edge cases.**
   - The WhatsApp number is validated with `normalizeWhatsappE164` from `packages/core/src/whatsapp.ts`. That function adds 91 to a 10-digit number.
   - The step can be skipped. TR-18 then degrades to "Your coach hasn't added WhatsApp" if no number exists.
8. **Notifications.** None.
9. **References.**
   - Adapt: the Everfit onboarding flow [R13] https://help.everfit.io/en/articles/8440572-introducing-onboarding-flow
   - Avoid: long setup tours (Fitbod's 20-screen onboarding [R40] works for consumers, not for professionals).
10. **UX decisions and why.**
    - The first invite is the activation moment, so the wizard ends on it.
    - The trainer's WhatsApp number is needed for D1. Today the number lives only on invitations (the client's number).
11. **Implementation.**
    - API-NEW: trainer profile fields `whatsappE164` and `timezone`. Check whether `users.timezone` already exists (it does per the data model: "Timezone is stored separately") and reuse it.
    - Route guard: a `RequireProfile` wrapper in `App.tsx`.
12. **Acceptance criteria.**
    - [ ] A brand-new trainer sees `/welcome` and can finish it in 3 steps or skip.
    - [ ] The WhatsApp number is normalised and saved.
    - [ ] The timezone is saved and later drives renewal states.
13. **Priority:** P1.
<!-- END VERBATIM TW-02 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- The guide has no image for this screen. Build from the text above and `00-foundations.md`.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-02.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-02.1** [guide §12] A brand-new trainer sees `/welcome` and can finish it in 3 steps or skip.
2. **TW-02.2** [guide §12] The WhatsApp number is normalised and saved.
3. **TW-02.3** [guide §12] The timezone is saved and later drives renewal states.
4. **TW-02.4** [QA checklist #1] A three-step card wizard with a progress bar.
5. **TW-02.5** [QA checklist #2] Step 1 "Your coaching profile": display name, WhatsApp number (+91 prefilled), timezone (detected, editable).
6. **TW-02.6** [QA checklist #3] Step 2 "Your starting templates": global bases listed read-only, with the note "You can use these as they are or make your own copy later." The only action is Continue (no forced fork).
7. **TW-02.7** [QA checklist #4] Step 3 "Invite your first client": the add-client form inline, plus **Skip for now**.
8. **TW-02.8** [QA checklist #5] Finish copy "You're set. FitBud will show you who needs attention here.", then you land on Home.
9. **TW-02.9** [QA checklist #6] An invalid WhatsApp number shows an inline field error. 10 digits normalise to +91.
10. **TW-02.10** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
11. **TW-02.11** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- No seeded trainer has an empty display name, so the natural first run can't be reached; only the dev preview `/welcome?capture=welcome` exists (checklist 'Hard-to-reach').
- Because of the RequireAuth bug (see TW-01), trainee-only accounts are wrongly routed to `/welcome`.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `/welcome?capture=welcome` (dev-only preview while signed in as rahul). A natural first run needs a trainer with an empty display name, and no seeded account has one (see "Hard-to-reach" below).
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-02.png`. Save extra states as `docs/spec/evidence/TW-02--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

