# QA · Z12-41 offline sync

Spec: `docs/specs/Z12-41.md`. This file holds the root cause of finding 2 with its evidence, and how each part of the fix was checked.

## Finding 2: "Sync said it couldn't sync, yet the backend returned 200"

### What I could and could not reproduce

I had no device logs from the 13 Nov session, so I could not replay that exact session. I reproduced the symptom (the sync screen says "Couldn't send" while every `POST /sync/push` answers 200) against the local API and the local D1, and then read the code for every other path that gives the same symptom. There are four causes. The first is reproduced end to end below; the other three are each reproduced by a test that fails on `main`.

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

This fits the 13 Nov report: with mobile data off, the phone still reached the local API over Wi-Fi some of the time, so `/sync/push` answered 200 while the rows it carried were refused.

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
