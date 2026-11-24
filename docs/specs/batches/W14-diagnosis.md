# W14 diagnosis · Firoz's device findings of 23 Nov 2026 (staging build 5)

**Written:** 24 Nov 2026 (IST) by FitBud UI, against `main` at `2c9819d3`. Docs only; no app code changed.
**Source:** Firoz's 14 findings from TestFlight build 5 (iOS) and Play internal code 5 (Android), as trainer and trainee, plus FitBud Tech's latency investigation of 22–23 Nov 2026 (staging, demo world of 21 clients). Firoz's 14 screenshots are with FitBud UI; the planner that wrote this file could not open them, so anything that depends only on a screenshot is marked **needs device repro**.
**How to read:** each finding has the root cause with `file:line` evidence on `2c9819d3`, a severity (**P0** blocks the beta, **P1** must fix before invites, **P2** polish), whether a mock is needed first, and the W14 task that fixes it. Line numbers drift; re-check them on the latest `main` (AGENTS.md "Before each task").

## Summary

| # | Finding | Root cause (one line) | Sev | Mock first | Task |
|---|---|---|---|---|---|
| 1 | Latency, trainer and trainee; trainee not really local-first; inconsistent home offline | API: Needs you re-evaluates every client on each read (~123 serial D1 queries for 21 clients), 5 auth queries per request, no batching. App: trainee day screens are REST reads with an in-memory cache only, writes wait for the push, tabs unmount, queued logs never overlay the day | P0 | No | Z14-1, Z14-2, Z14-3, Z14-4 |
| 2 | Home shows some blocks first while the rest loads | Today renders independently-loading blocks (in-app banner, reminders card, steps, week) around a partial skeleton instead of the TR-06f whole-screen skeleton | P2 | No (TR-06f exists) | Z14-2 |
| 3 | Offline shown as an error | Offline copy goes through `ErrorBanner` (crit tint); "Couldn't refresh" also crit when the cause is no network. TR-06e / TR-07d draw offline as a neutral wifi-off banner | P1 | No (TR-06e, TR-07d exist) | Z14-2 |
| 4 | No session RPE after a workout; View summary reopens "Save and share" | RPE is only asked inside the Finish sheet when the plan requires it; no endpoint takes RPE after finish; the summary screen has no read-only mode | P1 | Yes (W-17a/b update) | Z14-10 → Z14-11, Z14-12 |
| 5 | Time zone has two options | Picker hard-codes Asia/Kolkata and Asia/Dubai | P2 | Yes (searchable list) | Z14-10 → Z14-14 |
| 6 | Clipped "7"s on the progress chart; keypad hides the weight | Chart SVG is a fixed 329 pt wide with y-labels drawn at its right edge, so on narrower phones the labels (77, 76…) clip to "7"; BottomSheet does no keyboard avoidance on Android | P1 | No (TR-13a/c exist) | Z14-9 |
| 7 | Assigned diet plan layout | Old M2 layout: back link scrolls away inside the body, a second "Back" at the bottom, tab-bar inset on an overlay leaves blank space, long "Ask … about this plan" link in the footer | P2 | Yes (no v3 mock) | Z14-10 → Z14-14 |
| 8 | Chart and notification dot colours differ | Weight chart and Progress's bell dot use `coachInk` (periwinkle); TR-13a draws the chart in `--brand`; the dot is `coralStrong` (Today, top bar) or `coral` (Diet) elsewhere | P2 | No | Z14-9 (Diet dot in Z14-13) |
| 9 | Lock-screen Log does nothing (iOS); Android notification differs and is not on the lock screen | `LogSetIntent` (a `LiveActivityIntent`) is compiled into the widget target only, and rows it writes are drained only when the app is next active; Android live notification has ± steppers, rides the "Workout reminders" channel and is a plain ongoing notification | P1 | No (TR-15d) | Z14-5, Z14-8 |
| 10 | Permission still "off" after enabling; reminders and nudges don't pop up | No `setNotificationHandler`, permission read once on mount, push token registered only at sign-in, every Android channel is IMPORTANCE_DEFAULT (no heads-up) and the server sends no `channelId`/`priority` | P0 | No | Z14-4, Z14-6 |
| 11 | "Nudge" not intuitive; other confusing copy | 53 visible "nudge" strings in 27 mobile/web files plus the API push title "{Coach} nudged you"; 55 on-screen bracketed error codes such as "(WO-SAVE)" | P2 | No | Z14-15 |
| 12 | Diet buttons cramped; "isn't available" flash; Changed the portion / Ate out collapsed; photo does nothing | Two `flex:1` buttons with `numberOfLines={1}`; the overlay renders the unavailable screen while it fetches the meal; sub-screens are nested inside BottomSheet's own ScrollView; the photo buttons upload a 1×1 placeholder PNG, never open a picker and never attach it (no `expo-image-picker` in the app) | P0 | Yes (sheet states) | Z14-10 → Z14-11, Z14-13; picker in Z14-5 |
| 13 | Workout logged twice, sync errors | No re-entrancy guard on Finish/Discard, lock-screen rows drained after the finish, each double tap is a new mutation id, `sync/push` dispatches mutations one by one as fresh HTTP sub-requests | P0 | No | Z14-7, Z14-8 |
| 14 | Android selection highlight navy; DOB typed by hand | `selectionColor={brand}` (#1A1248) on Android paints a solid navy highlight over navy text; DOB is a text field parsed from "12 Mar 1994" | P2 | No | Z14-9 (picker module in Z14-5) |

## 1 · Latency and local-first

### FitBud Tech's findings (22–23 Nov 2026, staging, read-only)
- Index audit on `2c9819d3`: every frequent lookup uses an index (1,067 distinct test queries checked). Gaps: `PRAGMA optimize` never run (the current-plan lookup scans all plan versions; used in 12 places incl. Today and sync) **high**; the reminder job scans the whole `notifications` table every 5 min **medium**; expired rows never deleted (idempotency replies, sync records, web sessions, login codes, old notifications) **medium**; schema index list vs migrations drift and ~9 duplicate indexes **low**.
- Caching: Google sign-in keys and `/config` cached; nothing else. Trainer web writes `last_seen_at` on every request. Trainer web has no data cache (follow-up, not in W14).
- Trainer latency, biggest first: (1) **Needs you re-checks every client on every load**, ~6 queries per client, ~123 serial queries for 21 clients, 33 s measured from the US, an estimated 6–10 s from India; the Clients tab waits on the same call. (2) No queries grouped or run in parallel: 7–14 serial D1 round trips per screen at an estimated 50–80 ms each from India. (3) **5 queries per request just to resolve the actor**. (4) The app adds waits: tabs refetch behind a skeleton on every switch, a client's page loads in two rounds, cold start runs sign-in → profile → relationships → push setup in series. Queries themselves take 8–25 ms per screen locally; the time is round trips. Proposed: Smart Placement (one config line), rebuild Needs you to ~10 queries, one auth query, parallel independent queries, show cached data at once and keep tabs mounted. Not confirmed: D1 region and real request timings (FitBud Tech's `CLOUDFLARE_API_TOKEN` is rejected; Firoz to reissue).

