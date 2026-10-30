# TW-01 · Sign in

**ID:** TW-01 · **Name:** Sign in · **Priority:** P0 · **Route/screen:** `/sign-in`, `/sign-in/code`, `/forgot-password`, `/set-password` · **Batch:** TW-B (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/SignInPage.tsx` (not found at this path in the repo; nearest: `apps/trainer-web/src/auth/SignInPage.tsx`)
- `apps/trainer-web/src/App.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/trainer-web/src/layout/RequireAuth.tsx` (role check, Batch 0)

**API (from the guide):** `POST /auth/session`, `GET /me`, `DELETE /auth/session`; API-NEW `POST /auth/login`, `/auth/otp/start`, `/auth/otp/verify`, `/auth/password/reset`, `/auth/password/set` (§3.1a)

**Code status:** old code exists (the guide labelled it "Implemented (test identity only)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.1a, §3.5) · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-01 -->
### TW-01 · Sign in

> **Priority:** P0 (production auth) · **Route:** `/sign-in`, `/sign-in/code`, `/forgot-password`, `/set-password` · **Files:** `apps/trainer-web/src/pages/SignInPage.tsx` (inferred from `App.tsx` route), `AuthProvider` · **API:** `POST /auth/session`, `GET /me`, `DELETE /auth/session`; API-NEW `POST /auth/login`, `/auth/otp/start`, `/auth/otp/verify`, `/auth/password/reset`, `/auth/password/set` (§3.1a) · **Decision:** D18

1. **Purpose and user.** The trainer gets into their workspace. Most trainers sign in on a laptop, and some on a tablet.
2. **Entry points.** A direct URL, a redirect when the user has no session, sign-out, and session expiry (401).
3. **Legacy (do not keep).** `shots/d1440_01_signin.png`. An email field turns into a test identity. There's no password and no Firebase.

4. **Gaps to close.**
   - Production sign-in isn't wired.
   - Any API failure, including a network failure, signs the user out (gap analysis, P0 #3).
   - There's no "Trainer accounts only" explanation for trainee emails.
   - There's no forgot-password or code sign-in.
   - The page has no brand moment.
5. **Target design** (D18).
   - **Layout:** split screen at ≥1024. The left half carries the brand gradient, the logo, the "Progress, guided." tagline and one line of value ("See who needs you today"). The right half is a 400 px form card. Below 1024 the page is a single column with no gradient panel.
   - **Default form, password:**
     - **Mobile number or email** (one field). If the input is all digits, show a +91 prefix hint. Normalise with `normalizeWhatsappE164`.
     - **Password**, with a show/hide toggle.
     - **Sign in** (primary).
     - Links: **Forgot password?** and **Sign in with a code instead**.
     - Small print: "Trainer accounts only. Clients use the FitBud app."
     - Footer: **Need help?**, which opens the support `mailto` (§1.6.10).
   - **Code sign-in (alternative):**
     - Step 1: the identifier and a **"Send code to"** choice:
       - **Email** (selected, the only live option);
       - **WhatsApp**, disabled, with a **"Coming soon"** chip and the note "Codes on WhatsApp are coming soon. For now we'll email your code; check spam if you don't see it." This applies while `wa_otp` is off (§1.6.11, D18).
       - When the flag is on, the choice disappears and the copy becomes "We'll send the same 6-digit code to your WhatsApp and your email. Use whichever arrives first."
     - Step 2: a 6-box code input (`autocomplete="one-time-code"`), "Sent to r•••@gmail.com" (with the flag on: "Sent to WhatsApp ••••1234 and r•••@gmail.com"), **Resend in 60 s**, and "Use password instead".
     - If the account has only one channel on file, name that one.
     - **No SMS option**, and no SMS fallback.
   - **Forgot password:** the same code (by email today; email plus WhatsApp once `wa_otp` is on), then **New password** (minimum 8 characters, a strength hint, no composition rules per NIST [R82]), then you're signed in.
   - **First sign-in for provisioned trainers:** sign in with a code, then a prompt to **Set a password** (you can skip it once).
   - **Data:** credentials or the code go to the FitBud auth endpoints (§3.1a), which return a Firebase custom token. The client calls `signInWithCustomToken`, then `POST /auth/session` with the ID token sets the HTTP-only session cookie. `GET /me` returns the roles.
   - **Copy:** title "Welcome back, coach". Errors are covered under States.
6. **States.**
   - *Loading:* the button shows a spinner and inputs are disabled.
   - *Error, wrong credentials:* "That mobile number or email and password don't match." The copy is generic, so it never reveals which part is wrong.
   - *Error, too many attempts:* "Too many tries. Wait 15 minutes or sign in with a code."
   - *Error, code wrong or expired:* "That code didn't work. Check the latest message or resend."
   - *Code sent (always shown, even for unknown identifiers):* "If an account exists, we've sent a code."
   - *WhatsApp leg unavailable* (flag off, which is today's state; budget cap, §4.5; or no mobile on file): the code goes by email only, with the copy "Sent to your email."
   - *Error, network:* "Can't reach FitBud. Check your connection and try again." Stay on the page and keep what was typed.
   - *Role:* a trainee-only role gets "This account is set up as a client. Open the FitBud app on your phone." plus the store links.
   - *Offline:* a banner, with submit disabled.
7. **Interactions and edge cases.**
   - Pressing Enter submits.
   - Password managers work (`autocomplete="username"` / `current-password` / `new-password`).
   - Pasting a 6-digit code fills all the boxes.
   - Session expiry mid-task sends the user to sign-in with `?next=` and then back to the same URL.
   - An account with both roles signs in to the trainer workspace.
8. **Notifications and deep links.**
   - `/go/...` links reached without a session go through sign-in, then continue to the original target (§3.5).
   - The OTP messages are **E-OTP** (email, live; sender `SYSTEM_EMAIL_FROM`, D30) and **W-OTP** (WhatsApp authentication template, built but behind `wa_otp`), see §1.6.11 and §4.2.
9. **References.**
   - Adopt: Firebase custom tokens [R80] https://firebase.google.com/docs/auth/admin/create-custom-tokens and Firebase password authentication [R81] https://firebase.google.com/docs/auth/web/password-auth
   - Adopt: NIST SP 800-63B password and OTP guidance [R82] https://pages.nist.gov/800-63-3/sp800-63b.html and the OWASP authentication and forgot-password cheat sheets [R84]
   - Adopt: WhatsApp authentication templates, with a copy-code button [R79] https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
   - Avoid: OTP-only login with no fallback. Cult.fit users report OTP failures [R39].
10. **UX decisions and why.**
    - Password by default means no per-login cost and no delivery dependency.
    - Email is the live code channel. The WhatsApp option is visible but disabled ("Coming soon"), so users learn it's planned without hitting a dead end. Once it's on, either channel can rescue a sign-in (D18).
    - Distinguish 401 from network errors so a flaky connection never logs the trainer out mid-review.
    - The brand gradient appears only here, on the trainee invite landing page and in onboarding (UX §15).
11. **Implementation.**
    - New `pages/auth/{SignInPage,CodeSignInPage,ForgotPasswordPage,SetPasswordPage}.tsx`.
    - API-NEW (§3.1a): `POST /auth/login`, `POST /auth/otp/start`, `POST /auth/otp/verify`, `POST /auth/password/reset`, `POST /auth/password/set`.
    - In `AuthProvider`, only a 401 response from `/me` clears the session. A `TypeError` or 5xx shows `ErrorState` with Retry.
    - Keep the test-identity path behind `import.meta.env.DEV`.
12. **Acceptance criteria.**
    - [ ] Signing in with a mobile number and password works, and so does email and password.
    - [ ] With `wa_otp` off (today): code sign-in emails the code from the configured sender, and the WhatsApp option is visibly disabled with "Coming soon" and the note.
    - [ ] With `wa_otp` on (tested in staging): one code goes to both WhatsApp and email, and either copy works. Only one code is valid at a time.
    - [ ] There's no SMS path anywhere.
    - [ ] At the WhatsApp budget cap, the code arrives by email only and the UI says so.
    - [ ] The responses never reveal whether an account exists.
    - [ ] Stopping the API while signed in shows an error state, not the sign-in page.
    - [ ] A 401 redirects to `/sign-in?next=<path>` and returns there after sign-in.
    - [ ] Trainee-only accounts see the client message.
    - [ ] The test identity is hidden in production builds.
13. **Priority:** P0.
<!-- END VERBATIM TW-01 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-01.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-01.1** [guide §12] Signing in with a mobile number and password works, and so does email and password.
2. **TW-01.2** [guide §12] With `wa_otp` off (today): code sign-in emails the code from the configured sender, and the WhatsApp option is visibly disabled with "Coming soon" and the note.
3. **TW-01.3** [guide §12] With `wa_otp` on (tested in staging): one code goes to both WhatsApp and email, and either copy works. Only one code is valid at a time.
4. **TW-01.4** [guide §12] There's no SMS path anywhere.
5. **TW-01.5** [guide §12] At the WhatsApp budget cap, the code arrives by email only and the UI says so.
6. **TW-01.6** [guide §12] The responses never reveal whether an account exists.
7. **TW-01.7** [guide §12] Stopping the API while signed in shows an error state, not the sign-in page.
8. **TW-01.8** [guide §12] A 401 redirects to `/sign-in?next=<path>` and returns there after sign-in.
9. **TW-01.9** [guide §12] Trainee-only accounts see the client message.
10. **TW-01.10** [guide §12] The test identity is hidden in production builds.
11. **TW-01.11** [QA checklist #1] At ≥1024 px the page is split: the left brand-gradient panel has the logo (four-dot mark), "Progress, guided." and "See who needs you today". The right side is a ~400 px form card. Below 1024 px it's a single column with no gradient.
12. **TW-01.12** [QA checklist #2] Title "Welcome back, coach". One field "Mobile number or email", a Password field with a show/hide toggle, and a **Sign in** primary button.
13. **TW-01.13** [QA checklist #3] Links **Forgot password?** and **Sign in with a code instead**. Small print: "Trainer accounts only. Clients use the FitBud app." Footer **Need help?** links to `mailto:tech@thefitbud.com`.
14. **TW-01.14** [QA checklist #4] A wrong password shows the generic "That mobile number or email and password don't match." (it doesn't say which part is wrong).
15. **TW-01.15** [QA checklist #5] Code sign-in, step 1: "Send code to" has **Email** selected, and **WhatsApp is disabled with a "Coming soon" chip** plus the note "Codes on WhatsApp are coming soon. For now we'll email your code…". There's no SMS option anywhere.
16. **TW-01.16** [QA checklist #6] Code step 2: a 6-box code input, "Sent to r•••@…" (masked), **Resend in 60 s**, and "Use password instead". It shows "If an account exists, we've sent a code" even for an unknown email.
17. **TW-01.17** [QA checklist #7] Forgot password: code by email, then **New password** (min 8 characters, a strength hint), then you're signed in.
18. **TW-01.18** [QA checklist #8] Sign in as `sneha.review@demo.fitbud.test` (trainee only): you get "This account is set up as a client. Open the FitBud app on your phone." (not a workspace).
19. **TW-01.19** [18 Oct QA] A trainee-only account (sneha.review) signed in on web sees the client message, never `/welcome` or a workspace.
20. **TW-01.20** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
21. **TW-01.21** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- USAGE.md: `apps/trainer-web/src/layout/RequireAuth.tsx:46` only checks `me.trainerProfile?.displayName`; there is no role/`permittedRoles` check, so a trainee-only account (e.g. sneha.review, `/me` → `permittedRoles:["trainee"]`) is sent to `/welcome` instead of seeing "This account is set up as a client…" (checklist TW-01 #8).
- Code fact: the sign-in pages live at `apps/trainer-web/src/auth/{SignInPage,CodeSignInPage,ForgotPasswordPage,AuthLayout}.tsx`, not `pages/auth/*` as the guide suggests. There is no `SetPasswordPage` yet.
- USAGE.md: password login and email OTP APIs work (`POST /auth/login` 200; `POST /auth/otp/start` 202 `{data:{sent,channels:["email"]}}`; code visible at `GET http://127.0.0.1:8787/dev/mail`).
- RCA.md: the trainer-web agent never compared this screen with `img/impl_d1440_01_signin.jpg` or the guide; treat it as not verified.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** `/sign-in`, `/sign-in/code`, `/forgot-password` (signed out; use an incognito window or sign out first) · **Account:** signed out; then rahul.coach. Email codes appear at `http://127.0.0.1:8787/dev/mail`.

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-01.png`. This screen has mobile-web rules, so also save **390×844** as `docs/spec/evidence/TW-01-390.png`. Save extra states as `docs/spec/evidence/TW-01--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

