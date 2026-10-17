# FitBud mobile — implementation gaps

Last updated: 2026-10-17 (branch `cursor/mobile-screens-a8e8`, pass 4).

## Resolved on stage1 (2026-10-17, be8a1ec+)

- Meal assignments **200** after demo seed quantity fix; **`mealAssignmentFallback.ts` removed**.
- **`GET /me/foods/:foodId`** wired for TR-08 / TR-26 serving chips (heuristic TODO only on fetch failure).
- Notification **`route`** + **`markNotificationRead`** on api-client augment; TR-15 uses both.
- Preference fields: `dailySummaryReminder`, `channelPreference`, `whatsappOptIn`, `traineeTimezone`, `locale` on TR-16 / profile.
- **`GET /me/steps`** via `meStepsApi.ts` on TR-25 (disabled stub while `steps_enabled=false`).

## API-NEW (logged in mobile; foundation owns implementation)

| Gap | Screen | Notes |
|-----|--------|--------|
| `GET /me/foods/recent` on `@fitbud/api-client` | TR-08 | Mobile uses `fetchMeFoodRecent()` raw fetch. |
| `GET/PUT /me/steps` on `@fitbud/api-client` | TR-25 | Mobile uses `meStepsApi.ts` raw fetch. |
| Meal deviate `portionMultiplier` in contract | TR-08 | Sent in outbox payload for portion chips; server may ignore until API-CHG. |

| Screen ID | File | Status | Gaps |
|-----------|------|--------|------|
| TR-05 | `trainee/setup/ReminderSetupScreen.tsx` | MVP | Multi-step flow with `expo-notifications`, OEM battery sheet, quiet hours + timezone copy. Does not persist API-NEW fields (`preferredWorkoutTime`, WhatsApp opt-in audit). |
| TR-06 | `trainee/TodayTab.tsx` | MVP | Coach notes, pull-to-refresh, workout Start→active tab, nutrition + next meal confirm, late-log banner, weekly consistency. Steps hidden (`steps_enabled`). Hero priority not unit-tested in `@fitbud/core`. |
| TR-07 | `trainee/DietTab.tsx` | MVP | Shared date navigator, kcal on cards, skip + undo snackbar (undo not synced), late logging via open exceptions heuristic, optional meals blocked on past days. |
| TR-08 | `trainee/SomethingDifferentSheet.tsx` | MVP | Portion chips, repeat recent (`/me/foods/recent`), v2 serving chips from seed bundle; planned-item prefill still blocked on assignment API. |
| TR-11 | `trainee/ActiveWorkoutScreen.tsx` | MVP | Exercise prev/next, overview sheet, rep/load steppers, RPE chips; rest timer and offline-only set path still partial. |
| TR-15 | `trainee/NotificationsScreen.tsx` | MVP | Mark read on open via raw `POST /notifications/:id/read`. Deep link routing from rows still minimal. |
| TR-16 | `trainee/settings/ReminderSettingsScreen.tsx` | MVP | Four category toggles + coach nudges copy; daily summary uses `subscriptionRenewalReminder` key until API adds `dailySummary`. WhatsApp row "Coming soon" when `wa_automation` off. |
| TR-17 | `trainee/settings/QuietHoursScreen.tsx` | MVP | Presets + free-text times; no native time picker or 24h preview bar. |
| TR-19 | `trainee/settings/SyncStatusScreen.tsx` | MVP | Lists outbox queued/syncing/failed; synced rows drop off when acked (store design). |
| TR-20 | `trainee/MoreScreen.tsx` | MVP | Profile rows stubbed to overlays; no in-app timezone edit. |
| TR-21 | `trainee/WidgetTipsScreen.tsx` | Placeholder | No widget implementation. |
| TR-22 | `trainee/EndedCoachingScreen.tsx` | MVP | Shown when `relationship.status === ended`. |
| TR-24 | `trainee/settings/MealTimesScreen.tsx` | MVP | Uses `getMealTimes` / `updateMealTimes`. |
| TR-25 | `trainee/settings/StepsSettingsScreen.tsx` | Partial | `steps_enabled` respected; no Health Connect/HealthKit (`StepsCard` always hidden). |
| TR-26 | `trainee/FoodSearchScreen.tsx` | MVP | Standalone search; serving chips wired via shared `servingPresetsForFood`. |
| TR-02 | `screens/AcceptInviteScreen.tsx` | MVP | Improved copy/checklist; still paste-token (no invite preview API). |
| TR-04 | `screens/WaitingReviewScreen.tsx` | MVP | Checklist + meanwhile copy; no auto-refresh on focus. |
| TM-07 | `trainer/MoreScreen.tsx` | MVP | OS notification permission + settings rows; no profile editor. |
| TM-09 | `trainer/ActivityFeedScreen.tsx` | MVP | Day grouping + Open/Nudge row actions; no server-side grouping API. |
| TM-01 | `trainer/AttentionTab.tsx` | MVP | Swipeable cards + accessibility buttons; no KPI tiles. |
| TM-02 | `trainer/ClientsTab.tsx` | MVP | Filter chips with icons; attention chip is heuristic until client list API adds flags. |
| TM-03 | `trainer/ClientStatusScreen.tsx` | Partial | Week dots + recent activity feed; coach week kcal read model not on API for mobile. |

## Server / client assumptions

- **Assignment generation:** Today and Diet tabs do not call `generateWorkoutAssignments` / `generateMealAssignments`. Empty days depend on server-side generation elsewhere.
- **Read models:** `GET /me/day`, `GET /me/week`, `GET /activity/feed`, and `GET /exceptions/attention?groupBy=relationship` are required (stage-1 API).
- **Late logging:** Mobile treats any unresolved exception on the relationship as enabling late log on past required meals; per-item exception linkage is not on the assignment list yet.
- **Notifications:** Mark-read uses direct fetch because `@fitbud/api-client` has no typed helper yet.
- **Daily summary toggle:** UI label maps to `subscriptionRenewalReminder` in the preferences contract until a dedicated field exists.
