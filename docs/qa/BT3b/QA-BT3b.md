# QA-BT3b · Mobile links to Privacy, Terms and Credits

Task: `docs/specs/BT3b.md` · Batch: `docs/specs/batches/W3.md` · Branch `claude/BT3b-mobile-legal-links`

## Frames used

The spec names frames `06-trainee-signin-ios.png`, `16-trainee-more-ios.png` and
`51-trainer-mobile-more-ios.png`. **Those three frames show the screens without any legal
links** — 06 ends at "Need help?" and 51 ends at Sign out, both complete top-to-bottom, and
16 is cut off mid-list. They are the pre-BT3b screens, so they cannot be the design for this task.

Firoz has since put the DS5 legal frames on `main`. The ones that govern this task are:

| Frame | Governs |
|---|---|
| `ds5-ios-signin-footer.png` | the sign-in footer ("Privacy · Terms", underlined, centred, below "Need help?") |
| `ds5-ios-more-legal.png` | the trainee More "LEGAL" group (three rows, icons, hints, external-link affordance) |

There is **no DS5 frame for the trainer More screen.** See "Deviations".

## Visual check

Harness: `expo start --web` on port 8099 (`CI=1 BROWSER=none EXPO_NO_TELEMETRY=1`), driven by
Playwright 1.64.1 with Chromium at `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`
(`--no-sandbox --disable-dev-shm-usage`), viewport 393×852, `deviceScaleFactor: 2`.
Metro bundled the web target successfully: `Web Bundled 15041ms apps/mobile/index.js (2752 modules)`.

An earlier W3 task concluded there was no mobile screenshot harness. **That is not correct** —
Expo web builds and renders in this container, and the sign-in screen is reachable without auth.

Fonts fall back: `api.fontshare.com` (Satoshi) is blocked by the egress proxy
(`net::ERR_TUNNEL_CONNECTION_FAILED`), so judge layout and spacing, not letterforms.

### Captured

| File | Screen | Result |
|---|---|---|
| `01-signin-ios-393x852.png` | Sign-in, scrolled to top | PASS |
| `01-signin-footer-ios-393x852.png` | Sign-in, scrolled to the footer | PASS against `ds5-ios-signin-footer.png` |

Footer vs frame: "Privacy · Terms", centred, underlined, muted grey, one line directly under
"Need help?", separated by a middot. Matches.

The rest of the sign-in screen differs from the frame in two **pre-existing** ways, neither caused
by this task: the "WhatsApp · Coming soon" note and the "Have a code?" link are rendered here
because no API config is loaded, while the frame shows the state with WhatsApp OTP enabled.
Those extra blocks push the footer below the fold at 393×852, which is why there are two captures.

### Tap targets (not eyeballed)

BT3's review found sign-in footer links that looked right but were only ~32 px hittable because
another element painted over them. Measured here with `boundingBox()` plus `document.elementFromPoint`
at the centre and all four corners, after scrolling into view:

```
Privacy policy, opens in your browser
   box     {"x":137.44,"y":768,"width":56.92,"height":44}
   hittest {"contains":true,"topTag":"DIV","corners":[true,true,true,true]}
Terms of use, opens in your browser
   box     {"x":205.98,"y":768,"width":49.58,"height":44}
   hittest {"contains":true,"topTag":"DIV","corners":[true,true,true,true]}
```

Both are a full 44 pt tall and nothing paints over them. The trainee More rows use `M2Row`
(`minHeight: 56`) and the trainer More rows use `PrimaryButton`, both already ≥ 44 pt.

### Not captured — the two More screens

**Outstanding.** Both More screens are behind sign-in, and sign-in could not be completed in the
Expo-web harness. Exactly what was run and what happened:

1. `pnpm setup:local` (exit 0), `pnpm db:reset` (exit 0, demo seed loaded).
2. `pnpm api` — came up on **port 8790** (not the documented 8787);
   `curl http://127.0.0.1:8790/health` → `{"data":{"status":"ok","service":"fitbud-api"}}`.
3. Restarted Expo web with `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8790`.
4. In Playwright: filled both fields (verified by reading `inputValue()` back), first with
   `fill()` and then with `pressSequentially()` so React's onChange would fire, and pressed the
   `Sign in` button — located as `getByRole('button', { name: 'Sign in', exact: true })` after
   confirming by enumeration that it is a real button, and also clicked by raw
   `page.mouse.click()` at its measured centre `{"x":24,"y":514,"width":345,"height":48}`.

