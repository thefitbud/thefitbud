---
id: AB2
title: Fix Android crash: invalid accessibilityRole values
batch: W3
depends_on: [AB1]
lane: build
files_owned:
  - apps/mobile/src/components/Screen.tsx  # line 68, the only invalid role on main
  - apps/mobile/src/components/accessibilityRole.test.ts  # new guard test
frames: []
model: sonnet
size: S
---

## Outcome
The Android development build no longer crashes when any screen built on the shared `Screen` component mounts. The first one Firoz reaches is the sign-in "Use code instead" (email OTP) screen. On web, that container still renders as a `<main>` landmark. A guard test fails CI if any native `accessibilityRole` value is outside the set React Native 0.76 accepts on Android.

## Context
- **Symptom** (Android dev build from `main`, Expo SDK 52, `react-native` 0.76.9, pointed at `api-staging`, 2 Nov 2026): tapping "Use code instead" on sign-in shows a red screen: `Error while updating property 'accessibilityRole' of a view managed by: RCTView null Invalid accessibility role value: main`. The stack runs `ViewManagersPropertyCache.updateViewProp` → `ViewManager.createView` → `UIViewOperationQueue.flushPendingBatches`.
- **Root cause.** `apps/mobile/src/components/Screen.tsx:68` passes `accessibilityRole={"main" as "summary"}` to a `View`. The cast hides the value from TypeScript, and the comment at `:67` assumes Expo web will map it to `<main>`. On Android, `BaseViewManager.java:327` calls `ReactAccessibilityDelegate.AccessibilityRole.fromValue(...)`. That enum (`ReactAccessibilityDelegate.java:186`) holds the 39 TalkBack roles only: none, button, dropdownlist, togglebutton, link, search, image, imagebutton, keyboardkey, text, adjustable, summary, header, alert, checkbox, combobox, menu, menubar, menuitem, progressbar, radio, radiogroup, scrollbar, spinbutton, switch, tab, tablist, timer, list, grid, pager, scrollview, horizontalscrollview, viewgroup, webview, drawerlayout, slidingdrawer, iconmenu, toolbar. For any other string, `fromValue` **throws** `IllegalArgumentException("Invalid accessibility role value: " + value)` (`ReactAccessibilityDelegate.java:307`). Web/ARIA landmarks (`main`, `navigation`, `region`, `banner`, `contentinfo`, `complementary`, `form`, `article`, `dialog`, `status` and the like) are not in the set, so creating the view fails.
- **iOS does not crash.** `React/Views/RCTViewManager.m:70` maps `@"main"` to `UIAccessibilityTraitNone`, so the bug is Android-only. That is why it went unnoticed. iOS builds have been on hold since 1 Nov, and AB1 only just made the Android build compile.
- **Why it shows on "Use code instead" and not earlier.** `SignInScreen.tsx` draws its own hero and does not use `Screen`. `AuthScreen.tsx:179` swaps in `CodeSignInScreen`, which renders `<Screen` at `apps/mobile/src/screens/auth/CodeSignInScreen.tsx:61`. Import chain: `AuthScreen.tsx` → `screens/auth/CodeSignInScreen.tsx:9` (`import { Screen } from "../../components/Screen"`) → `components/Screen.tsx:66-68`. Staging and the API are not involved: the crash happens while the view is created, before any request is sent.
- **Introduced** in e145572 ("fix(MA): typecheck fixes", 19 Oct 2026), which added the cast.
- **Audit of `main` at 19d65e0** (`rg` over `apps/mobile/src` and `packages/*/src`, including `packages/ui-mobile`): 242 `accessibilityRole` usages, with the values button 177, header 39, summary 4, text 4, tab 4, radio 4, tablist 3, switch 2, alert 1, checkbox 1, progressbar 1, main 1, plus one expression `tappable ? "button" : "text"` (`trainer/ClientsTab.tsx:252`). **`main` is the only invalid value.** There are no JSX `role=` props anywhere in mobile or the shared UI packages. Every `role:` hit is a domain user role such as `"trainee"`. The web-only chrome (`apps/mobile/src/trainee/web/WebTraineeChrome.tsx`) uses only `button`.
- **Screens at risk.** Every screen that renders `Screen` crashes the same way on Android as soon as it mounts. That includes every trainee and trainer tab after sign-in, so **the Android app cannot be used past the OTP step until this lands**:
  - `apps/mobile/src/screens/RoleSelectScreen.tsx`
  - `apps/mobile/src/screens/UnsupportedRoleScreen.tsx`
  - `apps/mobile/src/screens/auth/CodeSignInScreen.tsx`
  - `apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx`
  - `apps/mobile/src/trainee/ActiveWorkoutScreen.tsx`
  - `apps/mobile/src/trainee/CheckinScreen.tsx`
  - `apps/mobile/src/trainee/DietTab.tsx`
  - `apps/mobile/src/trainee/FoodSearchScreen.tsx`
  - `apps/mobile/src/trainee/MealDeviationScreen.tsx`
  - `apps/mobile/src/trainee/NotificationsScreen.tsx`
  - `apps/mobile/src/trainee/ProgressTab.tsx`
  - `apps/mobile/src/trainee/SomethingDifferentSheet.tsx`
  - `apps/mobile/src/trainee/TodayTab.tsx`
  - `apps/mobile/src/trainee/WorkoutOverviewScreen.tsx`
  - `apps/mobile/src/trainee/WorkoutSummaryScreen.tsx`
  - `apps/mobile/src/trainee/WorkoutTab.tsx`
  - `apps/mobile/src/trainee/settings/PasswordScreen.tsx`
  - `apps/mobile/src/trainee/settings/PrivacyScreen.tsx`
  - `apps/mobile/src/trainee/settings/ProfileScreen.tsx`
  - `apps/mobile/src/trainee/setup/OemBatterySheet.tsx`
  - `apps/mobile/src/trainer/ActivityFeedScreen.tsx`
  - `apps/mobile/src/trainer/AttentionTab.tsx`
  - `apps/mobile/src/trainer/CheckinReviewScreen.tsx`
  - `apps/mobile/src/trainer/CheckinsTab.tsx`
  - `apps/mobile/src/trainer/ClientStatusScreen.tsx`
  - `apps/mobile/src/trainer/ClientsTab.tsx`
  - `apps/mobile/src/trainer/ExceptionReviewScreen.tsx`
  - `apps/mobile/src/trainer/MoreScreen.tsx`
  - `apps/mobile/src/trainer/TrainerNotificationSettingsScreen.tsx`
  - `apps/mobile/src/trainer/TrainerProfileScreen.tsx`
