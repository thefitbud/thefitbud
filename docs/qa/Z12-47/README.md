# Z12-47 QA: push copy and groups, taps from every state, inbox v3

Spec: `docs/specs/Z12-47.md`. Mocks: TR-15a, TR-15b (inbox), TR-15c, TM-13a (lock screen). Flow: F13 (`apps/mobile/.maestro/flows/v3/F13-notifications-deep-links.yaml`).

## What changed

- **Copy** (`notifications/copy.ts`): every type has a short title (36 characters at most, with a 12-letter coach or client name) and a body that fits two lock-screen lines (90 at most). Coach rows name the coach ("Rahul left a note", "Rahul changed your plan", "See Rahul's review."); trainer rows name the client by first name ("Aarav asked you", "Aarav sent their check-in"). Nothing starts with "FitBud ·", and no raw enum or ISO date appears. A table test checks every `NotificationType` with a short name, a long name and no name.
- **Groups**: one push group per kind (meal, workout, check-in, summary, coach, plan, account, clients), each with an Android channel and an iOS notification category with a stack summary ("%u more from your coach"). The channels and categories are registered at sign-in (`preparePushPresentation`).
- **Taps**: a routing table test sends every routable type through the cold-start, background and foreground paths and checks the screen it lands on and that the other role never routes it. Changed routes: a plan change opens Workout (F13, W-01d), paused reminders open reminder settings, and an answered question opens the meal or workout it was about. The meal notification listener no longer jumps to Diet on every body tap (it was registered nowhere before; it now runs at sign-in, so this guard matters).
- **Inbox** (`NotificationsScreen.tsx`, opted in to dark): Today / Yesterday / Earlier by the trainee's civil day in their stored zone; coach rows with coach-tinted tiles; a coral unread dot (and "Unread" in the row's accessibility label, so state is not shown by colour alone); "Read all" while anything is unread; "Notifications are kept for 30 days."; the TR-15b empty state with the coach's name. A row shows the server's own title and body when the record carries them (Z12-50's nudge). The inline Open / Snooze 30 min buttons and the settings link are gone, as in TR-15a and TR-15b.

## Expo-web screenshot check (D-W12-34)

Method: the API on 127.0.0.1:8795 against this worktree's own D1 (`pnpm db:reset`, Tue 17 Nov 2026), `expo start --web` on 8096 with `EXPO_PUBLIC_API_BASE_URL` pointing at it, Playwright Chromium at 393×852 @2x, `colorScheme` light and dark, signed in through the real sign-in screen. State is real: Rahul shared notes with Aarav through the API (`POST /checkins/relationships/:id/notes`). Tanvi (`tanvi.attention`) has nothing in the last 30 days. Ananya (`ananya.newbie`) has reminders across several days.

| Shot (`web/`) | Mock | Grade | Notes |
|---|---|---|---|
| `TR-15a-light-web.png` | TR-15a light | CLOSE | Nav (back chevron, centred title, Read all), TODAY label, card group, coach-tinted message tile, coral dot, time on the right, the 30-day line. Only coach notes in this account's last 30 days, so the mock's mix of rows is shown in the next shot. |
| `TR-15a-dark-web.png` | TR-15a dark | CLOSE | Same in dark tokens (`--card`, `--edge` border, `--coach-tint`). |
| `TR-15a-yesterday-earlier-{light,dark}-web.png` | TR-15a | CLOSE | Today, Yesterday and Earlier groups; times "8:20 pm", "Yesterday", "Sun", "Sat". Meal rows read "A meal is due": the notification record has no meal name (the mock's "Evening snack is due · Roasted chana and masala chai" needs the server to send it). |
| `TR-15b-light-web.png`, `TR-15b-dark-web.png` | TR-15b | CLOSE | Bell tile, "You’re all caught up", "Messages from Rahul, plan changes and reminders show up here.", no Read all. |
| `z12-47-read-all-dark-web.png` | — | — | After Read all: no dots, the button is gone. |

The browser console showed only React DOM prop warnings that predate this task (`accessibilityElementsHidden` / `importantForAccessibility` on DOM nodes); nothing from the new code.

## Device run (D-W12-34)

**Run 44119639359**, app ref `claude/Z12-47-push-inbox` at `2cd1b9f` (both job logs: `app: 2cd1b9f8e857…`), harness from `main` at `636b6e2`. Flows `launch,z12-47,z12-38`: the launch smoke, F13 (this task) and Z12-38's TR-06h flow, because its banner copy changed here ("Rahul left a note").

| Platform | Light | Dark | Device log |
|---|---|---|---|
| iOS simulator | 4 / 4 | 4 / 4 | clean, 0 allowed |
| Android emulator | 4 / 4 | 4 / 4 | clean, 0 allowed |

First attempt, no re-run. Screenshots in this folder: TR-15a, TR-15b and TR-06h, light and dark, iOS and Android.

What F13 does on the device: Aarav signs in, the coach shares a note (local API), the inbox shows it unread (TR-15a); a tap marks it read and lands on Today; Read all clears the rest and the button goes away; Back returns to Today. Then Tanvi, who has nothing in the last 30 days, opens the inbox (TR-15b).

**Lock screen (extras).** The gate sends one `daily_summary` push after the flows, in the dark run only. iOS: `simctl push` delivered, but the lock screen showed no entry (`lockscreen-notification-dark-ios.png`), although F13 and every other flow launch with `permissions: all: allow`. So the Z12-35 guess (no permission) is not the cause, or not the only one; Z12-58's phone checklist covers it. Android: a shell notification (the CI APK has no Firebase config), which opens nothing by design (`lockscreen-notification-shade-dark-android.png`). Its text is the harness's copy of the server's text ("FitBud" + type label), not the app's.

## Controls on the changed screens (screen → control → result)

| Screen | Control | Result |
|---|---|---|
| TR-15a | Back | Returns to Today (F13, both platforms, both themes) |
| TR-15a | Read all | Marks every unread row read; the button goes (F13; render test) |
| TR-15a | Coach note row | Marks it read, opens Today (F13) |
| TR-15a | Plan change row | Opens Workout (render test + routing table) |
| TR-15a | Other rows | Route table test per type (`openListener.test.ts`) |
| TR-15a | Pull to refresh | Reloads (unchanged code path) |
| TR-15b | Back | Returns to Today (unchanged handler) |
| TR-06h | Banner tap / swipe / auto-leave | Z12-38 flow, passed with the new copy |

## Departures from the mocks (decided and noted)

- **Groups Today, Yesterday, Earlier** (spec) where TR-15a draws only Today and Earlier with a "Yesterday" row inside Today.
- **No settings link** on the inbox (TR-15a and TR-15b have none). Settings stay under More → Reminders.
- **Read all only while something is unread** (TR-15b has none).
- **Row detail lines** are the app's copy: the notification record carries ids only, so "Roasted chana and masala chai", "6 exercises · about 50 min" and PR rows are not possible without server fields.

## For Firoz's real-phone checklist (Z12-58)

- Each push type with the app killed, in the background and open: it lands on its screen (the routing table in `openListener.test.ts` lists where).
- On iOS, two or more pushes of one kind stack with their summary ("2 more from your coach") **once the server sends `categoryId`** (follow-up); until then they stack under the app.
- On Android, Settings → Apps → FitBud → Notifications lists eight channels (Workout, Meal, Check-in, Daily summary, Coach updates, Plan updates, Coaching updates, Client updates); pushes land in the right one **once the server sends `channelId`**.
