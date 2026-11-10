# Account deletion: "delete my account now" emails (support)

How support deletes a FitBud account for good straight away, when the person asks by email (task Z6-17; decisions D-W6-7 and D-W6-8 in `docs/specs/batches/W6.md`). Support (FitBud UI) or Firoz runs these steps; agents never do. The commands act on the real remote database, so read the whole page before the first one.

| Env | `--env` | D1 database (`apps/api/wrangler.toml`) |
|---|---|---|
| staging | `staging` | `fitbud-staging` |
| production | `production` | `fitbud-prod` |

Run commands from `apps/api`, signed in to the FitBud Cloudflare account (`pnpm exec wrangler whoami`). Replace `<db>` and `<env>` using the table above.

## How deletion works

- **In the app** (More → Privacy → Delete account, the Z6-14 flow) an account is **archived** for 6 months. The person can bring it back by signing in again. Archiving signs out every device, ends their coaching and stops pushes. A trainer must end coaching with every client first.
- **After 6 months** the purge job (`apps/api/src/jobs/account-purge.ts`) deletes it for good. The job runs with the existing cron, every 5 minutes, and takes a few accounts per run.
- **"Delete it now"** is this runbook: support sets the account's purge time to now, and the next purge run deletes it. There is no admin endpoint and no extra secret (D-W6-8).

What the purge does to an account:
- Deletes their sign-in (email, phone, password), the Firebase user, every session and device token, their notifications, settings and sign-in codes, their photos (R2 objects and records, see "Whose photos" below), and payment records in their coaching relationships (D-W6-22).
- Keeps what the other person's history needs: the coaching relationship, logs, check-ins, the coach's notes and reviews. The person's name shows as **Deleted user**. Their email and phone are removed from intake and check-in answers and from notes.
- Deletes other people's short-lived retry records (idempotency and sync receipts) only when they hold the person's email or phone, or hold the person's name together with one of the person's records (their account, a coaching relationship or an invitation to them). Someone else who happens to share the name keeps theirs (Z7-26).

**Whose photos (Z7-26).** A photo belongs to the client whose coaching relationship it is in, whoever uploaded it, with one exception: a `media_type='avatar'` photo a trainer uploaded is deleted when that trainer is purged, even inside a client's relationship.
- Purging a **client** deletes every photo in their relationships, including photos their coach uploaded for them.
- Purging a **trainer** deletes the avatars they uploaded (see the exception above). Other photos they uploaded into a client's relationship stay with that client, as part of the client's coaching history, and the client loses nothing.

