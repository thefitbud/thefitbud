# Z14-20 · Cursor pages for the check-in inbox, coach notes and coach asks

API only (no visual check, no device run). D-W14-26: with no `limit` (and no `cursor`, and for the inbox no `segment`) every endpoint answers exactly as before.

## Endpoints and parameters

| Endpoint | New query params | Without them | With them | Order (keyset) |
|---|---|---|---|---|
| `GET /checkins/inbox` | `limit` (1–50), `cursor`, `segment` = `to_review` \| `overdue` \| `reviewed` | All due, overdue and submitted check-ins of non-ended clients, `nextCursor: null` (unchanged code path) | No segment: same rows as unpaged, one page at a time | `localDate` desc, `createdAt` desc, `id` desc |
| | | | `segment=to_review`: submitted, not reviewed | `coalesce(submittedAt, localDate)` asc, `id` asc (oldest waiting first, as the app) |
| | | | `segment=overdue`: not submitted, window closed | `localDate` asc, `id` asc (oldest due first, as the app) |
| | | | `segment=reviewed`: has a review (whole history; the app chooses how far back) | review `createdAt` desc, `id` desc (newest review first, as the app) |
| | | | `segment` without `limit`/`cursor`: the whole segment, `nextCursor: null` | as above |
| `GET /checkins/relationships/:id/notes` | `limit` (1–50), `cursor` | Every note, `nextCursor: null` (unchanged) | One page, `nextCursor` or `null` at the end | `createdAt` desc, `id` desc |
| `GET /coach-asks` | `limit` (1–50), `cursor` (per `status`, default `open`) | Every ask, **no `nextCursor` key** (unchanged) | One page + `nextCursor` (`null` at the end) | `lastAskedAt` desc, `id` desc |

- `limit`: a non-numeric value (`abc`) falls back to 30; any number is clamped to 1–50 (`0` and negatives read 1, `500` reads 50). A `cursor` without `limit` pages 30 at a time. (`GET /clients` reads `0` as 30; these lists follow their documented 1–50 clamp instead.)
- A cursor that does not decode, or carries the wrong number of key parts for the read (for example a notes cursor on the inbox), gets `400 INVALID_CURSOR` "Cursor is not valid." (the same answer as `GET /clients`). An unknown `segment` gets `400 INVALID_REQUEST` "Invalid check-in segment."
- Authorization is unchanged: the inbox reads only the trainer's own non-ended relationships; notes check ownership in the same batch before returning rows (404 otherwise); asks are scoped through the actor's own relationships.

## D1 round trips per request (auth included)

Measured on the demo seed with the round-trip counter (`test-support/query-count.ts`); the pagination tests assert each page stays the same after adding 120 check-ins, 80 notes and 60 asks.

| Request | Round trips | Shape |
|---|---|---|
| `GET /checkins/inbox` (unpaged) | 2 | auth + 1 select |
| `GET /checkins/inbox?limit=30` (first or middle page) | 2 | auth + 1 select |
| `GET /checkins/inbox?segment=to_review\|overdue\|reviewed&limit=30` | 2 | auth + 1 select |
| `GET /checkins/relationships/:id/notes` (unpaged) | 2 | auth + 1 batch (relationship, notes) |
| `GET /checkins/relationships/:id/notes?limit=30` | 2 | auth + 1 batch (relationship, notes) |
| `GET /coach-asks?status=open` (unpaged) | 2 | auth + 1 batch (asks + 4 label lookups) |
| `GET /coach-asks?status=open\|answered&limit=30` | 2 | auth + 1 batch (page + 4 label lookups keyed by the page) |

## Tests

- `apps/api/src/routes/checkins.pagination.test.ts`: unpaged parity (pages concatenate to the unpaged rows and bodies, demo seed and +120), first/middle/last pages, every segment walked with no duplicates or gaps in the app's order, a row inserted between pages (newer: not repeated; older: appears once), bad/tampered/foreign cursor and unknown segment, round trips flat with +120 check-ins, ended client hidden from every segment, trainee 403, another trainer 404 on notes and none of this trainer's rows; notes: parity, order, insert between pages, round trips flat with +80.
- `apps/api/src/routes/coach-asks.pagination.test.ts`: unpaged has no `nextCursor` key, per-status paging for trainer and trainee with the same bodies as unpaged, insert between pages, bad cursor, round trips flat with +60, another trainer sees none.
- Page size (fix round): `limit=500` returns 50 rows and a cursor, `limit=0` and `limit=-3` return 1, `limit=abc` returns 30, and a cursor without `limit` pages 30, for the inbox (unsegmented and a segment), notes and coach asks (trainer and trainee). Raising the cap in `lib/cursor.ts` to 500, or reading `0` as 30, fails three tests.
- Mutation check: changing the keyset comparison to `>=` or `<=` makes the tests fail (or the walk never ends); dropping the ended-client filter fails two tests.
