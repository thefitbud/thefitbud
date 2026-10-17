# FitBud mobile — implementation gaps

Last updated: 2026-10-17 (branch `cursor/mobile-screens-a8e8`).

| Screen ID | File | Status | Gaps |
|-----------|------|--------|------|
| TR-05 | `trainee/setup/ReminderSetupScreen.tsx` | Partial | No `expo-notifications` permission flow, OEM battery guide, or API-NEW preference fields (workout time, WhatsApp opt-in). |
| TR-06 | `trainee/TodayTab.tsx` | Partial | Coach notes, steps card, late-logging banner, pull-to-refresh; hero priority not unit-tested in `@fitbud/core`. |
| TR-07 | `trainee/DietTab.tsx` | Partial | Past/future dates read-only rules; skip meal; photo upload on confirm. |
| TR-08 | `trainee/SomethingDifferentSheet.tsx` | Partial | Serving qty/unit UI; macro preview; custom food kcal entry. |
| TR-15 | `trainee/NotificationsScreen.tsx` | Partial | Mark read, deep link routing from rows. |
| TR-16 | `trainee/settings/ReminderSettingsScreen.tsx` | MVP | Push categories only (per §4). No WhatsApp channel rows while `wa_automation` off. |
| TR-17 | `trainee/settings/QuietHoursScreen.tsx` | MVP | Free-text time inputs; no native time picker. |
| TR-19 | `trainee/settings/SyncStatusScreen.tsx` | MVP | Sync indicator states (syncing / problem) not wired to engine events. |
| TR-20 | `trainee/MoreScreen.tsx` | MVP | Profile rows stubbed to overlays; no in-app timezone edit. |
| TR-21 | `trainee/WidgetTipsScreen.tsx` | Placeholder | No widget implementation. |
| TR-22 | `trainee/EndedCoachingScreen.tsx` | MVP | Shown when `relationship.status === ended`. |
| TR-24 | `trainee/settings/MealTimesScreen.tsx` | MVP | Uses `getMealTimes` / `putMealTimes`. |
| TR-25 | `trainee/settings/StepsSettingsScreen.tsx` | Partial | Hidden explanation when `steps_enabled` false; no Health Connect/HealthKit. |
| TR-26 | `trainee/FoodSearchScreen.tsx` | MVP | Standalone search; not linked from diet row actions. |
| TM-07 | `trainer/MoreScreen.tsx` | Partial | No OS notification permission row; no profile editor. |
| TM-09 | `trainer/ActivityFeedScreen.tsx` | Partial | No filter chips, grouping, row actions, or cursor pagination. |
| TM-01 | `trainer/AttentionTab.tsx` | Partial | Segmented Needs you / Asked / Check-ins; uses `getAttentionGroups` + `listCoachAsks`. |

## Server / client assumptions

- **Assignment generation:** `generateWorkoutAssignments` / `generateMealAssignments` removed from Today and Diet tabs. If the server does not replenish assignments on a schedule, empty days may appear until generation is triggered elsewhere (documented here).
- **Read models:** `GET /me/day`, `GET /me/week`, `GET /activity/feed`, and `GET /exceptions/attention?groupBy=relationship` must be available (stage-1 API).
