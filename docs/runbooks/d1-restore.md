# D1 restore with Time Travel (Firoz)

How to roll a D1 database back to an earlier point and check it (task BT4). Only Firoz runs these commands; agents never do. They act on the real remote database, so read the whole page before the first one.

| Env | `--env` | D1 database (`apps/api/wrangler.toml`) |
|---|---|---|
| local / dev | none (default block) | `fitbud` |
| staging | `staging` | `fitbud-staging` |
| production | `production` | `fitbud-prod` |

Time Travel keeps 30 days of history on the production storage backend (paid plan). Run every command from `apps/api`, signed in to the FitBud account (`pnpm exec wrangler whoami`). Replace `<db>` and `<env>` using the table above. Wrangler 4.141.0 was checked with `--help`; `time-travel` commands always act on the remote database.

## Read this first

- **A restore replaces the whole database**, not one table or one client. Every write after the chosen point is lost: trainer and trainee logs, check-ins, invitations, sign-ups, payments entries, reminder records.
- Nothing is merged back. If you need only a few rows, do not restore; fix those rows by hand. Time Travel cannot read an older state without replacing the current one.
- **Production needs Firoz's explicit go**, every time, after you have decided the timestamp and written down what will be lost. Rehearse on staging first.
- R2 files (`fitbud-media-nonprod`, `fitbud-media-prod`) and queues are **not** restored. Rows may then point at files that still exist, or files may exist with no row.

## 1. When to restore

Restore when data was damaged and the fix is faster than repairing it by hand:
- a migration or script corrupted or deleted data;
- a bad deploy wrote wrong data for a while;
- someone deleted rows by mistake.

Do not restore for a bug that only shows wrong data on screen (fix the code), or to undo a single user's change.

Before you restore:
- [ ] Write down what happened and the time it started (with timezone).
- [ ] Decide what to do about writes. Restoring while trainers and trainees are using the app loses their writes too. For production, tell the trainers first.
- Note: the reminder cron (`*/5 * * * *`) and the queue consumer in `wrangler.toml` keep writing reminder records, including right after a restore. The only real pause available today is to stop clients (ask trainers and trainees to close the app). A proper pause mechanism would need its own decision; this runbook does not invent one.

## 2. Look at the current state

```bash
cd apps/api
pnpm exec wrangler d1 time-travel info <db> --env <env>
```

For staging: `pnpm exec wrangler d1 time-travel info fitbud-staging --env staging`.

It prints the **current bookmark** (it does not print a time). Wrangler 4.141.0 output:

```
🚧 Time Traveling...
⚠️ The current bookmark is '<bookmark>'
⚡️ To restore to this specific bookmark, run:
 `wrangler d1 time-travel restore fitbud-staging --bookmark=<bookmark>`
```

The suggested command leaves out `--env`; add `--env <env>` when you run it. Copy the bookmark into the rehearsal log or incident notes now. This is your undo point (step 5).

## 3. Choose the point to go back to

Pick the last time the data was known good, from just before the damage began.

- By time: `--timestamp` takes RFC3339 UTC (`<ISO-UTC-time>`, in the form `YYYY-MM-DDThh:mm:ss.sssZ`) or Unix seconds. It must be within the last 30 days.
- By bookmark: a bookmark taken earlier, such as one you saved from `info` before a risky migration.

To see which bookmark a time maps to, without changing anything:

```bash
pnpm exec wrangler d1 time-travel info <db> --env <env> --timestamp=<ISO-UTC-time>
```

It prints `⚠️ Timestamp '<time>' corresponds with bookmark '<bookmark>'` followed by the same suggested restore command.

Convert from IST carefully: IST is UTC+5:30, so 14:16 IST is 08:46 UTC. Pick a time a little before the damage; anything after it is lost.

## Not sure which time is right

A read-only query cannot target an older point. If you are unsure which time is right, you can restore **staging** to the candidate time and check it with step 6 before deciding for production. This **replaces everything currently in staging** and loses its later writes; only do it if that is acceptable, and note the undo bookmark (step 5) first.

