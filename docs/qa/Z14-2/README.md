# QA · Z14-2 trainee offline-first (Expo web, 393×852 @2x)

Captured with `docs/qa/Z14-2/capture.mjs` on the local demo seed (API on 8791, Expo web on 8081), account `rohan.slipping@demo.fitbud.test` (TR-07i: `aarav.ontrack@…`), light and dark. Every shot starts from an empty browser profile; the offline shots go offline with Playwright's `setOffline` after one online visit, and nothing logged offline is ever sent. Expo web proves copy, states and values; native layout, safe areas and the airplane-mode relaunch are the device run's (F10 flows).

| Frame | Light | Dark | Grade | Notes |
|---|---|---|---|---|
| TR-06a today default | `TR-06a-light-web.png` | `TR-06a-dark-web.png` | CLOSE | Today as on `main` (this task changes no default layout). Differences from the frame are pre-existing and outside `files_owned`: the strip is the shared navigator with its date row, Steps reads "Set up" (no steps on web). |
| TR-06e today offline | `TR-06e-light-web.png` | `TR-06e-dark-web.png` | CLOSE | Neutral banner, wifi-off, no alert role, "You're offline. Showing what was saved at {time}. Logs will send when you're back." Dinner eaten as planned offline is applied to the day: 1,284 eaten, 461 left, Meals 4 of 4, Workout 0 of 1 from the snapshot. Differences: the header's sync button shows its "Saved on phone" upload glyph (a log waits) rather than the frame's "Offline" pill (`TodayHeader.tsx`, not owned); a quiet "1 log waiting to send" line sits under the banner (kept from frame 104 so the count and the day are on one screen); Steps reads "—" offline (steps are not snapshotted: no invented value). |
| TR-06f today loading | `TR-06f-light-web.png` | `TR-06f-dark-web.png` | MATCH | Day reads held: header, strip and the one skeleton; no block renders before the gate opens. |
| TR-06g refresh error | `TR-06g-light-web.png` | `TR-06g-dark-web.png` | CLOSE | Reload (cold start) paints Today from the phone's snapshot, the refresh gets a 500 (API reachable): crit banner above the strip, alert glyph, "Couldn't refresh. Showing {time}." (the snapshot's saved time), Retry. The "Rahul reviewed your check-in" in-app banner is a real notice from the seed sitting over the header for a few seconds. |
| TR-07d diet offline | `TR-07d-light-web.png` | `TR-07d-dark-web.png` | CLOSE | Neutral banner "Offline. 1 meal is saved on your phone and will send when you're back."; Dinner logged offline reads "Eaten as planned · not sent yet" with the not-sent badge, counted in 1,284 kcal and 4 of 4. The row line truncates at 393 pt beside a 3-digit kcal (pre-existing row layout). A seeded "Dinner isn't logged yet" reminder notice also shows (see follow-ups). |
| TR-07i diet load error | `TR-07i-light-web.png` | `TR-07i-dark-web.png` | MATCH | Meal reads never answered, nothing cached: "Couldn't load your meals" / "Check your connection. Anything you logged is saved on your phone." / Try again. |

Pre-existing, outside this task: in dark the shared date strip (`TraineeDateNavigator.tsx`) is a white card and its date row is low-contrast (visible in every dark capture); it is the same on `main`.

Follow-ups seen here (not in `files_owned`): the in-app reminder notice ("Dinner isn't logged yet") can still show for a meal whose log is queued on the phone (`notifications/ForegroundBanner.tsx` could read the outbox overlay); the header sync button could read "Offline" while logs wait and the API is unreachable (`today/TodayHeader.tsx`).

## Automated evidence

- `src/sync/actions.test.ts`: `enqueueAndPush` resolves before a slow push answers; the refused verdict lands on the outbox row with its message; no answer leaves the row waiting with the reason; `workout.start` / `checkin.submit` / `wait` still wait.
- `src/sync/offlineFirst.test.tsx`: airplane mode end to end on the real engine, durable store and snapshot store over one storage map: create offline → kill → restart offline (log and day still there, overlay applied) → reconnect with a lost answer → retry with the same mutation id and key → duplicate delivery answered `already_applied`, applied once.
- `src/trainee/snapshotStore.test.ts`: write and hydrate across a restart, coalescing, owner change clears, 14-day prune, limit, corrupt entry reported and dropped (never returned), session end clears.
- `src/trainee/today/queuedLogs.test.tsx`: overlay for queued confirm / skip / deviate and workout finish / skip / start; replaced by the server's copy once it has the log; refused rows not applied; the 1,745 / 0 inconsistent-home fixture.
- `src/components/ErrorBanner.render.test.tsx`: offline copy renders neutral (fill, no alert) and 5xx stays crit, in light and dark; TR-06g Retry.
- `src/trainee/TodayTab.offlineFirst.render.test.tsx`: skeleton gate with no cache (no block before day, plan and week), instant paint from a snapshot, the inconsistent home on screen, offline vs reachable failure.
- `src/trainee/TraineeShell.keptTabs.render.test.tsx`: a left tab stays mounted (hidden, `aria-hidden`), no refetch on a switch back within 30 s.
