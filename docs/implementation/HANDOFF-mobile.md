# FitBud mobile — handoff

Branch: `cursor/mobile-screens-a8e8` · Guide: `docs/implementation/guide/FitBud_UIUX_Implementation_Guide.md`

## Trainee overlay map

| Overlay key | Screen ID | Component |
|-------------|-----------|-----------|
| `notifications` | TR-15 | `trainee/NotificationsScreen.tsx` |
| `reminder_setup` | TR-05 | `trainee/setup/ReminderSetupScreen.tsx` |
| `reminder_settings` | TR-16 | `trainee/settings/ReminderSettingsScreen.tsx` |
| `quiet_hours` | TR-17 | `trainee/settings/QuietHoursScreen.tsx` |
| `meal_times` | TR-24 | `trainee/settings/MealTimesScreen.tsx` |
| `sync` | TR-19 | `trainee/settings/SyncStatusScreen.tsx` |
| `steps_settings` | TR-25 | `trainee/settings/StepsSettingsScreen.tsx` |
| `food_search` | TR-26 | `trainee/FoodSearchScreen.tsx` |
| `something_different` | TR-08 | `trainee/SomethingDifferentSheet.tsx` |
| `meal_plan` | TR-09 | `trainee/AssignedMealPlanScreen.tsx` |
| `workout_overview` | TR-10 | `trainee/WorkoutOverviewScreen.tsx` |
| `ask_coach` | TR-18 | `trainee/ask/AskCoachSheet.tsx` |
| `ended` | TR-22 | `trainee/EndedCoachingScreen.tsx` |
| `deep_link` | TR-23 | `trainee/DeepLinkUnavailableScreen.tsx` |
| `profile` / `privacy` / `password` / `past_coaching` | TR-20 | `trainee/settings/*` |
| `widget_tips` | TR-21 | `trainee/WidgetTipsScreen.tsx` |

Navigation host: `navigation/TraineeOverlay.tsx` (`TraineeOverlay` type + `TraineeOverlayHost`).

Shell: `trainee/TraineeShell.tsx` — overlay state, `AppTopBar`, shared `selectedDate`, `MoreScreen` on More tab.

## Trainer

| Screen ID | Component |
|-----------|-----------|
| TM-09 | `trainer/ActivityFeedScreen.tsx` (Clients tab → Activity segment) |
| TM-07 | `trainer/MoreScreen.tsx` |
| TM-01 | `trainer/AttentionTab.tsx` (segmented feed) |

Trainer tab indicator colour: indigo (`trainer/TrainerShell.tsx`).

## Verification

```bash
pnpm --filter @fitbud/mobile typecheck
pnpm --filter @fitbud/mobile test
```

Screenshots (optional): `node scripts/capture-mobile-screens.mjs`

See gaps: `docs/implementation/GAPS-mobile.md`.
