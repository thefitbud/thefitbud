# QA · Z12-41 offline sync

Spec: `docs/specs/Z12-41.md`. This file holds the root cause of finding 2 with its evidence, and how each part of the fix was checked.

## Finding 2: "Sync said it couldn't sync, yet the backend returned 200"

### What I could and could not reproduce

I had no device logs from the 13 Nov session, so I could not replay that exact session and cannot say which of the paths below it took. I reproduced the symptom (the sync screen says "Couldn't send" while every `POST /sync/push` answers 200) against the local API and the local D1, and then read the code for every other path that gives the same symptom. There are four causes. The first is reproduced end to end below, before and after the fix; each of the other three now has a test.

### Cause 1 (reproduced on the local API and D1): a workout opened with no network

`apps/mobile/src/trainee/workoutSession.ts` builds the active workout from the assignment when it cannot fetch the execution (`synthesizeExecutionFromAssignment`). That local execution has ids the phone made up for the execution, each exercise and each set. Every set logged in it is queued as `workout.complete_set` with those ids. The server has never seen them.

Reproduction on `main` at `3e410225`, as `aarav.ontrack`, local API on port 8791 (script: start, then one set with made-up ids, then the same set again as "Retry"):

```
push #1 HTTP 200 [{"op":"workout.start","status":"applied","code":null},
                  {"op":"workout.complete_set","status":"rejected","code":"EXECUTION_NOT_FOUND"}]
push #2 (Retry / Sync now) HTTP 200 [{"status":"rejected","code":"EXECUTION_NOT_FOUND"}]
```

D1 after it (`wrangler d1 execute DB --local`):

```sql
select mutation_id, operation, result_status, record_id from sync_mutations
 where mutation_id in ('b605c60f-75d8-4ef5-a20b-ae3afe9f9051','89c44194-716c-42d0-a5af-3768498c52c3');
```

