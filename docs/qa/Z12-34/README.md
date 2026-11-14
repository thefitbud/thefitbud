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

## Timings (wall clock, this container, 4 cores)

| Step | Before | After |
|---|---|---|
| `db:reset` total | 371 s | 37.6 s |
| `db:migrate:local` | not split out | 28.7 s (unchanged, wrangler) |
| library load | 320 s (wrangler) | 2.1 s (`scripts/library-seed-local.ts`, direct SQLite) |
| demo seed | 23.5 s | 4.4 s |
| `pnpm db:reseed` | none (`seed:demo` 23.5 s) | 5.6 to 6.0 s (transaction 1.0 s, rest is SQL generation) |

The library load (the 36 MB, thousands of statements) was the real cost. `db:reset` now calls
`library-seed-local.ts`, which runs the same files in the same order as `library-seed.ts` local
mode, one transaction per file, straight into the local D1 file. `library-seed.ts` and the
remote/staging path are untouched (`pnpm db:seed:library` still uses wrangler).

### Library equality (before vs after)

Per-table row count and sha256 of the sorted row JSON, for all 35 tables the demo seed does not
write (library, lookups, global templates, migrations; FTS shadow tables skipped). Before = the
wrangler-loaded DB, after = the direct load. 33 of 35 identical; the two that differ are
`_cf_METADATA` and `d1_migrations`, which hold the apply timestamps. Row counts match (for
example 1,362 exercises, 1,243 foods, 32,946 food nutrients, 919 exercise media). FTS queries
work after the load ("dal" 20 foods, "squat" 121 exercises).

### With the API running (port 8797)

- `db:reseed`: safe. Changing a client name by hand showed in `/clients` immediately, and after
  `db:reseed` the API returned the reseeded name with no restart and no lock error.
- `db:reset`: not safe. The API kept serving the deleted database (stale/empty data), and on
  Windows the delete would fail. `db-reset.ts` now checks port 8787 and `FITBUD_API_PORT` and
  refuses with a clear message; `FITBUD_RESET_IGNORE_API=1` skips it. Verified with a listener on 8787.

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
