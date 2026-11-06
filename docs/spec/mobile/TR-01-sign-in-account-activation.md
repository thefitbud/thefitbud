# TR-01 · Sign in / account activation

**ID:** TR-01 · **Name:** Sign in / account activation · **Priority:** P0 · **Route/screen:** `SignIn`, `CodeSignIn`, `ForgotPassword`, `SetPassword` · **Batch:** M-1 (see `../BATCHES.md`)

**Files to touch:**
- `apps/mobile/src/screens/AuthScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/screens/auth/CodeSignInScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/screens/auth/SignInScreen.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `apps/mobile/src/screens/auth/authFlow.test.ts` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** API-NEW `POST /auth/login`, `/auth/otp/start`, `/auth/otp/verify`, `/auth/password/reset`, `/auth/password/set` (§3.1a)

**Code status:** old code exists (the guide labelled it "Implemented (test identity only)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.1a) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-01 -->
### TR-01 · Sign in / account activation

> **Priority:** P0 · **Screen:** `SignIn`, `CodeSignIn`, `ForgotPassword`, `SetPassword` · **Files:** `src/screens/AuthScreen.tsx` ("Production Firebase sign-in is not wired yet", test token or Firebase UID inputs) → `src/screens/auth/*` [new] · **API:** API-NEW `POST /auth/login`, `/auth/otp/start`, `/auth/otp/verify`, `/auth/password/reset`, `/auth/password/set` (§3.1a) · **Decision:** D18

1. **Purpose.** Get the trainee into the app with the least friction, usually straight from an invite link, at no per-login cost.
2. **Entry.** App first open, the invite link (TR-02), sign-out, session expiry.
3. **Legacy (do not keep).** Test token and Firebase UID fields. Developer-facing.
4. **Gaps to close.** No production auth. Developer copy. No recovery path.
5. **Target design.**
   - Brand gradient hero, logo and "Progress, guided." When the user arrived from an invite: "Join Rahul's coaching" (TR-02 handles new accounts).
   - **Default: password sign-in.**
     - **Mobile number or email**: one field, a numeric keypad toggle, and a "+91" prefix when the input starts with a digit.
     - **Password**, with show/hide.
     - **Sign in** (56 dp primary).
     - **Sign in with a code instead** (a text button).
     - **Forgot password?**
   - **Code sign-in:**
     - **Send code to:** **Email** (selected, the only live option) and **WhatsApp**, disabled, with a **"Coming soon"** chip and the note: "Codes on WhatsApp are coming soon. For now we'll email your code; check spam if you don't see it." This applies while `wa_otp` is off (§1.6.11). When the flag is on, the copy becomes "We'll send a 6-digit code to your WhatsApp and email. Use whichever comes first."
     - **Send code**.
     - A code input with `textContentType="oneTimeCode"` / `autoComplete="sms-otp"`. iOS suggests WhatsApp copy-code from the clipboard; on Android, the WhatsApp authentication template's **copy-code button** puts the code on the clipboard [R79]. Paste fills all six boxes.
     - "Sent to WhatsApp ••••1234 and p•••@gmail.com" · **Resend in 60 s** · *Use password instead*.
     - **No SMS option, and no SMS fallback.**
   - **Forgot password:** the code (same as above), then **New password** (minimum 8 characters, show/hide, no composition rules [R82]), then signed in.
   - Footer: **Need help?**, which opens the support `mailto` (D19).
6. **States.**
   - Signing in: a spinner, with inputs disabled.
   - Wrong credentials: "That mobile number or email and password don't match." (generic).
   - Code sent: "If an account exists, we've sent a code." (generic, no enumeration).
   - Wrong or expired code: "That code didn't work. Check the latest message or tap Resend." After 5 wrong tries: "Too many tries. Request a new code."
   - Rate-limited: "Too many codes requested. Try again in 1 hour or use your password."
   - WhatsApp leg unavailable (budget cap, no mobile on file, or WhatsApp not on that number): "Sent to your email" only.
   - Network error with Retry, and the typed values kept.
7. **Edge cases.**
   - Neither code arrives: "Didn't get it? Check spam, or ask Rahul to confirm your email and number." Resend is available after 60 s. There's still no SMS.
   - Already signed in on the device as another role: go to role select.
   - Password managers: `textContentType="username"` / `password` / `newPassword`.
8. **Deep links.** The invite token persists through auth. `/auth/code?identifier=` prefills.
9. **References.**
   - Adopt: Firebase custom tokens [R80] and password auth [R81]. Firebase phone auth is SMS-based, so it isn't used.
   - Adopt: WhatsApp authentication templates with a copy-code button [R79].
   - Adopt: NIST SP 800-63B [R82] and the OWASP authentication and forgot-password cheat sheets [R84].
   - Avoid: Cult.fit's OTP-only dead ends [R39] https://appinsider.io/apps/cult-fit-gym-workout-fitness-1217794588
10. **UX decisions.**
    - Password by default: it costs nothing per login, works offline from the cached session, and doesn't depend on delivery.
    - The code goes to **two channels at once**, so one failing channel never strands the user. This answers the OTP-failure pattern seen in Indian apps [R39] [R72] without SMS cost.
11. **Implementation.**
    - Firebase JS SDK `signInWithCustomToken` with the token from the FitBud API. Mobile then sends the Firebase ID token as a bearer (Tech Arch).
    - Store the refresh state in `expo-secure-store`.
    - Remove the test fields from production builds.
12. **Acceptance criteria.**
    - [ ] Mobile number or email plus password signs in.
    - [ ] Today, with `wa_otp` off: the code arrives by email from `SYSTEM_EMAIL_FROM`, and WhatsApp shows as disabled "Coming soon".
    - [ ] With `wa_otp` on (staging): one code goes to WhatsApp and email at once, and works from either.
    - [ ] There's no SMS anywhere.
    - [ ] Forgot password resets and signs in.
    - [ ] The invite context is shown.
    - [ ] No test fields in production.
13. **Priority:** P0.
<!-- END VERBATIM TR-01 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-01.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-01.1** [guide §12] Mobile number or email plus password signs in.
2. **TR-01.2** [guide §12] Today, with `wa_otp` off: the code arrives by email from `SYSTEM_EMAIL_FROM`, and WhatsApp shows as disabled "Coming soon".
3. **TR-01.3** [guide §12] With `wa_otp` on (staging): one code goes to WhatsApp and email at once, and works from either.
4. **TR-01.4** [guide §12] There's no SMS anywhere.
5. **TR-01.5** [guide §12] Forgot password resets and signs in.
6. **TR-01.6** [guide §12] The invite context is shown.
7. **TR-01.7** [guide §12] No test fields in production.
8. **TR-01.8** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
9. **TR-01.9** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: clean sign-in; the WhatsApp "Coming soon" card is present; code entry, 6-digit field and resend timer fine; forgot password keeps the typed email. No separate welcome screen exists before sign-in. Still verify every check (no ✅ from the index).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **(signed out)** · route `auth (password mode)` · 18 Oct capture `fitbud-mobile-shots/ios/TR-01-sign-in.png`
- Account **(signed out)** · route `auth › "Sign in with a code instead"` · 18 Oct capture `fitbud-mobile-shots/ios/TR-01b-sign-in-with-code.png`
- Account **(signed out)** · route `auth › code mode › Send code (code sent)` · 18 Oct capture `fitbud-mobile-shots/ios/TR-01c-otp-code-entry.png`
- Account **(signed out)** · route `auth › "Forgot password?"` · 18 Oct capture `fitbud-mobile-shots/ios/TR-01d-forgot-password.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-01.png`. Save extra states as `docs/spec/evidence/TR-01--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

