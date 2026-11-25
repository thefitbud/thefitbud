# Z14-46 visual check

Frame: `docs/design/v3/png/trainee/TR-03-intake-form.png`.

## How these were captured

Not on a device. The mobile app was exported with `expo export --platform web` (react-native-web) and driven with Playwright (Chromium, device scale 2) against the local API on the demo seed (`pnpm db:reset`), signed in as `vikram.onboarding@demo.fitbud.test`. Viewports: iOS 393x852 (`ios-*`) and Android 412x915 (`android-*`), `light` and `dark` colour schemes.

Files: `<os>-<scheme>-step1`, `-step2-last`, `-close-sheet`, `-loading`, `-load-error`.

## What the captures show

- The seeded default form has 5 questions, so it is 2 steps: Goals, Relevant history, Preferences / Schedule, Limitations (D-W14-45, D-W14-48). The frame shows a typed 5-step form; those typed controls (choice cards, kg input, yes/no) were not reachable on this seed, they render through the unchanged control code and are covered by the existing tests.
- Header: close button, "Getting to know you", "Step n of N", one progress bar. Footer: Back + Continue, last step Submit intake, "Answers saved" only after a successful save (D-W14-47, so not "on your phone").
- Loading is the app's spinner; a load error shows the friendly banner with Try again and the close button still present.

## Limits

- The captures were taken before a final 4 to 8 px top padding tweak under the header (so the load-error and error banners do not touch the progress bar). A re-run was blocked by the login rate limit on the local API. Layout is otherwise as committed.
- Web rendering, not iOS or Android native: fonts, safe-area insets, the status bar and the native sheet animation differ. Device run (spec): the steps on iOS and Android, Android hardware back on step 1 (opens the sheet), Sign out from the sheet.