### Code evidence
- Needs you: `apps/api/src/domain/exceptions.ts:453-454` loops `for (const relationship of relationships) await evaluateRelationshipExceptions(...)` on every read of `GET /exceptions/attention` (`apps/api/src/routes/exceptions.ts:222`). Trainer mobile Clients also calls it: `apps/mobile/src/trainer/ClientsTab.tsx:352-357` (two `listClients` calls plus `getAttentionGroups` plus `listCoachAsks`).
- Actor resolution: `apps/api/src/auth/identity.ts:253-260` (user by Firebase uid) then `loadActorByUserId` `:172` (user again), `:183` (roles), `:188` (trainer profile), `:193` (trainee profile): 5 serial queries before any handler. Web sessions also `UPDATE web_sessions SET last_seen_at` on every request (`apps/api/src/middleware/auth.ts:134-137`).
- Sync push: `apps/api/src/routes/sync.ts:267` loops mutations; `:314` dispatches each one as `getApp().request(...)` with the original `Authorization` header, so every mutation re-runs the auth middleware (Firebase verify + 5 queries) and runs in its own unbatched statements.
- No Smart Placement: `apps/api/wrangler.toml` has no `[placement]` block.
- HTTP caching: only `routes/config.ts:27`, `routes/account-deletion-page.ts:50`, `routes/files.ts:679` set `Cache-Control`.

