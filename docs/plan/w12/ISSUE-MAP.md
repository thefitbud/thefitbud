# W12 issue map: each device finding → its task

FitBud UI, 14 Nov 2026 (IST). The tasks are in `docs/plan/w12/W12-PROMPT.md`. "Mocks" are the v3 screen IDs a task must match. Main was checked at `6ed1410e` (#433).

## Open findings (15)

| # | Finding (source) | Task | Mocks | Evidence on main |
|---|---|---|---|---|
| 1 | Lock-screen notification and Live Activity tiles are cut off and incomplete; taps do nothing (Firoz, 14 Nov) | **Z12-48** (Live Activity, Swift in Z12-57); Z12-47 (push taps) | TR-15d, TR-15c, TM-13a | `FitBudLiveActivity.swift` has no `widgetURL` (only a small Open link) and no `lineLimit` on any text |
| 2 | Offline sync broken: on 13 Nov with data off, Sync said it couldn't sync, yet the backend returned 200 on Sync now (Firoz, 14 Nov) | **Z12-41** | TR-19a, TR-19b, TR-06e, TR-07d, W-20, TR-14e | `sync/SyncProvider.tsx` and `engine.ts` have no reconnect, foreground or NetInfo trigger; the status isn't derived from the outbox |
| 3 | Notifications display poorly; the iOS trainee notification panel is poor (Firoz, 14 Nov) | **Z12-47** | TR-15a, TR-15b, TR-15c, TM-13a | Reported by Firoz; push copy, grouping and the inbox aren't on v3 yet. Trace it in the task |
| 4 | A finished workout shows both Start workout and View summary (Firoz, 14 Nov) | **Z12-44** | W-01c, W-17a, W-17b | `WorkoutTab.tsx` renders Start even when the day is completed |
| 5 | Future meals and workouts can be logged (Firoz, 14 Nov) | **Z12-39**, decision: future days are view only | TR-06d, TR-07k, W-01e (F29) | No future-day gating in the client or the API |
| 6 | Moving between past, today and future days isn't smooth (Firoz, 14 Nov) | **Z12-40** | TR-06a, TR-06c, TR-06d, TR-07a, TR-07k, W-01a, W-01e | Reported by Firoz; not traced on main yet. The task measures before and after |
| 7 | Manual meal logging gives no proper feedback; needs a custom food screen and a saved confirmation (Firoz, 14 Nov) | **Z12-43** | TR-26a to TR-26f (TR-26e and TR-26f new), TR-08a to TR-08c | No custom-food screen; no confirmation after Save |
| 8 | In-app notifications stay stuck on screen (Firoz, 14 Nov) | **Z12-38** | TR-06h, TM-13b, TR-07b, TR-26f, TM-04m | `ForegroundBanner.tsx` and `InAppBanner` (`Surfaces.tsx`) have no timer and no swipe gesture |
| 9 | Cold-start offline lands on the error screen (13 Nov #2, cold-start part) | **Z12-41** | TR-06e, TR-19a | No persisted me or relationship snapshot |
| 10 | Workout done: "3 of 3" but 2 ticks (13 Nov #6) | **Z12-44** | W-17a, W-01c | The summary still passes stale `assignments` for the dots |
| 11 | Live Activity "0 kg × 0", "Next: set 1 of 3"; Swift LogSetIntent ends the workout early (13 Nov #7) | **Z12-48** (+ Z12-57 build) | TR-15d | `liveActivity.ts:139` prints "kg ×" for bodyweight; `LogSetIntent` sets `finished` |
| 12 | Diet values misaligned: ring overflow, macro wrap, Closed + Change (13 Nov #8) | **Z12-42** | TR-07a, TR-07f | DietTab Change has no `!isLocked` (around line 517); the ring has no `adjustsFontSizeToFit` |
| 13 | Active workout UX: no Finish early or ⋯ menu, no skip, undo or edit of a set, no moving between exercises, no haptics, How-to opens Ask coach, Pause where Back belongs (13 Nov #9) | **Z12-45** (haptics in Z12-57) | W-02 to W-27 | As listed in `device-findings-13nov.md` §9; unchanged on main |
| 14 | Food search + gives no feedback (13 Nov #10) | **Z12-43** | TR-26b, TR-26c | `FoodSearchScreen` `addFood` still awaits the network; no pressed or added state |
| 15 | Trainer "What changed" options all open the same note box (Firoz, earlier) | **Z12-52** | TM-15a → TR-08a, TR-08b, TR-08c, TR-26a | `ClientLogMealScreen.tsx` chips only set `deviationKind`; one Note field for all |

## Other W12 items and where they go
- **Nudge opens WhatsApp** (`NudgeSheet.tsx`) → **Z12-50**. It becomes a FitBud push with an editable body, the fixed title "{Coach} nudged you", 2 per client per day, and push off or reminders paused delivered inbox-only (TM-04b, TM-04c, TM-04m, TM-04n, TM-04o).
- **Priya → Priya Nair, quick reseed, no-plan, push-off and paused seed clients** → Z12-34.
- **No-plan empty state and raw API errors** → Z12-46.
- **Switch role from trainee More** is already on main ("Switch to coach view", Z11-14 #420). Back on role select and the push role prompt → Z12-49.
- **Z11-8 late-write privacy race** → Z12-33.
- **Sentry scrub, drizzle 0.45, vitest 4 and de-flaking** → Z12-54 to Z12-56.
- **Android `<queries>` (Z10-26), haptics, keep-awake, NetInfo, Live Activity Swift** → Z12-57.
- **kcal rounding ("1,746 of 1,745")** → Z12-42.
- **The Z11-13 trainer header hides dates with no zone** → Z12-53.

## Already fixed on main (no W12 task, verify only in Z12-58)
| Finding | Fixed by |
|---|---|
| Query strings dropped on native (747 meals) | Z11b-1, #428 |
| Trainer check-in Back went Home | Z11b-2, #427 |
| 13 Nov #3: crash on Start workout (keep-awake) | Z11b-3, #429 |
| 13 Nov #4: iOS sheets over a blank grey page | Z11b-4, #430 |
| 13 Nov #5: Ate out and Changed the portion did nothing | Z11b-5, #431 |
| 13 Nov #1: Progress tab (duplicate keys, title, clipped pill, months, spinner) | Z11b-6, #433 |
| 13 Nov #2: offline mid-session → "Something went wrong (AUTH-NET)" | Z11b-7, #432 |
| Dual-role user can't switch back to coach from trainee More | Z11-14, #420 |