**How names and phone numbers are found in kept text (Z7-26).** Email: the whole address in any letter case. Phone: the number as stored, the 10-digit national number, with or without the country code (with or without `+`) or a leading 0, with any spaces, dashes or tabs between digits (and real line breaks inside a JSON answer's text; a typed backslash-n is not treated as a line break), and a number saved as a plain number inside answers. Name: the whole name in any letter case, one-word names included, never part of a longer word. Short names are included ("Om" is replaced in "Om missed Tuesday" but "Omelette" and "room" stay), because matching is by whole word.
- The account row stays as an anonymous `disabled` row with no email, phone or name (D-W6-27, D-W6-28). Once purged, the account cannot be reactivated. If the person signs up again with the same email, they start a new, empty account.
- D1 Time Travel keeps 30 days of database history (`docs/runbooks/d1-restore.md`), so purged rows stay in those backups until the 30 days have passed. Never restore a backup just to undo one person's deletion.

## Never put personal data in a shell command

Shell history, terminal scrollback and screen recordings keep what you type. Commands on this page use the **user id** (a random UUID) only. Never paste the person's email address, phone number or name into a command, a ticket title, chat or this repository. To find the user id from the email, use step 2 (the Cloudflare dashboard) or the hidden-input shell option.

## 1. Verify the sender

The request must come **from the email address on the account**, or from the **phone number on the account** (for example by WhatsApp to the support number).

- [ ] Note the sender address or number from the email client. Do not copy it anywhere else.
- [ ] In step 2, confirm that this address (or number) is the one on the account. If it is not on any account, or it differs from what the account holds, **stop**. Reply that the request must come from the email or phone on the account, and do nothing else.
- [ ] A request for **someone else's** account (a trainer asking to delete a client, a family member) is refused. The person deletes their own account. A trainer can end coaching with a client in the app instead.

## 2. Find the user id

**Preferred: the Cloudflare dashboard.** Open the D1 database (`<db>`), then its Console tab. The dashboard is not a shell, so nothing lands in your shell history. Run, with the sender's email typed in lower case:

```sql
SELECT ui.user_id, u.account_state, u.purge_after
FROM user_identities ui JOIN users u ON u.id = ui.user_id
WHERE ui.email_norm = '<sender email, lower case>';
```

For a phone number, use `WHERE ui.mobile_e164 = '+<country code and number, digits only>'` instead (for example `+91` followed by the 10 digits).

- One row: that is the account. Note the `user_id` and the `account_state`. Clear the console afterwards.
- No row: the sender's address or number is not on any account (or the account was already purged, which removes the email). Reply that no FitBud account uses that address or number, and stop.

**If you must use a shell**, read the email without echoing it, so neither the history nor the screen keeps it. Stop if the address contains a quote character (`'`):

```bash
cd apps/api
read -r -s -p "Sender email: " FITBUD_LOOKUP; echo
pnpm exec wrangler d1 execute <db> --env <env> --remote --json \
  --command "SELECT ui.user_id, u.account_state, u.purge_after FROM user_identities ui JOIN users u ON u.id = ui.user_id WHERE ui.email_norm = lower('$FITBUD_LOOKUP')"
unset FITBUD_LOOKUP
```

The history keeps `$FITBUD_LOOKUP`, not the address.

## 3. Archive the account if it is not archived

Look at `account_state` from step 2:

- **`archived`**: go to step 4.
- **`active`**: the account must be archived through the Z6-14 flow first, because archiving is what ends coaching and signs out every device. Reply to the person and ask them to delete the account in the app (More → Privacy → Delete account), then tell you when it is done. Support cannot archive for them: there is no admin endpoint (D-W6-8), and archiving by hand in SQL would skip ending coaching and revoking sign-ins. A trainer must end coaching with each client first; the app tells them. When they confirm, run step 2 again and check that `account_state` is now `archived`.
  - If the person cannot delete in the app (the delete screens are not in their app version yet, or they cannot sign in), do not improvise. Pass the request to Firoz with the user id only.
- **`disabled`**: the account was switched off for another reason (a purged account no longer has an email, so step 2 cannot find it). Pass it to Firoz with the user id only.

## 4. Set the purge time to now

One statement, by user id. It changes the account only while it is archived:

```bash
cd apps/api
pnpm exec wrangler d1 execute <db> --env <env> --remote --json \
  --command "UPDATE users SET purge_after = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = '<user id>' AND account_state = 'archived'"
```

- The output's `meta.changes` must be **1**. If it is **0**, the account is not archived (or the id is wrong): go back to step 2. Never remove the `account_state = 'archived'` condition.
- Keep the timestamp format exactly as written. The purge compares it with its own clock as text, in the same format the API writes.

## 5. Confirm, then reply

The next purge run (within 5 minutes; a few accounts per run) deletes the account. Check by user id:

```bash
pnpm exec wrangler d1 execute <db> --env <env> --remote --json \
  --command "SELECT account_state, archived_at, purge_after FROM users WHERE id = '<user id>'"
```

- **Purged:** `account_state` is `disabled` and both dates are `null`. You can also check the identity is gone: `SELECT count(*) AS n FROM user_identities WHERE user_id = '<user id>'` returns `0`. The Worker logs carry one `account.purged` line with that user id (the API Worker's logs in the dashboard, `fitbud-api-<env>`), and never the email or phone.
- **Still `archived`** after 15 minutes: look for `account.purge_failed` with that user id in the Worker logs. Its `errorCode` says which step failed: `ACCOUNT_PURGE_MEDIA_FAILED` (R2), `FIREBASE_*` (Firebase, for example `FIREBASE_ADMIN_NOT_CONFIGURED` when the Worker secret `FIREBASE_SERVICE_ACCOUNT_JSON` is missing), or `ACCOUNT_PURGE_STEP_FAILED` (database). The account stays archived and every run tries again from the start, so a fixed cause needs no further step. Pass anything that keeps failing to Firoz with the user id and the error code.

Then reply to the person from tech@thefitbud.com:

> Your FitBud account has been deleted. Your sign-in, contact details and photos are gone, and the people you coached or trained with now see "Deleted user" in place of your name. If you sign up again with the same email, you start a new account.

Close the ticket. Keep only the user id and the date in the support log, never the email or phone.