- **Proposed fix.** Replace `accessibilityRole={"main" as "summary"}` with `role="main"` and delete the cast. In RN 0.76, `role` is typed to include `'main'` (`Libraries/Components/View/ViewAccessibility.d.ts:367`). On Android it goes through `Role.fromValue` (`ReactAccessibilityDelegate.java:170`), which includes `MAIN` and returns `null` for unknown values instead of throwing. react-native-web renders `role="main"` as `<main>`. Allowed alternative if the implementer finds web drops `role`: `accessibilityRole={Platform.OS === "web" ? ("main" as never) : undefined}`. Do not map it to `summary`, because that changes what TalkBack announces for the whole screen.
- No dependency change, no native code, no lockfile change.

## Gap list
- `apps/mobile/src/components/Screen.tsx:68`: the web-only role `main` is passed as `accessibilityRole`, and Android throws on it.
- Nothing stops the next web-only role from landing. The `as` cast defeats the type check, and no lint rule or test covers the value.

## Acceptance criteria
- [ ] `Screen.tsx` no longer passes any value outside the Android `AccessibilityRole` set as `accessibilityRole`, and no `as` cast remains on a role prop.
- [ ] Web is unchanged: `pnpm --filter @fitbud/mobile` web export (or the web e2e) still renders the `Screen` body as a `<main>` element. Show the DOM snippet in the PR.
- [ ] New `apps/mobile/src/components/accessibilityRole.test.ts` (vitest) scans `apps/mobile/src/**/*.tsx` and `packages/ui-mobile/src/**/*.tsx` for literal `accessibilityRole` values, including those inside conditional expressions and `as` casts. It fails on any value outside the 39-value list above. It must fail on `main` @ 19d65e0. Show the red run, then the green run, in the PR.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and the trainer-web build pass.
- [ ] **Device check (Firoz, Android dev build, staging):** sign-in → "Use code instead" renders, an OTP can be requested, and after sign-in the trainee Today, Workout, Diet and Progress tabs and the trainer Attention, Clients, Check-ins and More tabs all render with no red screen. TalkBack still reads the screen title as a heading. Not claimed by the implementer.

## Out of scope
- Changing any other role value, or adding roles for better semantics. The audit found only one invalid value.
- iOS builds (on hold). Any native module, config plugin or dependency change.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `accessibilityRole.test.ts` as above. Keep the allowed list as a literal in the test, with a comment pointing at `ReactAccessibilityDelegate.java` `enum AccessibilityRole` for RN 0.76. Optionally, a second case reads the enum from `node_modules` when present and asserts the literal matches, so an RN bump that changes the set fails loudly.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, the web build.

## Visual check
- No visual change intended. The PR includes the web DOM snippet showing `<main>`. The Android render is checked on Firoz's device.

## Stop conditions
- react-native-web 0.19 does not render `role="main"` as `<main>` and the `Platform` fallback cannot keep it without a file outside `files_owned`.
- The guard test finds another invalid value in a file outside `files_owned`. Report it; do not fix it.
- The fix needs a dependency or native change, or an Expo or RN upgrade.
- A file outside `files_owned` must change.
- The task would need a remote command (`eas build`, `wrangler deploy`, …), a secret or production data.
