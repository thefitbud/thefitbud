# Z12-39 Expo-web screenshot check

These are the cheap checks run before the device run (D-W12-34). They are not the device gate; the device shots go in `docs/qa/Z12-39/` once the scoped run has passed.

**Harness.** The API ran on 127.0.0.1:8790 against this worktree's own local D1, seeded by `pnpm db:reset` on Sun 15 Nov 2026. `expo start --web` ran on 8091 with `EXPO_PUBLIC_API_BASE_URL` pointing at the API. Playwright Chromium captured at 393×852, 2×, in `colorScheme` light and dark. Every shot is signed in as `aarav.ontrack@demo.fitbud.test` (Asia/Kolkata). Today is Sun 15 Nov, so the future day is Mon 16 Nov and the past day is Sat 14 Nov.

On web, the date strip is the web heading (`WebTraineeChrome`) with Previous day and Next day arrows. The native app shows the swipe strip there instead, so judge the content under the strip, not the strip itself.

## What the capture asserted (both themes)

| Check | Result |
|---|---|
| Today, Mon 16: Start workout, Eaten as planned or Something different visible | 0 |
| Today, Mon 16: Preview exercises shown (the day has a workout) | 1 |
| Planned meal sheet: Eaten as planned or Something different | 0 |
| Diet, Mon 16: Eaten as planned or Something different | 0 |
| Workout, Mon 16: Start workout | 0 |
| Workout, Mon 16: "Opens on …" | 1 |

The console showed only web-only React DOM warnings that predate this task (`accessibilityElementsHidden` / `importantForAccessibility` on a DOM node, and one nested `<button>`), plus the realtime WebSocket, which the Metro proxy does not upgrade.

## Grades against the v3 mocks (never a pixel match)

| Screen | Light | Dark | What differs and why |
|---|---|---|---|
| TR-06d | CLOSE | GAP | The banner copy, the workout preview card ("Mon 16 · 7:00 am", Preview exercises) and the meal rows with no log action all match. Two differences: the day summary card (rings, Workout/Meals/Steps chips) still shows, and the header and meal rows are v2. Both are the Today v3 rework (Z12-46). Dark renders light because Today is not opted in to v3 dark yet (Z12-46). |
| TR-07k | CLOSE | GAP | The banner copy ("Opens on Mon 16 Nov. You can see Rahul’s plan now and log it on the day.") and the planned rows (kcal plus "planned", no actions) match, and a row opens the read-only planned meal. The summary card layout and the header eyebrow are v2 (Diet v3, Z12-42). Dark: not opted in (Z12-42). |
| W-01e | GAP | GAP | Behaviour matches: "Opens on Mon 16 Nov" takes the place of Start workout, and there is no "Not today". Layout does not: the tab still draws the navy hero with the exercises listed below it, where W-01e draws a white day card with the exercises inside. That is the Workout tab v3 rework (Z12-44). Dark: not opted in (Z12-44). |
| TR-06c | — | — | Past day, not changed by Z12-39. The shot shows late logging untouched. Grading belongs to Z12-46. |
| TR-07f | — | — | Past day, not changed by Z12-39. Grading belongs to Z12-42. |
| planned meal (TR-07j without actions) | CLOSE | GAP | Matches the TR-07j layout: title, "Planned for 8:00 am · 461 kcal", food rows with kcal, the macro line "from Rahul’s plan", and Close. It has no Eaten as planned or Something different, by D-W12-7. It takes the host screen's theme. |