### How the trainee "local-first" layer actually works today
- **Writes:** `enqueueAndPush` (`apps/mobile/src/sync/actions.ts:22-81`) writes the row to the outbox first (good), then **awaits** `engine.pushPending()` (`:71`) with a 30 s timeout (`apps/mobile/src/sync/engine.ts:475`, `:582-589`). Reachability "unknown" counts as reachable (`apps/mobile/src/sync/SyncProvider.tsx:52`), so on a slow network a tap can spin for up to 30 s. Meal actions then `await refreshDay()` (`apps/mobile/src/trainee/TodayTab.tsx:660`), a second network wait.
- **Device storage:** the outbox and only the `effective_plan` records survive a kill, in SecureStore chunks (`apps/mobile/src/sync/storage.ts:1-16`, `durableStore.ts:40-44`, native capacity `"small"` at `storage.ts:193`). There is no SQLite or AsyncStorage module in the app (`apps/mobile/package.json`).
- **Reads:** Today, Diet, Workout and Progress read REST endpoints, not the sync store. Today's `fetchDay` makes 5 calls (`TodayTab.tsx:355-400`); Diet `DietTab.tsx:497-503`; Workout `WorkoutTab.tsx:333-371`; Progress `ProgressTab.tsx:417`, `:462`. The day cache is an in-memory `Map` (`apps/mobile/src/trainee/dataCache.ts:20`), stale-while-revalidate for 30 s (`useTraineeDayCache.ts:35`). After a cold start or an app kill nothing is cached, so the first paint of every tab is a skeleton until the network answers.
- **Tabs unmount:** `TraineeShell.tsx:965-1046` and `TrainerShell.tsx:350-401` render only the active tab (`tab === "today" ? … : null`), so a tab switch remounts and refetches.
- **Cold start:** `AuthProvider.tsx:393-397` awaits relationships, then push registration, before the first screen.
- **Why the trainee waits on the network:** the read side is online-first with a short-lived memory cache; the write side waits for the push. Only the outbox is local-first.

### Inconsistent home (1,745 kcal eaten / 0 left, "1 log waiting to send", "Couldn't refresh")
- The day's numbers come from the last server answer (meals list + `GET /me/day`), and the queued log is only counted (`today/queuedLogs.ts:25-55`), never applied to the meals, rings or "left" line. `TodayTab.tsx:722-729` shows the queue count and the crit "Couldn't refresh" banner together, and `getMeDay` failures are swallowed to `null` (`TodayTab.tsx:371`) while the meals list may come from a 30 s shared cache (`:362-368`), so the ring (`dayKcalSummary`, `nutrition.ts:287-323`) and the "left" line (`TodaySummaryCard.tsx:62-76`, goal from prescriptions) can describe different moments. The exact figures need the screenshot or a device repro; TR-06e is the target: the pending meal row reads "Not sent yet · eaten as planned" and the totals include it.

### One app: trainer online-first, trainee offline-first — feasible?
**Yes.** The role is known at sign-in (`me.selectedRole`) and the shells are already separate (`TraineeShell`, `TrainerShell`). The data policy is a per-shell choice, not a separate app (D-W14-6):
- **Trainee (offline-first):** every screen renders from the device store first (persisted day/week/progress snapshots + the outbox overlaid on them), refreshes in the background, and a log returns as soon as the local write lands; the push runs behind it.
- **Trainer (online-first):** the server is the source, but the last answer for each tab is kept (memory + device) and painted at once while it refreshes; writes stay online with optimistic UI and Undo; no outbox.