Result: the app stays on the sign-in screen, shows **no** error banner, and issues **no HTTP
request at all** — not to 8790, not to the 8787 default. With `requestfailed`, `console` and
`pageerror` all logged, the only network failure in the whole session is the blocked font host.
The app makes no API call even on mount (ConfigProvider never fetches), which is why the
"WhatsApp · Coming soon" default-config note is showing. This is an Expo-web harness limitation
in this container, not a behaviour introduced by this task, and fixing it is outside this spec.

The legal rows on both More screens are instead covered by automated render tests
(`apps/mobile/src/lib/legalLinks.test.ts`), which assert each row's label, hint, and the exact URL
passed to `Linking.openURL` for both the default and the staging base URL.

### Device checklist for Firoz

On a dev build, trainee and trainer:

- [ ] Trainee More: a **LEGAL** group sits between the Privacy/Sync group and the Help group, with
      Privacy policy, Terms of use, Credits and licences — order and icons per `ds5-ios-more-legal.png`.
- [ ] The existing **Privacy · What your coach can see** row is still above it and still opens the
      in-app screen, not a browser.
- [ ] Each legal row shows the address it opens ("Opens app-staging.thefitbud.com/privacy" on a
      staging build) except Credits, which reads "Exercise drawings and food data".
- [ ] Each row opens the correct page in the system browser, on the right host for the build.
- [ ] Trainer More: Privacy policy, Terms of use and Credits and licences appear under Help and open
      the same three pages.
- [ ] Sign-in footer: "Privacy · Terms" under "Need help?", both tappable.
- [ ] All rows and footer links are comfortably tappable (≥ 44 pt).

**Expect draft text.** Per D-W3-10 the BT3 pages currently carry *draft* Privacy and Terms bodies —
counsel's text is still being written and BT3c swaps it in. The pages will say the text is being
prepared. That is expected and is not a failure of this task.

## Banned strings

`docs/spec/banned-strings.json` is hand-checked for every new string, and pinned by a test
(`new legal copy against docs/spec/banned-strings.json`) that runs every error-severity,
non-web-scoped pattern against each one. The trainer-web `banned-strings` e2e suite does not reach
the mobile app, so this test is the guard.

New strings: "Legal", "Privacy", "Terms", "Privacy policy", "Terms of use", "Credits and licences",
"Opens app.thefitbud.com/privacy", "Opens app.thefitbud.com/terms",
"Exercise drawings and food data", and the three "…, opens in your browser" accessibility labels.
No ISO dates, no raw enum values, no percentages, no streaks, no "placeholder", no screen IDs.

## Deviations

1. **The spec's three frames are stale** and do not show the feature. Built to the DS5 frames
   instead (above). Reported rather than silently reinterpreted.
2. **`apps/mobile/src/screens/auth/SignInScreen.tsx` is outside `files_owned`.** The spec assigns
   "footer links only" to `apps/mobile/src/screens/AuthScreen.tsx`, but that file is a pure mode
   router with no UI; the sign-in markup, including the "Need help?" link the frame puts the footer
   under, is in `SignInScreen.tsx`. Putting the footer in `AuthScreen.tsx` would render it outside
   the sheet's `ScrollView`, underneath a `flex: 1` sheet with `marginTop: -24` — reproducing
   exactly the painted-over tap target BT3's review caught. Declared as a scope extension.
3. **No DS5 frame exists for the trainer More screen,** and `51-trainer-mobile-more-ios.png` predates
   the feature. The trainer rows therefore take their labels, order and destinations from
   `ds5-ios-more-legal.png` and their presentation from the trainer screen's own existing component
   (`PrimaryButton`), which is what that screen already uses for every other row. Flagged for Firoz.
4. **Two things named "Privacy" on the trainee More screen** — the in-app "Privacy · What your coach
   can see" row and the new "Privacy policy" row. `ds5-ios-more-legal.png` shows exactly this, with
   the two in separate groups under a LEGAL heading, so the locked frame settles it. A test pins that
   the in-app row keeps its hint and does not open a URL.
