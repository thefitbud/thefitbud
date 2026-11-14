# Z12-34 · Quick reseed and seed fixes

Linux container, 4 cores, Node 22.23, 14 Nov 2026. No UI change, so no visual check.

## Method and why

The demo seed is one 37.7 MB SQL file with 4,125 statements. It used to go through
`wrangler d1 execute --local --file`, which runs the statements one by one through workerd.
On Firoz's Windows PC that took most of the ~20 minutes.

Measured route chosen: `apps/api/scripts/seed-demo.ts` now builds the same SQL and runs it in
**one transaction directly on the local D1 SQLite file** (`node:sqlite`, already used by the
script to read the library). No wrangler or workerd process, no per-statement round trips, no
bash, so it behaves the same on Windows. It keeps the old semantics: the seed's own
`DELETE`s wipe only demo data, and `PRAGMA defer_foreign_keys` is honoured inside the transaction
(foreign keys are checked at commit).

`pnpm db:reseed` (root and `apps/api`) runs that script. It **refuses** with a clear message when
(a) the local D1 has no `d1_migrations` table, (b) any `apps/api/drizzle/*.sql` is not applied,
or (c) the exercise or food library is empty. It never migrates and never touches the library.
The refusal was checked by hiding the last migration row (exit 1, message "behind the code ...
Run `pnpm db:reset`"), then restoring it.

Chunked files and multi-row inserts were not needed: the single transaction is already a few
seconds, so the seed SQL generator is unchanged apart from the data fixes below.

## Timings (wall clock, this container)

| Command | Before | After |
|---|---|---|
| `pnpm db:reset` total | 6 m 11 s (371 s) | 6 m 00 s (360 s) |
| of which `db:migrate:local` | not split out | 31 s |
| of which `db:seed:library` | not split out | 320 s |
| of which demo seed | 23.5 s (`pnpm seed:demo`, wrangler path) | 6.0 s |
| `pnpm db:reseed` (demo only) | none (`seed:demo` was the nearest: 23.5 s) | 6.0 s, 8.2 s on a second run; the transaction itself is 1.1 to 1.3 s; the rest is SQL generation |

Target met: reseed is far under 2 minutes. Honest caveat: the demo seed was already only 23 s on
Linux, so the 20 minutes on Windows cannot be reproduced here; the gain there should be larger
than the 4x seen here because it removes the wrangler per-statement cost. **`db:reset` itself is
still ~6 minutes on Linux because the library load (about 36 MB, still through wrangler,
shared with the remote/staging path and its tests) takes 320 s.** It was outside this task's
"demo seed" scope. Follow-up if wanted: load the local library through the same direct-SQLite route.
`db:reset` now prints per-step timings.

## Seed fixes

- **Priya Nair.** The trainee Priya was `tanvi.attention@demo.fitbud.test`, "Priya Sharma".
  Renamed in `apps/api/src/seed/demo/spec.ts`; email and ids unchanged. The trainer
  `priya.coach@demo.fitbud.test` is **Priya Malhotra**, a different person, and is untouched.
  Also updated: "Priya S." in two template `forWhom` lines, the
  `exceptions.query-count` snapshot (2 lines), `docs/seed/SEED_DESIGN.md`. The other
  "Priya Sharma" strings in web and mobile tests are hand-written fixtures, not seed
  assertions, so they stay. The QA seed (`seed/qa`) is a separate world and is untouched.
- **No-plan trainee.** Already present: `harpreet.ready` (active relationship, approved intake,
  zero plans, active push token). Documented, not duplicated.
- **Push off.** `ishita.pushoff` had a revoked token but `push_enabled = 1`. Now
  `push_enabled = 0` as well (token revoked, so both signals say off).
- **Reminders paused.** Already present: `farhan.paused`, `reminder_states.mode = 'paused'` with
  `paused_until` ahead of the run date.
- No new accounts were added: adding them would change counts that existing tests assert for no
  gain. Personas are documented in `docs/LOCAL_TESTING.md`.

## Relative dates

`referenceInstant = process.env.NOW ?? now`, and every date in the seed derives from it (IST),
so the seed was already relative to the run date. Verified gap: only the 8 generated personas
had future days (+6). The 10 original personas (aarav, rohan, meera, ...) stopped at today.
Fixed in `history.ts`: active clients now also get meal and workout **assignments** for
today+1 to today+6 (nothing logged, no check-in rows), as the generated personas already do;
ended clients still stop at their end date. A new test in `demo-seed.test.ts`
checks meals exist for aarav at -3..+3 around the reference day.

## Personas touched or documented

| Email | Shows |
|---|---|
| `tanvi.attention` | Priya Nair (mocks TM-02a, TM-04l, TM-12b, TM-13b) |
| `harpreet.ready` | no-plan trainee, active relationship |
| `ishita.pushoff` | push off (preference off, token revoked) |
| `farhan.paused` | reminders paused until a future date |