## 2 · Home loads in pieces
`TodayTab.tsx:881` shows `TodaySkeleton` only for the day bundle, while `RemindersPausedCard` (`:1127`), `StepsCard` (`:1249`), the week card (`:1264`, its own fetch) and the in-app `ReviewedBanner` (`:683`, own fetch) render or pop in independently. Which block Firoz calls "messages" (in-app banner or "From your coach" notes at `:1307`) needs the screenshot; the fix is one gate: TR-06f skeleton until the day bundle, plan state and week have answered (or failed), then everything at once.

## 3 · Offline as an error
`components/ErrorBanner.tsx:5-15` always paints `critTint`/`critInk`. 58 call sites pass `userFacingMessage(err)`, which returns `USER_FACING_OFFLINE` for network failures (`packages/api-client/src/errors.ts:22-23`, `:40`), so offline lands in red. Today also shows "Couldn't refresh · pull to try again." in the crit banner when the load failed for lack of network (`TodayTab.tsx:423-424`). Recommended neutral state (TR-06e / TR-07d): a neutral banner (fill/ink2, `wifi-off` icon, no alert role) reading "You're offline. Showing what was saved at {time}. Logs will send when you're back.", plus the sync chip; crit stays for real failures (TR-06g "Couldn't refresh. Showing 9:40 am." with Retry).

## 4 · Session RPE and View summary
- RPE is only shown inside the Finish sheet when the plan sets `requireSessionRpe` (`trainee/workout/log/LogSheets.tsx:421`, `ActiveWorkoutScreen.tsx:679`). The summary only displays an RPE recorded at finish (`WorkoutSummaryScreen.tsx:232-237`) and its header comment records why: no trainee endpoint accepts RPE after finish (`:29-35`; the complete route reads it once, `apps/api/src/routes/workouts.ts:1518-1527`).
- `WorkoutSummaryScreen` always opens on the "Save and share with {coach}" step (`useState(false)` at `:58`, footer `:66-72`); "View summary" from Today (`TraineeShell.tsx:1001-1004` → `WorkoutTab.tsx:612`) reuses it, so an old workout shows "Save and share" again. Needs an updated W-17a (RPE picker, optional) and a read-only summary state.

## 5 · Time zone
`trainee/settings/AccountScreen.tsx:163-180`: a BottomSheet with two rows, Asia/Kolkata and Asia/Dubai; `zoneName` special-cases those two (`:27-44`). Needs the standard searchable list (mock).

## 6 · Progress chart and weight keypad
- Chart: `ProgressTab.tsx:217` fixes `width = 329` with `padRight = 32` (`:220`) and draws y-labels at `x = width - 4`, `textAnchor="end"` (`:306-317`). The SVG is not measured against its card, so on phones narrower than the iPhone frame the right edge is clipped and "77 / 76 / 75" read as "7". Fix: measure with `onLayout`, reserve label width, draw labels inside the plot or format with one decimal per TR-13a.
- Keypad: the Log weight sheet autofocuses a `TextInput` (`ProgressTab.tsx:944-957`) inside `BottomSheet`, whose `KeyboardAvoidingView` has `behavior={isIos ? "padding" : undefined}` (`components/BottomSheet.tsx:54-57`) in a `statusBarTranslucent` Modal on Android (`:47`), where `adjustResize` does not apply. Which platform Firoz saw needs a repro; fix both.

## 7 · Assigned diet plan
`trainee/AssignedMealPlanScreen.tsx:139-140` puts `M2TopNav` inside the scrolling body, `:262` adds a second "Back" at the bottom, `:130-134` the footer link "Ask {coach} about this plan"; the overlay passes `insetTabBar` (`navigation/TraineeOverlay.tsx:295`), which pads the body for a tab bar (`components/m2/M2Layout.tsx:34`) and leaves the blank band. No v3 mock exists for this screen.

