# QA-BT3d · Trainer More follows frame 51 with a DS5 Legal group

Spec `docs/specs/BT3d.md` · decision D-W3-14 · governing frame `ds5-ios-trainer-more-legal.png` (with `51-trainer-mobile-more-ios.png` and `ds5-ios-more-legal.png`).

Harness: API on a spare port (demo seed), `expo start --web` with `EXPO_PUBLIC_API_BASE_URL` pointing at it, Playwright Chromium 393x852 at 2x. Fonts fall back (Satoshi is blocked), so judge layout, not letterforms.

| File | State | Result |
|---|---|---|
| `trainer-more-top-ios-393x852.png` | Trainer only (`rahul.coach@demo.fitbud.test`), top | matches, see deviations |
| `trainer-more-bottom-ios-393x852.png` | Trainer only, scrolled to the bottom: no Switch group | matches |
| `dual-more-top-ios-393x852.png` | Dual role (`karan.dual@demo.fitbud.test`), top | matches |
| `dual-more-bottom-ios-393x852.png` | Dual role, bottom: Switch to client view in its own group above LEGAL | matches |

Order: profile card, SETTINGS (Notifications, Profile, Open FitBud on web), Switch to client view (dual only), LEGAL (Privacy policy, Terms of use, Credits and licences, open-in-browser icon, "Opens app.thefitbud.com/..." subtitles), Email FitBud support + Sign out. Rows are the trainee M2 components.

## Deviations from the frame (stated, not hidden)
1. **Open FitBud on web**: the frame shows a copy icon and "Copies the link for your laptop". The app has no clipboard module and adding one means a dependency change outside `files_owned`. The row opens the link (as since X7), so it reads "Opens in your browser" with the open-in-browser icon rather than a copy icon it would not honour. Needs a decision plus `expo-clipboard`.
2. **Notifications permission card** (not in the frame, kept per spec) sits directly under the profile card, as in frame 51. Its state here is "Off" because web has no push permission.
3. Frame 51's "Steps · Coming soon" row and the "Categories and quiet hours" hint are dropped; Notifications has no hint, as in the governing frame.
4. The screen keeps the "More" page title and FITBUD eyebrow from `Screen`; the frame is a scrolled crop.
