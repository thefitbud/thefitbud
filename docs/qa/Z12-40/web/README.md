# Z12-40 Expo-web check (before the device run, D-W12-34)

**Harness.** API on 127.0.0.1:8796 against this worktree's local D1 (`pnpm db:reset`, Tue 17 Nov 2026). `expo start --web` on 8096 with `EXPO_PUBLIC_API_BASE_URL` pointing at it. Playwright Chromium at 393×852, 2×, `colorScheme` light and dark. Signed in as `aarav.ontrack@demo.fitbud.test` (Asia/Kolkata). Today is Tue 17 Nov: past day Mon 16, future days Wed 18 (rest day) and Thu 19 (Upper B).

On web the date strip is the web heading (`WebTraineeChrome`); the native v3 strip (`DateNavigator`, coral ring on today, ink ring on the selected day) shows only on iOS and Android, so the strip is judged on the device shots. Expo web proves copy, structure, values and timing.

## Time to content and spinner flashes (spec gap list)

Each move taps a day in the strip and waits 2.5 s. A "flash" is the loading text (`Loading your day…` on Today, `Loading meals…` on Diet) appearing at all. Time to content is from the tap to the last loading text going away, or to the first frame after the tap when nothing loaded. Every API call was delayed 400 ms by Playwright, a phone-like round trip. The numbers include about 40–60 ms of Playwright round trip around the tap.

| Tab | Move | Before (main 27d68c65) | After (this PR) |
|---|---|---|---|
| Today | Mon 16 (first visit) | 1 flash, 626 ms | 0 flashes, 62 ms |
| Today | Wed 18 (first visit) | 1 flash, 614 ms | 0, 64 ms |
| Today | Thu 19 (first visit) | 1 flash, 588 ms | 0, 83 ms |
| Today | Fri 20 (first visit) | 1 flash, 575 ms | 0, 101 ms |
| Today | Wed 18 (revisit) | 1 flash, 590 ms | 0, 59 ms |
| Today | Mon 16 (revisit) | 1 flash, 607 ms | 0, 68 ms |
| Today | Tue 17, today (revisit) | 1 flash, 629 ms | 0, 71 ms |
| Diet | Mon 16 (first visit) | 1 flash, 514 ms | 0, 58 ms |
| Diet | Wed 18 (first visit) | 1 flash, 503 ms | 0, 89 ms |
| Diet | Thu 19 (first visit) | 1 flash, 505 ms | 0, 62 ms |
| Diet | Fri 20 (first visit) | 1 flash, 517 ms | 0, 60 ms |
| Diet | Wed 18 (revisit) | 1 flash, 527 ms | 0, 47 ms |
| Diet | Mon 16 (revisit) | 1 flash, 509 ms | 0, 74 ms |
| Diet | Tue 17, today (revisit) | 1 flash, 512 ms | 0, 67 ms |

Before: 14 of 14 moves flashed the loading state, and a revisit was as slow as a first visit. After: 0 of 14. "First visit" days were within ±3 of a day already on screen, so they were prefetched. Without the delay (local API, about 100 ms per call) the before run was 86–240 ms with a flash on every move.

The Workout tab already cached by week before this task, so a day inside the week was instant. It now follows the shared day and prefetches the weeks either side.

## Swipe and scroll (light, touch events through CDP)

| Tab | Start | Swipe left (next day) | Swipe right (back) |
|---|---|---|---|
| Today | Tue 17, scrolled 260 px | Wed 18 · planned, scroll 332 px | Tue 17, scroll 260 px |
| Diet | Tue 17, scrolled 124 px | Wed 18 · planned, scroll 0 | Tue 17, scroll 0 |

The scroll view stays mounted and nothing collapses into a skeleton, so the offset holds. On web, Chrome's scroll anchoring moved Today's offset by the height of the future-day banner and kept the same content in view. Diet's Wed 18 is shorter than the screen, so its offset is 0 there, and coming back to Tue 17 stays at 0. See the PR's decision on per-day offsets.

## Header copy

| Shot | Eyebrow read from the page |
|---|---|
| TR-06a | Tuesday, 17 Nov |
| TR-06c | Monday, 16 Nov · past day |
| TR-06d | Wednesday, 18 Nov · planned |
| TR-07a | Tuesday, 17 Nov · Rahul’s plan |
| TR-07k | Wednesday, 18 Nov · planned |

TR-06c banner: "Past days are read-only." (Mon 16 is fully logged, so there is no missed meal to log late. The longer copy is covered by `TodayTab.v3.test.tsx`.)

## Grades against the v3 mocks (never a pixel match)

| Screen | Light | Dark | What differs and why |
|---|---|---|---|
| TR-06a | CLOSE | GAP | Header eyebrow and "Today" title match. The summary card and hero are v2 (Today v3 is Z12-46). Dark renders light: the tab is not opted in yet (decision 2). |
| TR-06c | CLOSE | GAP | Eyebrow "· past day", title "Today", lock banner on the neutral fill match. The cards below are v2 (Z12-46). |
| TR-06d | CLOSE | GAP | Eyebrow "· planned" matches; the banner is Z12-39's. Cards v2 (Z12-46). |
| TR-07a | CLOSE | GAP | Eyebrow "· Rahul’s plan" over "Diet" matches. Summary and rows v2 (Diet v3 is Z12-42). |
| TR-07k | CLOSE | GAP | Eyebrow "· planned" matches; banner and planned rows are Z12-39's. |
| W-01a, W-01e | GAP | GAP | Workout keeps its own week strip and v2 hero until the Workout v3 rework (Z12-44); here it only follows the shared day and the swipe. |

Console: the same web-only React DOM warnings and the realtime WebSocket line that Z12-39 recorded (they come before this task).