## 4. Restore

Stop here if this is production and Firoz has not said go.

```bash
pnpm exec wrangler d1 time-travel restore <db> --env <env> --timestamp=<ISO-UTC-time>
# or, from a saved bookmark:
pnpm exec wrangler d1 time-travel restore <db> --env <env> --bookmark=<bookmark>
```

Wrangler 4.141.0 prints:

```
🚧 Restoring database <db> from bookmark <bookmark>
⚠️ This will overwrite all data in database <db>.
In-flight queries and transactions will be cancelled.
? OK to proceed (y/N)
```

Read the database name and the bookmark or time before typing `y` (in a non-interactive shell wrangler auto-answers yes, so check the command before running it). Then it prints `⚡️ Time travel in progress...`, `✅ Database <db> restored back to bookmark <bookmark>` and the **previous bookmark**. The restore took about 3 seconds on staging.

## 5. Note the bookmark for undo

The restore prints `↩️ To undo this operation, you can restore to the previous bookmark: <bookmark>` (no quotes or backticks around the bookmark). **Copy it into the rehearsal log or incident notes before doing anything else.** Restoring to that bookmark puts the database back as it was just before this restore, including the writes you rolled back:

```bash
pnpm exec wrangler d1 time-travel restore <db> --env <env> --bookmark=<previous-bookmark>
```

An undo is itself a restore: it replaces the whole database again, and writes made between the first restore and the undo are lost.

## 6. Verify (read-only)

Use `SELECT` only. Add `--remote` (without it `execute` uses a local file) and `--env`.

```bash
pnpm exec wrangler d1 execute <db> --env <env> --remote --command "SELECT count(*) AS users FROM users"
pnpm exec wrangler d1 execute <db> --env <env> --remote --command "SELECT count(*) AS relationships FROM coaching_relationships"
pnpm exec wrangler d1 execute <db> --env <env> --remote --command "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 3"
```

- [ ] Counts match what you expect for the chosen time.
- [ ] The newest migration name is the one you expect (see step 7).
- [ ] The damaged data is back as it was; a row you know was written after the point is gone.
- [ ] Staging: sign in on `https://app-staging.thefitbud.com/` and open a client; it loads. (Production: same on `https://app.thefitbud.com/`.)

## 7. Redeploy only if a migration was undone

If the restore went back past a migration that is on the deployed code, the code and the schema no longer agree.

- Compare the newest `d1_migrations` name (step 6) with the last file in `apps/api/drizzle/`.
- **Same:** nothing to deploy.
- **Database is behind the code:** either apply the missing migrations (`pnpm --filter @fitbud/api db:migrate:<env> --yes`, from the repo root) or roll the Worker back (Workers & Pages -> `fitbud-api-<env>` -> Deployments -> previous version -> Rollback). Prefer applying the migrations if the data from before them is what you wanted; roll back if the migration was the problem. Never edit an applied migration. Deploy steps: `docs/runbooks/trainer-web-deploy.md`.

## Rehearsal log

Firoz rehearses once on staging before the closed beta, and again after any change to this page. Fill a row each time, including real restores.

| Date | Env | Timestamp or bookmark restored to | Previous bookmark (undo) | Result (verify steps passed? time taken) |
|---|---|---|---|---|
| 2 Nov 2026, 16:39 IST | staging (`fitbud-staging`) | bookmark `00000001-00002824-00005117-e3c3efe6c6affe8b356a48d9e4e939ed` (taken after the I6 migrations, library seed and smoke test) | `00000001-ffffffff-00005117-4e1b7d6371b67315fa83cf158ba7997b` | Passed. A marker table created after the bookmark was gone after the restore; library counts unchanged (1362 exercise, 1243 food); users 0, relationships 0; newest migration `0033_reminder_attempt_marker.sql` matches `drizzle/`, so no redeploy; `/api/health` 200 afterwards. Restore ~3 s. Undo not run (it would only bring back the marker table). Sign-in check not done (no staging trainer account yet). |
