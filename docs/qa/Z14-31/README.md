# QA · Z14-31 — workout note API (migration 0043)

API only; no screens (the app side is Z14-32). Sample bodies below use made-up
values, no real data. Evidence is the test suite: `apps/api/src/routes/workouts.feedback.test.ts`,
`packages/contracts/src/workout-feedback.test.ts`, `apps/api/src/domain/coach-log.test.ts`,
`apps/api/src/db/migration-chain.test.ts` (0043 block).

## Migration

```sql
ALTER TABLE `workout_executions` ADD `session_note` text;
```

Nullable, no default, no index, no backfill. Apply on staging before the API deploy
(`pnpm --filter @fitbud/api db:migrate:staging --yes`, then the one-off `PRAGMA optimize`);
an older API keeps working against the new column.

## `PATCH /workouts/executions/:executionId/feedback`

### Before (Z14-11/Z14-12)

```json
// request
{ "rpe": 7, "recordVersion": 3 }
// a note was refused: 400 INVALID_REQUEST "Invalid rating."
{ "rpe": 7, "note": "Felt heavy", "recordVersion": 3 }
```

### After

```json
// rating only (old clients): unchanged behaviour
{ "rpe": 7, "recordVersion": 3 }

// note only: the stored rating is kept
{ "note": "  Left knee felt tight on the last set  ", "recordVersion": 4 }
// -> 200, data.sessionNote = "Left knee felt tight on the last set", data.sessionRpe = 7, data.recordVersion = 5

// both, one atomic write
{ "rpe": 8, "note": "Last set was a grind", "recordVersion": 5 }

// clear the note (null, "" or blank all clear)
{ "note": null, "recordVersion": 6 }
```

Refusals (friendly `message`, code for logs only):

| Body | Status | Message |
|---|---|---|
| `{ "recordVersion": 3 }` | 400 | Choose a rating or write a note, then save. |
| `{ "note": "<501 characters>", "recordVersion": 3 }` | 400 | Notes can be up to 500 characters. Shorten it and try again. |
| `{ "rpe": 11, "recordVersion": 3 }` | 400 | Choose a rating from 1 to 10. |
| unknown key | 400 | That rating or note couldn't be saved. Try again. |
| after 48 h | 422 | Ratings can be changed for 48 hours after a workout. |
| stale `recordVersion` | 409 | This workout changed since it was opened. Reload and try again. |
| `{ "rpe": null }` on a required-rating plan | 422 | Session RPE is required to complete this workout. |

Equal values answer 200 with the stored execution: no version bump, no change-log row, no activity item.

## Reads

`workoutExecutionSchema` gains `sessionNote: string | null` (optional in the schema for old
fixtures). Sent on `GET /workouts/executions/:id` (trainee and trainer), every execution
mapped by `mapWorkoutExecutionSummary`, and sync pull payloads for `workout_execution`.

```json
{ "id": "…", "status": "completed", "sessionRpe": 8, "sessionNote": "Last set was a grind", "feedbackEditableUntil": "…", "…": "…" }
```

## Activity feed (trainer) and change log

| Change | Feed summary |
|---|---|
| rating only | Rated Lower body B: RPE 8 (unchanged) |
| rating cleared | Cleared the rating for Lower body B (unchanged) |
| rating and note added/changed | Rated Lower body B: RPE 8 · left a note |
| rating changed and note removed | Rated Lower body B: RPE 8 · removed the note |
| note added | Added a note on Lower body B |
| note changed | Changed the note on Lower body B |
| note removed | Removed the note on Lower body B |

The note text is never in a feed summary or change-log line (`Note: added` / `Note: changed` /
`Note: removed`); it is kept only in the stored before/after snapshot. No push and no inbox
notification; a realtime hint is sent as before.