| mutation_id | operation | result_status | record_id |
|---|---|---|---|
| b605c60f-… | workout.start | applied | 3b4c070a-… (the server's execution) |
| 89c44194-… | workout.complete_set | **rejected** | 83b107b5-… (the phone's made-up id) |

```sql
select count(*) from set_executions se
  join exercise_executions ee on ee.id = se.exercise_execution_id
  join workout_executions we on we.id = ee.workout_execution_id
 where we.assignment_id = '74cdd34c-3cc0-45e0-807c-ca167b0bad98' and se.status != 'pending';
-- 0
```

So: the workout started on the server, the set was refused with HTTP 200, the refusal was stored, and Retry replayed the stored refusal. The set was never written. The phone showed "Couldn't send" and nothing the trainee could do would send it.

This gives exactly the reported symptom: `/sync/push` answers 200 while the rows it carries are refused.

After the fix, on the same local D1 (the app now sends the plan's own ids, `assignmentId` and `setTargetId`, and the server finds the real execution and set by them):

```
push #1 (reconnect) HTTP 200 [{"status":"applied"},{"status":"applied"}]
push #2 (duplicate delivery) HTTP 200 [{"status":"already_applied"},{"status":"already_applied"}]
old refused set, same mutation id, retried HTTP 200 [{"status":"applied"}]
```

The third line is the set from the reproduction above (`89c44194-…`), sent again with its own mutation id: the stored refusal is no longer replayed.

| mutation_id | operation | result_status |
|---|---|---|
| 89c44194-… (refused before the fix) | workout.complete_set | applied |
| 51709f88-… | workout.start | applied |
| a1f04d7b-… | workout.complete_set | applied |

```sql
select we.assignment_id, se.status, se.actual_reps, count(*) from set_executions se
  join exercise_executions ee on ee.id = se.exercise_execution_id
  join workout_executions we on we.id = ee.workout_execution_id
 where we.assignment_id in ('7cda0c19-…','74cdd34c-…') group by 1, 2, 3;
```

| assignment | set status | reps | rows |
|---|---|---|---|
| 74cdd34c-… (the stuck one) | modified | 10 | 1 |
| 74cdd34c-… | pending | | 16 |
| 7cda0c19-… | modified | 10 | 1 |
| 7cda0c19-… | pending | | 16 |

One logged set per workout ("modified" because 10 reps differ from the prescription), one execution per assignment, after the queue was delivered twice.

### Cause 2: a refusal was final for ever

`routes/sync.ts` stored every result, refusals included, and answered any later delivery of that mutation id from the store. A log refused for a reason that later went away (the day had not started, coaching was paused, the execution did not exist yet) could never be sent. Test: `sync-offline.test.ts`, "a refusal is not replayed".

### Cause 3: the status was not read from the outbox

- A row was marked `in_flight` before the request and never put back when the request failed. On native, `navigator.onLine` is undefined, so the pill read "Sending" with nothing in flight until the app was killed. Test: `engine.outbox.test.ts`, "no network: the row goes back to waiting".
- A sent row stayed in the outbox as `acked`. Test: "a 200 removes the item".
- "Sync now" ran push then pull and showed "Could not sync just now." if either threw, so a pull failure after a successful push read as a failed send.
- Two sends could run at once, with the same row in both requests. Test: "two sends at once never put the same row in two requests".

### Cause 4: the outbox had no owner

One process-wide store served every account. After a sign-out, the next account on the phone pushed the previous account's logs under its own session; the server refused each one with a 200. On a test phone that switches demo personas this is likely. Test: `userStore.test.ts`.

### One more, found on the way: the native outbox was not durable

On iOS and Android the outbox was a memory store (`createBrowserDurableSyncStore()` returns null without `localStorage`). Killing the app lost every unsent log. Test: `durableStore.test.ts`, "kill and relaunch offline, then reconnect".

## What changed, and the check for each

| Part | Check |
|---|---|
| Status only from the outbox; a 200 removes the row | `apps/mobile/src/sync/engine.outbox.test.ts` |
| Automatic sends: start, reconnect (probe), foreground, every 30 s while not empty, after any successful API call | `apps/mobile/src/sync/triggers.test.ts`, `apps/mobile/src/lib/api.activity.test.ts` |
| Offline create, restart, reconnect, retry, duplicate delivery | `engine.outbox.test.ts`, `durableStore.test.ts` |
| One user's outbox is never read for another | `apps/mobile/src/sync/userStore.test.ts` |
| Server: one mutation id is one row; refusals processed again; transient failures not stored | `apps/api/src/routes/sync-offline.test.ts` |
| Offline workout lands on the real sets | `sync-offline.test.ts` ("offline workout"), `ActiveWorkoutScreen.v3.test.tsx` ("offline addressing") |
| Cold start offline opens on cached data; snapshot keyed by user, cleared on sign-out | `apps/mobile/src/auth/meSnapshot.test.ts`, `AuthProvider.coldStartOffline.test.ts` |

Mutation checks (each change below made its tests fail, then was reverted): a sent row kept in the outbox; rows left `in_flight` after a failed request; pushes not serialised; each of the four triggers removed; the owner claim removed; the sign-out clear removed; the snapshot clear removed; the snapshot's user check removed; on the server, an applied result not treated as final, a refusal replayed, the workout lookup not scoped to the trainee, a transient failure stored, the workout lookup removed.

## Expo-web check (D-W12-34), 15 Nov 2026

Expo web build of the app in Playwright Chromium at 393×852 (2x), `colorScheme` light and dark, against this worktree's local seeded API. The API is made unreachable by aborting every `/__fitbud_api/**` request, which is what the iOS harness does too (it stops the local API). Expo web proves copy, structure, values and behaviour, not native layout.

### Offline run, as `rohan.slipping` (light)

| Step | What the outbox held | What the screen said |
|---|---|---|
| API unreachable: "Eaten as planned" on Diet, then Log weight on Progress | `meal.confirm` and `measurement.create`, both `pending`, reason `UNREACHABLE` | Sync status "2 items waiting to send", each line "Saved on phone" (the Today button read "Sync status, Saved on phone" in the dark run) |
| Try sending now, API still unreachable | the same two rows, still `pending` | "Can't reach FitBud. Check your connection." Nothing marked failed |
| Reload with the API still unreachable ("kill and relaunch offline") | the same two rows | (web shows sign-in here: see "Not covered on web") |
| API reachable again, reload, **no tap** | empty after 0.5 s; `lastSentAt` set | no pill |
| API unreachable: open Saturday's missed workout ("Log it") and log set 1 | `workout.start` and `workout.complete_set`, both `pending` | the active workout, set 1 logged |
| API reachable again, **no tap, no reload** | empty after 3.5 s (the reachability probe) | |
| API unreachable: log a weight; API reachable; Try sending now | row `in_flight` while the request ran, then empty | "1 item waiting to send" and "Sending…", then "All saved", "Sent.", "Last sent 1:32 pm" |
| Firoz's case: the device reports no connection (`navigator.onLine` false, `offline` event) but the API answers; log a waist measurement | empty after 0.5 s | no pill; sync status "All saved" |

The outbox against D1 after the run (every mutation the phone queued, by id):

```sql
select actor_user_id, mutation_id, operation, result_status, created_at
  from sync_mutations where created_at > '2026-11-15T08:00:00' order by created_at;
select mutation_id, count(*) as n from sync_mutations group by mutation_id having n > 1;
```

| Queued on the phone (mutation id) | Operation | D1 `result_status` |
|---|---|---|
| 5d7a0217-8621-417f-b66c-28290f475943 | meal.confirm | applied |
| 750c66f0-c725-4844-98b0-cf884d865c3d | measurement.create | applied |
| 6d2f6b6f-aa23-4646-a205-ce0f6e048a78 | workout.start | applied |
| ff6f814e-7181-44c1-83bf-d2edfc68926d | workout.complete_set | applied |
| d9f29e4f-7ed0-405e-a8ed-a5b40bc6913e | measurement.create | applied |
| 608a4d77-1802-4822-93ee-91ec3827e491 | measurement.create | applied |

The first four ids were read from the phone's outbox while they waited; the last two are the weight and the waist from the last two steps, read from D1. Six queued, six rows, one row per id (the second query returned nothing). Rows written in that window across both runs: 1 meal log, 1 workout execution, 1 logged set and 5 measurements (3 from this run, 2 from the dark run below). No duplicates, no losses. The set went to the server's own execution although the phone had logged it against ids it made up: cause 1, fixed, through the real screens.

### Second run, as `aarav.ontrack` (dark)

Same steps, without the workout. Two weights were applied. The meal was **refused**: `LOG_TIME_BEFORE_WINDOW` ("The log time is before this item's window opened."), a 5:00 pm snack logged at 1:33 pm. The Diet screen offered "Eaten as planned" for it and the server would not take it yet; that mismatch belongs to the Diet screen and the log-time guard (Z12-42, Z12-39), not to sync. What sync did with it: the line showed "Couldn't send" with the server's own reason, the other logs were sent, and because a refusal is no longer replayed, "Try again" after 5:00 pm can send it.

### Grades against the v3 mocks

| Screen | Theme | Capture | Grade | What differs |
|---|---|---|---|---|
| TR-19a | light | `TR-19a-light-web.png` | CLOSE | Content, order, chips and button match. It is a screen with a Back row, not a sheet over More (approved departure: the shell mounts it as a screen; `SyncStatusContent` is exported so Z12-49 can sheet it). The meal reads "Meal" where the mock has "Evening snack": the name is not in the outbox row (see Follow-ups). No "Last sent" line before the first send, where the mock shows one |
| TR-19a | dark | `TR-19a-dark-web.png` | CLOSE | Same as light |
| TR-19b | light | `TR-19b-light-web.png` | CLOSE | Icon, title and both buttons match. The body says "Your log is kept on this phone." instead of "Your log is kept and he'll see both" (approved departure: the server writes nothing for a log on a replaced plan item, so the coach does not see it). It opens over the sync screen, not over More |
| TR-19b | dark | `TR-19b-dark-web.png` | CLOSE | Same as light |

The TR-19b captures use a conflict row placed in the stored outbox (status `conflicted`, code `LOCKED`, reason `superseded`, which is what the server answers for a replaced meal). The dialog, the list and "Keep my log" then run for real. A conflict produced by a coach actually republishing the plan was not captured.

Other states captured: `TR-19a-unreachable-light-web.png`, `TR-19a-sending-light-web.png`, `TR-19a-all-saved-light-web.png`, `TR-19b-kept-light-web.png`.

### Not covered on web

- **Cold start with no network.** On web the session restore is a different code path (`localStorage`, no user id stored), so a reload with the API unreachable shows sign-in, as it did before. The native path is covered by `AuthProvider.coldStartOffline.test.ts` (the real provider, native session storage, token session and snapshot over an in-memory keychain) and by the device flow `F10b` (stop the app, relaunch offline).
- Native layout, the keychain-backed outbox on a real device, and the OS reachability signal.

## Screen → control → result

| Screen | Control | Result |
|---|---|---|
| Sync pill (top bar) | the pill | Shown only while the outbox is not empty: "Saved on phone", "Sending…" or "Couldn't send". Opens sync status. Checked: render test, Expo web |
| TR-19a | Back | Closes the screen. Render test, Expo web |
| TR-19a | Try sending now | "Sending…" while the request runs, then the result read from the outbox: "Sent." and an empty list, or the reason it could not send. Disabled when nothing is waiting. Render test, Expo web (reachable and unreachable) |
| TR-19a, refused line | Try again | Puts the row back to waiting with the same ids and sends. Render test |
| TR-19a, refused line | Remove | Removes that row from the phone. Render test, Expo web |
| TR-19a, conflict line | What changed | Opens TR-19b again. Render test |
| TR-19b | Keep my log | Marks the row as kept ("Kept on phone"), closes the dialog, does not ask again. Render test, Expo web |
| TR-19b | See {coach}'s change | Closes the dialog and the sync screen; the log stays on the phone. Render test |

## Decisions taken (AGENTS.md "Decide and note")

1. **A sent row is removed from the outbox**, not kept as `acked`. The spec asks for it ("a 200 removes the item").
2. **On the server only an applied result is final.** A stored refusal is processed again when the same mutation is delivered again; a transient failure (5xx, 408, 429) is answered `retryable` and not stored. Option not taken: keep replaying refusals (that is cause 2).
3. **The outbox and the `/me` snapshot are kept in the keychain on native**, in chunks, because the app has no SQLite or AsyncStorage module and D-W12-13 forbids adding one here. Only the outbox and the cached plan are kept there; the pull cursor is not, because the records it covers are not. Z12-57 can replace the adapter (`sync/storage.ts`) with a database.
4. **Explicit sign-out drops unsent logs; a session the server ended does not.** They are keyed by user, so the same user gets them back and nobody else can read them.
5. **Cold start offline is handled in `AuthProvider.tsx`**, not `AppRouter.tsx`: with a snapshot the route resolves to the shell; with none, the error screen with Retry is unchanged. The trainer cache owner is not set from the snapshot (Z11-8).
6. **Reachability is "can the API be reached"**, asked of the API (`/health`), behind `sync/reachability.ts`. `setReachabilityFactory` is the one place Z12-57 switches to NetInfo.
7. **`enqueueAndPush` returns only its own action's verdict.** Before, a refused row from another action in the same request made an unrelated log show an error.
8. **Having no network is not reported as an error** (it would be one report every 30 s while offline); the row carries the reason.
9. **Copy with no frame**: "Can't reach FitBud. Check your connection.", "FitBud didn't respond. We'll keep trying.", "Couldn't send yet (SYNC-AUTH / SYNC-PARSE). We'll keep trying.", "N items couldn't be sent", "These are still on this phone. Nothing else is waiting.", "Everything you logged has been sent.", "Kept on phone", "What changed", "Try again", "Remove", and the unreadable-outbox line (SYNC-STORE). Diagnostics and Email support are gone from this screen (not in the mock; Help is on More).
10. **Web keeps the old cold-start behaviour** (see "Not covered on web").

## Follow-ups

- **Server accepts a log on a superseded item as a coach-visible deviation** (`routes/meals.ts`, core `canLog`), so TR-19b can say what the mock says.
- **Names on the sync lines.** Put `mealName` (Diet, `mealActions.ts`) and `workoutName` (`ActiveWorkoutScreen.tsx`, `workoutSession.ts`) at the top level of the outbox payload; the sheet already reads them and the server ignores them. Until then a line reads "Meal" or "Workout" unless the record is already on the phone.
- **TR-19a as a sheet over More** and the TR-20f layout (Z12-49): `SyncStatusContent`, `sheetItems` and `engine.sendNow()` are ready for both.
- **Diet offers "Eaten as planned" on a meal whose window has not opened** (seen as Aarav at 1:33 pm for the 5:00 pm snack); the server refuses it (Z12-42 / Z12-39).
- **Today's own sync button** (`TodayHeader.tsx`, Z12-46) still computes its label itself; `useSyncView` and `pillFromStatus` give it the same answer as the pill.
- **Z12-57 list:** replace the keychain-chunk storage with a database module; NetInfo behind `setReachabilityFactory`.
- **Z12-58 / Firoz's checklist:** real airplane mode and real mobile-data-off-with-Wi-Fi on a phone; an app kill with unsent logs on a real device (keychain persistence); the OS reachability signal on iOS.
