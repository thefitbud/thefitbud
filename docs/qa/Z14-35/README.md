# Z14-35 before / after

No UI change: copy and config only.

| Case | Before | After |
|---|---|---|
| Trainer push body, removed ate-out meal | `Fri 13 Nov · was 1,120 kcal. It's back to not logged.` | `Fri 13 Nov · was 1,120 kcal, ate out. It's back to not logged.` |
| Trainer push body, removed other meal or old stored row | `Fri 13 Nov · was 1,120 kcal. It's back to not logged.` | unchanged |
| `mealRemovedActivityLine` with `previousAteOut: true` | `Priya removed their dinner log (Fri 13 Nov) · was 1,120 kcal` | `Priya removed their dinner log (Fri 13 Nov) · was 1,120 kcal, ate out` |
| `mealRemovedActivityLine` without the argument | as before | unchanged |
| Meal snooze reminder, Android channel | resolved through `copy.ts` (already `meal_v2` on this main) | `ANDROID_CHANNEL_ID_BY_GROUP` read directly; test asserts `meal_v2` |

Tests: `client-log-edit-notify.test.ts`, `notification-copy.test.ts`, `nativeActions.test.ts`.
