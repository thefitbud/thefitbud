# Z12-40 QA: moving between days

- **Expo-web check** (before the device runs): `web/`. The before and after timing table is in `web/README.md`.
- **Review fixes, run 44098030020** (`flows=launch,z12-40`, app head `e4d67bf`; the job logs read `app: e4d67bfcab7b…`). The day swipe is now a native react-native-gesture-handler pan around each tab's whole screen.
  - Android: **PASS**, 3 of 3 flows in light and in dark, device log clean.
  - iOS: the launch flows passed in both themes, and the z12-40 flow passed **Today and Diet** in both themes: 7 swipes ahead and back, yesterday, and on Diet a swipe on the meal rows plus three swipes on the area under the list (84%), all moving the day with no "Loading meals…" (`flows/z12-40-diet-tomorrow-*-ios.png`). The blocking iOS Diet swipe is fixed. The flow then failed in Workout on `assertVisible "Start workout"` in both themes. The screen shows the button (`flows/ios-workout-start-hidden-from-maestro-light-ios.png`), but on iOS it sits inside the hero's accessible Pressable ("Lower body A, workout details"), which hides it from Maestro. The flow's earlier `assertNotVisible "Start workout"` therefore proved nothing on iOS. The flow now reads the Workout swipe's day from Today's eyebrow (the day state is shared); that version has not run yet (one device run per fix round). iOS device log clean.
  - TR-06a, TR-07a and W-01a shots (both platforms, both themes) and the `flows/z12-40-*` shots come from this run. W-01a on iOS is captured for the first time.
- **Earlier device gate:** `device.yml` (workflow ref `main`), `flows=launch,z12-39,z12-40`. The flows are `device/launch/*`, `device/z12-40/1-day-moves.yaml` (this task) and `flows/v3/F29-future-days.yaml` (TR-06c, TR-06d, TR-07k, W-01e).
  - **Run 44080890973** on app head `524be9f` (the job logs read `app: 524be9f1…`). Android: **PASS**, 4 of 4 flows in light and in dark, device log clean. iOS: FAIL. Three of the four iOS failures are the known keystroke drop at sign-in: the email field read `av.ontrack@…` and the screen said "That mobile number or email and password don't match" (launch, light; z12-40, dark). The fourth is real: in light, the swipe on **Diet** did not move the day (`flows/ios-diet-swipe-not-registered-light-ios.png`). F29 passed on iOS in both themes. The Today part of the z12-40 flow passed on iOS: seven swipes ahead, seven back with no skeleton on any revisit, and yesterday. iOS device log clean (0 allowed).
  - Run 44073717375, an earlier head (`c7a9b61`): Android light PASS, Android dark "Unknown error" on 3 flows (emulator flake). On iOS, one Today revisit showed the skeleton in light and the Diet swipe failed the same way in dark. The fix in `524be9f` prefetches one day at a time and keeps a claimed swipe from the scroll view. TR-06a and TR-07a dark iOS shots come from this run; the visual code did not change between the two heads.
- **Screenshots:** `<screen ID>-<theme>-<platform>.png` from run 44080890973. Swipe evidence is in `flows/`: `z12-40-today-plus-7-*` (seven days ahead), `z12-40-today-yesterday-*` (a swipe right from today), `z12-40-diet-tomorrow-*` (Android).
- **Parity:** this task's 14 rows in `docs/qa/W12/parity.md`.

## Screen → control → result

| Screen | Control | Result |
|---|---|---|
| TR-06a/c/d | Day in the strip (tap) | Android, iOS: moves to that day; header eyebrow "… · past day" / "… · planned"; no skeleton on a cached day |
| TR-06a/c/d | Swipe left / right on the body | Android, iOS: next / previous day; 7 ahead and 7 back with no skeleton on any revisit |
| TR-06a/c/d | ‹ › week chevrons | F29: next / previous week (iOS, Android) |
| TR-06d | "Today" pill (today in another week) | F29: back to today |
| TR-06c | Past-day banner | Statement only: lock icon, "Past days are read-only." plus the late-log sentence while a meal can still be logged late |
| TR-06a | Sync and bell buttons | Unchanged (launch flow) |
| TR-07a/k | Day in the strip, swipe on the screen | Android, iOS (run 44098030020): swipe on the rows and under the list moves the day and is cached (no "Loading meals…"); tapping a day works (F29) |
| W-01a/e | Swipe on the screen | Android: moves the shared day, no "Loading workouts…". iOS: run 44098030020 swiped but its check could not see "Start workout" (see above); the fixed check has not run |
| W-01a/e | Week strip day (tap) | Unchanged v2 strip; it now sets the shared day |

## For the device checklist (Z12-58, only a real phone can prove)

- Swipe through 7 days and back on Today, Diet and Workout on a real iPhone and Android phone. Watch for any spinner on a day already seen. The iOS Workout swipe needs a check on a phone (the simulator check of it has not run, see above).
- Dropped frames while swiping, against each platform's "janky" threshold (Android GPU rendering profile, iOS Instruments). Simulators cannot measure this.
- The scroll offset holds when moving to a day at least as tall. A shorter day clamps it.
