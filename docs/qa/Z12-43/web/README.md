# Z12-43 Expo-web check (D-W12-34 (2))

**Harness.** Local demo-seeded API + `expo start --web` (see `docs/qa/Z12-43/capture.mjs`). Playwright Chromium at 393×852, 2×, `colorScheme` light and dark. Signed in as `aarav.ontrack@demo.fitbud.test`. Expo web proves copy, structure and values, not native layout (system keyboard, safe areas, native sheets).

**Re-run:** `EXPO_WEB_URL=http://127.0.0.1:8098 node docs/qa/Z12-43/capture.mjs`

## Grades vs v3 mocks (never a pixel match)

| Screen | Light | Dark | What differs and why |
|---|---|---|---|
| TR-08a | CLOSE | CLOSE | Menu order Changed the portion → Log it myself → Ate out with mock subtitles; "Ask {coach} about this meal". Sheet uses overlay host theme. |
| TR-08b | CLOSE | CLOSE | ½ steps, Reset to plan, Total ±N vs plan, Save portion. Unit under stepper is serving label without leading "1 ". System steppers, not kit. |
| TR-08c | CLOSE | CLOSE | Exact kcal + plan kcal + optional note. System number keyboard (not kit keypad). |
| TR-26a | CLOSE | CLOSE | Cancel/Save header, From your plan, search placeholder, Save disabled until a food is added. Recently logged may be empty on a fresh seed. |
| TR-26b | CLOSE | CLOSE | Instant +, ✓ / "N added", tray "In this log · N", Save {meal}. Tray chips scroll sideways. Added toast may omit leading check. |
| TR-26c | CLOSE | CLOSE | Units from the food's servings + Grams; ½-step amount; ring. Meal row static (tap map LATER). No description under name (no backend source). |
| TR-26d | CLOSE | CLOSE | No foods match; Create "{query}"; Log as Ate out. |
| TR-26e | CLOSE | CLOSE | Name/amount/kcal required; macros optional; Save to my foods on; "{coach} sees this as a food you added." System keyboard; amount unit "piece". Caption not in mock (recorded departure). |
| TR-26f | CLOSE | CLOSE | "Logged myself · …" row with tick + kcal; ring updates; toast "{Meal} saved · {kcal} kcal" with View. Dinner window may show seed-adjusted time in the capture harness. |

Device-native grades stay `pending` until `device.yml` runs with `flows=launch,z12-43` (Cursor token cannot dispatch; see W12-cursor follow-ups).
