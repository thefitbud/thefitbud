# Z14-1 · D1 round trips per request, before and after

**What is counted:** D1 round trips for one request, auth included. A standalone statement is one trip. A `db.batch([...])` is one trip however many statements it holds, because on D1 the cost is the round trip, not the rows.

**How:** `apps/api/src/routes/hot-reads.query-count.test.ts` runs each endpoint on the full demo seed as the demo trainer (`rahul.coach`) or the demo trainee (`aarav.ontrack`). It counts trips with `apps/api/src/test-support/query-count.ts`. Setting `Z14_1_QUERY_REPORT=<file>` writes the counts as JSON.

- **Before** (`before.json`) was measured on `main` at `8e714e4`, with only the test helpers added.
- **After** (`after.json`) was measured on the branch.
- Each cap in the harness equals the "after" count. Needs you keeps the spec's cap of 12.
- Times are FitBud Tech's estimate of 50–80 ms per round trip from India (Diagnosis #1). They are not measurements.

## Trainer

| Endpoint | Screen | Before | After |
|---|---|---|---|
| `GET /exceptions/attention?groupBy=relationship` | Needs you (warm: every client evaluated < 15 min ago) | 123 | **5** |
| ″ | Needs you (cold: every client due, one batched evaluation) | 123 | **7** |
| `GET /clients?limit=50` | Clients | 20 | **2** |
| `GET /coach-asks?status=open` | Attention, Clients badges | 12 | **2** |
| `GET /checkins/inbox` | Check-ins, Attention | 6 | **2** |
| `GET /activity/feed` | Activity | 12 | **2** |
| `GET /workspaces/relationships/:id` | Client page, review headers | 37 | **3** |
| `GET /workspaces/relationships/:id/week` | Client page week | 10 | **3** |
| `GET /notifications/relationships/:id/responsiveness` | Client page, Remind sheet | 16 | **2** |
| `GET /checkins/relationships/:id/notes` | Client page notes | 7 | **2** |
| `GET /exceptions/relationships/:id` | Client page exceptions | 13 | **2** (5 when due) |
| `GET /exceptions/:id` | Review sheet, exception screen | 8 | **2** |
| `GET /workouts/relationships/:id/assignments` | Client page, review sheet | 7 | **2** |
| `GET /meals/relationships/:id/assignments` | Client page, diet day | 9 | **2** |
| `GET /checkins/relationships/:id` | Client check-ins | 7 | **2** |
| `GET /progress/relationships/:id` | Client progress | 9 | **2** |
| `GET /history/relationships/:id` | Client history | 21 | **3** |

## Trainee (`aarav.ontrack`)

| Endpoint | Screen | Before | After |
|---|---|---|---|
| `GET /me/day/:date` | Today | 11 | **2** |
| `GET /me/week` | Today week card | 10 | **3** |
| `GET /workouts/relationships/:id/assignments` | Today, Workout | 7 | **2** |
| `GET /meals/relationships/:id/assignments` | Today, Diet | 9 | **2** |
| `GET /checkins/relationships/:id` | Today, Progress | 7 | **2** |
| `GET /progress/relationships/:id` | Progress | 9 | **2** |
| `GET /coach-asks` | Today | 7 | **2** |
| `GET /notifications` | Inbox | 6 | **2** |

Today's first paint makes five calls in parallel (`TodayTab.fetchDay`). Before the change the slowest of them took 11 trips, or about 0.6–0.9 s. After the change the slowest takes 2, or about 0.1–0.2 s.

## Flat in the number of clients (Needs you)

`apps/api/src/routes/exceptions-needs-you.query-count.test.ts` runs Needs you for 5 clients, the demo trainer's own clients and 40 clients. The demo trainer has 21 clients, 19 of them active, and Needs you lists only active clients. The 40-client case adds realistic trainees whose recent assignments mirror a demo client's plan, so detection has real work to do.

| Active clients | Cold | Warm | Client groups shown |
|---|---|---|---|
| 5 | 7 | 5 | 4 |
| 19 (demo) | 7 | 5 | 16 |
| 40 | 7 | 5 | 37 |

The same file checks two more things:
- A client last evaluated 10 minutes ago is not evaluated again on read. One evaluated 16 minutes ago is.
- When the trainee skips a workout, the skip shows in Needs you on the next read without any read-side evaluation.

## Auth and sync push

| | Before | After |
|---|---|---|
| Actor resolution (bearer) | 5 serial queries | 1 query (user, roles and both profiles) |
| Web session | 1 read, 1 `last_seen_at` write and 4 more queries on every request | 1 query; `last_seen_at` is written at most once per 5 minutes |
| `POST /sync/push`, 3 mutations | Each mutation went through auth again: 4 identity reads in total | The actor is resolved once and each mutation runs in-process: 1 identity read (`sync.query-count.test.ts`) |
