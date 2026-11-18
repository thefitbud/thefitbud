# Z12-43 Expo-web check (D-W12-34 (2))

Shots: `docs/qa/Z12-43/web/<screen ID>-<theme>-web.png`. Script: `docs/qa/Z12-43/capture.mjs`. Device captures (iOS simulator, Android emulator) are still pending: they need `device.yml` with `flows=launch,z12-43`, which the Cursor token cannot dispatch (see `docs/specs/batches/W12-cursor.md`).

## Harness

- Local demo-seeded API (`pnpm db:reset`, `wrangler dev` on 8798) behind Metro's `/__fitbud_api` proxy, `expo start --web` on 8098 with `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8798`.
- Playwright Chromium, 393x852, device scale factor 2, `colorScheme` light and dark. One fresh browser context per shot, signed in as `aarav.ontrack@demo.fitbud.test` (Asia/Kolkata).
- Re-run, from the repo root: `EXPO_WEB_URL=http://127.0.0.1:8098 node docs/qa/Z12-43/capture.mjs [shot ...]`.
- Expo web proves copy, structure and values, not native layout. The system keyboard, safe areas, the floating tab bar and native sheets are not shown; that is device-gate evidence.

### What the harness changes

| Shot | Change | Why |
|---|---|---|
| All except TR-26f | Playwright fake clock at 8:30 pm IST on the seeded day (`page.clock.install`) | The seed's Dinner window opens at 8:00 pm IST; at capture time (about 6 pm IST) Dinner is not open, so Diet offers no "Something different". Nothing is saved in these shots, so the server clock does not matter. |
| TR-26f | Real clock. `pnpm db:reseed`, then Dinner's `window_starts_at` set to 12:00 UTC the same day in the local D1; reseeded again afterwards | This shot really saves a meal. The API refuses a log stamped before the window opens, or more than 5 minutes ahead of its own clock (`log-time-bounds.ts`), so a fake client clock cannot save. The Dinner row therefore reads "5:30 pm" instead of "8:00 pm". Real `POST /meals/assignments/:id/deviate`, real refetch; the toast, row, ring and totals are the app's. |
| TR-26d | `context.setOffline(true)` after the search screen opens | The mock is the offline variant. The offline banner and the plan-only search are the app's. |
| TR-08b, TR-08c | CSS rule `[data-testid="something-different-subscreen"] { flex: 0 0 auto; height: 520px }` | Web-only layout collapse, see the finding below. The `-raw` shots are the same screens without the rule. |

No API response is stubbed. Aarav has no recent foods on the seed, so TR-26a has no "Recently logged" block.

## Finding 1: sub-screens collapse on web (TR-08b, TR-08c)

`SomethingDifferentSheet` gives its sub-screens `{ flex: 0, height }` inside `BottomSheet`'s flexGrow:0 ScrollView (Z11b-5). React Native's Yoga reads `flex: 0` as "no flex", so the height applies. react-native-web writes CSS `flex: 0`, which is `0 1 0%`; that flex-basis wins over `height`, so the sub-screen is 0 px tall and the portion rows and the Ate out fields are not drawn (`TR-08b-raw-*`, `TR-08c-raw-*`). This is Expo-web only as far as this check can tell; the device gate must confirm the native layout. A `flexGrow: 0, flexShrink: 0` pair in place of `flex: 0` would cover both engines (not changed here: this task only produces captures).

## Finding 2: the Something different sheet renders light in dark (TR-08a, TR-08b, TR-08c dark)

In dark the sheet keeps the light card with dark text over a dark scrim. The TR-26 screens and the Diet tab follow the system theme; the sheet is hosted by `TraineeOverlay`'s sheet presentation, outside the Diet tab's `ThemeScope scheme="system"`, so it never gets the dark tokens. Expected fix: wrap the sheet host in `ThemeScope scheme="system"` (Z12-58 also checks that every screen is opted in). Native behaviour is unverified; on iOS the app is still pinned to light until Z12-57.

## Grades vs v3 mocks

MATCH, CLOSE or GAP against `docs/design/v3/png/` (light) and `png-dark/` (dark). Never a pixel claim.

| Screen | Light | Dark | What differs and why |
|---|---|---|---|
| TR-08a | CLOSE | GAP | Light: "Changed the portion" icon is sliders (mock: scales); no home indicator; the sheet sits over Dinner's day, not the mock's. Dark: finding 2. |
| TR-08b | CLOSE (harness CSS) | GAP | Rows, steps of ½, Reset to plan, Total with "+97 vs plan", Save portion; unit label under the stepper is not truncated ("medium chapati (40 g)"). Needs the harness rule (finding 1). Dark: finding 2 as well. |
| TR-08c | CLOSE (harness CSS) | GAP | kcal and note typed in; "Rahul's plan for dinner: 664 kcal"; system number keyboard not shown on web. Needs the harness rule (finding 1). Dark: finding 2 as well. |
| TR-26a | CLOSE | CLOSE | From your plan, hint, Save disabled. No "Recently logged" block: no recent foods for Aarav on the seed. |
| TR-26b | CLOSE | CLOSE | Chapati / roti added twice: tick and "2 added", tray "In this log · 1" with "Chapati / roti × 2" and "Save dinner", toast with Undo. The search ranks rotisserie chicken first, so the mock's result order differs. The toast wraps to three lines at this width. |
| TR-26c | CLOSE | CLOSE | Kala chana curry from the plan list: units from the food's servings plus Grams, ½-step amount, quick amounts, ring with P/C/F, "Add to dinner · 211 kcal". No description line under the name (no backend source); the Meal row has no chevron (picker is LATER). |
| TR-26d | CLOSE | CLOSE | Offline banner, "No foods match", Create "Ragi dosa", Log as Ate out. Web draws a focus outline on the search input. |
| TR-26e | CLOSE | CLOSE | Name, amount and kcal required; macros optional; "Save to my foods" on; "Rahul sees this as a food you added." (caption not in the mock, recorded departure). Web draws a focus outline on the focused input; system keyboard not shown. |
| TR-26f | CLOSE | CLOSE | After a real save: Dinner reads "Logged myself · …" with tick and 81 kcal, ring and macros updated, toast "Dinner saved · 81 kcal" with View. Row shows a Change button; web tab bar, not the floating pill; Dinner time reads 5:30 pm (harness, see above). |

## Not captured

Nothing in the requested list is missing. Not covered by this check (device gate): the system keyboards on TR-26e and TR-08c, the tab bar and safe areas, native sheet behaviour, haptics and the optimistic-add timing on a real device.