## 8 · Colours
Design system: brand is navy `#1A1248`; `coach`/`coachInk` (periwinkle `#5448C8`/`#4A3FBF`) marks things that come from the coach; the unread dot is `--coral-strong` (`docs/design/v3/CHANGELOG.md`, TR-15a). TR-13a's chart uses `--brand` line, `--brand-tint` fill (`docs/design/v3/src/a_rest.py:39-45`). Code: chart line, area and points `coachInk` (`ProgressTab.tsx:291-344`); Progress bell dot `coachInk` (`:1035-1036`); Today `coralStrong` without ring (`trainee/today/TodayHeader.tsx:118-120`); `AppTopBar` `coralStrong` with a 2 pt card ring (`components/AppTopBar.tsx:122-131`); Diet `coral` (`DietTab.tsx:1403-1404`). Four hand-made bell buttons; one shared component fixes the drift.

## 9 · Live workout on the lock screen
- iOS: `targets/FitBudLiveActivity/FitBudLiveActivity.swift:106-163` defines `LogSetIntent: LiveActivityIntent` in the widget target only (`targets/FitBudLiveActivity/expo-target.config.js`; nothing in `modules/live-activity/ios`). A `LiveActivityIntent` is performed in the app's process, so its type must also be compiled into the app target; with widget-only membership the button can do nothing. Even when it runs, it only appends to the App Group (`:18-29`) and the app drains rows when it is next active (`src/notifications/liveActivityOutbox.ts:20-37`, `:449`). **Likely; confirm on device** (Console log of the intent).
- Android: `targets/android/WorkoutSetNotification.kt:195-263` builds a custom RemoteViews layout with −/+ weight and reps steppers (`modules/live-activity/android/src/main/res/layout/fitbud_workout_set.xml:66-148`), posted on the `workout` reminders channel (`ensureChannel`, `:419-428`, IMPORTANCE_DEFAULT, "Workout reminders"), no foreground service. Visibility is PUBLIC (`:261`), so absence from the lock screen points at the channel/OEM lock-screen setting or a collapsed custom view; **needs device repro** (OEM and Android version). Target: TR-15d layout (title + timer, exercise · set, Last/Target, "Log {target}" + "Open"), its own "Live workout" channel.

## 10 · Notifications
- `setNotificationHandler` is never called (only mocked in `src/test/render.tsx:102`), so pushes that arrive while the app is open are not shown.
- `ReminderSettingsScreen.tsx:116-126` reads the OS permission once on mount; returning from phone Settings never re-reads it ("off for a while" until the screen remounts).
- The push token is registered only during sign-in/session restore (`auth/AuthProvider.tsx:393-397` → `notifications/register.ts:235-264`); enabling notifications later in phone Settings registers nothing until the next cold start, so the server keeps treating the client as push-off (trainer sees "has turned off FitBud notifications", `trainer/sheets/nudgeContent.ts:204`).
- Android: every channel is `AndroidImportance.DEFAULT` (`notifications/androidChannels.ts:58-66`), which never pops up (heads-up needs HIGH); the server sends no `channelId` or `priority` (`apps/api/src/lib/expo-push.ts:155-160`), so pushes land on the default channel at normal priority.
- iOS: `app.config.js` staging variant sets `aps-environment: development` while staging is shipped through TestFlight (`eas.json` `staging-store`, `distribution: store`), which uses production APNs. **Verify** the built entitlements and an Expo receipt for one staging push before changing anything.

## 11 · Wording
53 visible "nudge" strings across 27 files in `apps/mobile/src` and `apps/trainer-web/src` (e.g. `trainer-web/src/components/ExceptionDrawer.tsx:945-976` "Nudge sent…"), and the push title `"{first} nudged you"` (`apps/api/src/domain/reminders.ts:1890-1893`). 55 on-screen strings carry bracketed codes, e.g. `"(WO-SAVE)"` (`ActiveWorkoutScreen.tsx:576`), `"(AUTH-NET)"` (`lib/authErrors.ts:50`), `"(NOTIF-LOAD)"` (`NotificationsScreen.tsx:189`), `"(RES-ERR)"` (`trainer/AttentionTab.tsx:609`).

