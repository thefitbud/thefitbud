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

### The two More screens — captured by the reviewer, and the harness note corrected

**Correction.** The first version of this document said Expo-web sign-in "issues **no HTTP
request at all**" and concluded the two More screens could not be captured in this container.
**That was wrong**, and the fresh reviewer refuted it by signing in and capturing both screens.

What was actually happening: on web the client hard-codes its base URL as
`${window.location.origin}/__fitbud_api` (`apps/mobile/src/lib/api.ts:102`), so the sign-in POST
goes to the **Expo dev server's own origin** — `POST /__fitbud_api/auth/login` — and was missed
by a filter looking for traffic to the API port. `EXPO_PUBLIC_API_BASE_URL` is **not** read by
the client on web at all; it is read by `apps/mobile/metro.config.js:6` as the *proxy target* for
Metro's `/__fitbud_api` middleware.

**So the recipe for any mobile visual check in this container is:** start the API, then start
Expo with `EXPO_PUBLIC_API_BASE_URL` pointing at it, so Metro's `/__fitbud_api` proxy resolves.
Sign-in then works and every authenticated screen is reachable. The suggested follow-up "QA1"
rested on the false premise and is withdrawn.

**What the reviewer observed**, signed in as both personas against a seeded API:

- **Trainee More** (`rohan.slipping@demo.fitbud.test`): `LEGAL` heading, the three rows with the
  correct icons, hints and external-link glyphs, sitting between the Privacy group and
  Help/Sign out — **matches `ds5-ios-more-legal.png`**. Rows measure 359x56; all three opened
  `https://app.thefitbud.com/privacy|/terms|/credits` with `window.open` stubbed.
- **Trainer More**: the three entries render as secondary buttons after Help. There is **no DS5
  frame for the trainer More screen**, and that screen already diverges wholesale from
  `51-trainer-mobile-more-ios.png` (pre-existing) — the frame question is **BT3d**.

Those captures were taken in a worktree that has since been removed, so they are not in this
directory. Re-running the recipe above reproduces them.

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
