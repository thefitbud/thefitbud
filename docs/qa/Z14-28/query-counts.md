# Z14-28: cold-start D1 round trips

Bearer auth (the mobile cold start), demo seed, auth included. A standalone statement is one trip; a `db.batch` is one trip. Test: `apps/api/src/routes/cold-start.query-count.test.ts` (cap 2, plus a flatness check at `limit=1` vs `limit=50`).

| Endpoint | Persona | Before | After |
|---|---|---|---|
| GET /me | trainer (rahul.coach) | 3 | 2 |
| GET /me | trainee (aarav.ontrack) | 2 | 2 |
| GET /relationships?limit=50 | trainer | 6 | 2 |
| GET /relationships?limit=50 | trainee | 6 | 2 |

How: `/me` batches the email read with the trainer profile read. `/relationships` runs the page, the three onboarding-status inputs and the trainer profiles in one `db.batch`; the inputs select through the same page subquery (ownership, cursor, order, limit + 1), so the count does not grow with the list. The status rule is unchanged (`statusesFromRows` is the old loop, moved out). An empty page is still 2 trips.

`GET /relationships/:id` and the write handlers are unchanged (they still call `deriveOnboardingStatusForRelationships`, now one batched trip instead of three parallel ones).