## 12 · Diet "something different" and photo
- Buttons: `DietTab.tsx:1043-1077` two `flex:1` buttons with `numberOfLines={1}` and 8 pt padding (`:1557-1576`); "Something different" truncates at large font scale or narrow widths.
- Flash: `navigation/TraineeOverlay.tsx:157-166` clears and refetches the meal (a 21-day list, then a single read, `:133-153`) on every overlay change; while it is `null` the overlay renders `DeepLinkUnavailableScreen` (`:208-246`) instead of a loading state, so "isn't available" flashes before every screen of the flow. The meal the trainee tapped is already in memory and is not passed in.
- Collapsed sub-screens: "Changed the portion" and "Ate out" swap content inside the same `BottomSheet`, whose children sit in its own `ScrollView` with `flexGrow: 0` (`components/BottomSheet.tsx:73-79`); the sub-screen fakes a height (`SomethingDifferentSheet.tsx:124-138`) and nests a `flex:1` ScrollView (`:345-348`, `subScreen` `:530`). "Log it myself" works because it opens a full screen (`FoodSearchScreen`). TR-08b and TR-08c draw these as full screens. **Exact collapse needs a device repro**; the fix is to present them as screens.
- Photo: `DietTab.tsx:1089-1101` both buttons call `addMealPhoto` → `attachMealPhotoBestEffort` (`trainee/mealActions.ts:75-85`) → `uploadMealPhoto` (`:19-39`), which uploads `minimalPngBytes()` (a placeholder), never opens a camera or gallery, discards the returned media id, and swallows every error. No `expo-image-picker` dependency and no camera/photo Info.plist strings (`app.config.js`). The API links a photo only at log time (`photoIntent`, `apps/api/src/routes/meals.ts:919-995`); there is no endpoint to attach one to an already-logged meal.

## 13 · Duplicate workout log
- `ActiveWorkoutScreen.tsx:678-699` `finishWorkout()` has no in-flight guard: a second tap before the re-render queues a second `workout.complete` with a new mutation id; `discardWorkout()` (`:701-718`) can follow a finish and queue `workout.skip` on a finished workout. Server answers: "Workout already finished and cannot be skipped." (`apps/api/src/routes/workouts.ts:1759`).
- Lock-screen and notification "Log set" rows are drained when the app becomes active (`liveActivityOutbox.ts`), which can be after the finish; the API then refuses: "Sets can only be completed during an open workout." (`workouts.ts:1297`).
- Set rows carry `expectedServerVersion: execution.recordVersion` from a stale closure (`ActiveWorkoutScreen.tsx:563-571`).
- Server: `sync/push` dedupes by mutation id only (`routes/sync.ts:284-293`) and replays each mutation as a separate HTTP sub-request (`:314`), so related steps are not one transaction. One execution per assignment is enforced (`drizzle/0004_workouts.sql:43`), so "logged twice" is most likely a double complete/set; **exact sequence needs a device repro**.

## 14 · Sign-in selection colour and DOB
- `selectionColor={theme.colors.brand}` on `screens/auth/authParts.tsx:249`, `components/Field.tsx:26`, `components/m2/M2Form.tsx:74`. Android paints selection with that colour at full strength, so navy text disappears under a navy block; iOS tints it.
- DOB: `trainee/settings/ProfileScreen.tsx:58-92` free text parsed by `parseBirthDate` ("Write it like 12 Mar 1994."). No date picker module in the app.

## Needs a device (cannot be settled from code)
- #1 the exact numbers on the inconsistent home and India round-trip times (FitBud Tech's token is rejected).
- #2 which block Firoz calls "messages".
- #6 which platform hides the weight under the keypad.
- #9 iOS: confirm the intent never runs (Console); Android: OEM and Android version where the lock screen hides it.
- #10 iOS APNs environment on TestFlight (entitlement vs receipt).
- #12 the exact collapse of Changed the portion / Ate out.
- #13 the tap sequence that produced the duplicate.
