# Staging setup checklist (Firoz)

Everything that must exist outside the repo before the first staging deploy (I6). Status as of 31 Oct 2026. Sources: `docs/tasks/beta-tasklist-v14.md` §6 (CF2), `docs/specs/batches/W1.md`, the W2 batch file (PR #80), `apps/api/wrangler.toml`, `apps/mobile/eas.json`, `docs/runbooks/physical-device.md`.

No secret values belong in this file, the repo, a PR or a chat. Keep them in your password vault. Agents have no production credentials and never run remote or deploy commands.

Status key: **Done** (seen in the repo or confirmed earlier) · **To do** · **Check** (not confirmed; tick it if it's already done).

## 1. Accounts

| Account | Status | Needed for |
|---|---|---|
| Cloudflare, Workers Paid plan + budget alert | Done (checked 30 Oct) | everything |
| Domain `thefitbud.com` on Cloudflare DNS, mail on Zoho (`tech@thefitbud.com`) | Done | DNS, email |
| Firebase projects `thefitbud-staging` and `thefitbud-prod` | Done (IDs and Web API keys are in `wrangler.toml`) | sign-in |
| Apple Developer and Google Play developer accounts | Done | X3, BT1 |
| ZeptoMail (Zoho), India region | To do | I5, OTP email |
| Expo / EAS project | To do | X3 dev build, X4a push |
| Sentry org | To do (not needed for the first staging deploy; BT2 uses it) | crash reporting |

## 2. Cloudflare resources

| Item | Status |
|---|---|
| D1 `fitbud-staging`, `fitbud-prod` (IDs in `wrangler.toml`) | Done, empty |
| R2 `fitbud-media-nonprod` (staging uses prefix `staging/`), `fitbud-media-prod` | Done |
| Queues `fitbud-jobs-staging`, `fitbud-jobs-staging-dlq` | Check: dashboard → Queues |
| Queues `fitbud-jobs-prod`, `fitbud-jobs-prod-dlq` | Check (needed for production, I6b) |

The names must match `apps/api/wrangler.toml` exactly, or the deploy fails.

## 3. Firebase (each project: staging first, prod later)

- [ ] **Check:** Authentication → Get started. No sign-in providers need turning on; the API only uses custom tokens.
- [ ] **To do:** Project settings → Service accounts → Generate new private key. That JSON file becomes the Worker secret `FIREBASE_SERVICE_ACCOUNT_JSON` (step 6). Vault only.
- [ ] **To do:** add an Android app with the variant's package: staging `com.thefitbud.mobile.staging`, prod `com.thefitbud.mobile`. Download its `google-services.json` (step 4).
- Done: the Web API key is a public var in `wrangler.toml` (D-W1-8). No iOS app is needed in Firebase.

## 4. Expo / EAS (for the phone build and push)

- [ ] Create the EAS project and send an agent the **project ID** (not a secret); it goes into `extra.eas.projectId` in the mobile config.
- [ ] Add `GOOGLE_SERVICES_JSON` as an EAS file env var per EAS environment (`docs/runbooks/physical-device.md` step 2).
- [ ] Let EAS create or upload the **APNs key** (iOS push) and upload the **FCM V1 service-account key** (Android push) for each app variant.
- [ ] Optional: an `EXPO_ACCESS_TOKEN` for push sending (Worker secret, step 6).
- [ ] Apple: App ID capabilities for App Groups and Live Activity (LA1). Also register the Live Activity widget's own bundle id (for the staging variant, `com.thefitbud.mobile.staging.widget`; EAS shows the exact id when it sets up credentials) and add it to the app's App Group (`group.com.thefitbud.mobile.staging`; production `group.com.thefitbud.mobile`).
- [ ] On the dev build, run the Live Activity device checklist in PR #105 (covers LA1, LA1b, LA1c) before Thu 12 Nov, with photos against frames 27, 27b and 27c.
- Then X3: the dev build on your phones, following `docs/runbooks/physical-device.md`.

## 5. ZeptoMail and DNS

- [ ] ZeptoMail: add the domain `thefitbud.com` and a mail agent; copy the **send token** (`ZEPTOMAIL_TOKEN`, step 6).
- [ ] DNS: ZeptoMail's DKIM TXT record and its bounce CNAME.
- [ ] DNS: **edit** the existing Zoho SPF TXT record to add ZeptoMail's include, giving `v=spf1 include:<zoho> include:<zeptomail> ~all`. Never add a second `v=spf1` record.
- [ ] Verify the domain in ZeptoMail. System mail goes from `no-reply@thefitbud.com`, with replies to `tech@thefitbud.com` (already set in `wrangler.toml`).
- Custom domains `api-staging.thefitbud.com` and `app-staging.thefitbud.com` are attached during the I6 deploy, following `docs/runbooks/trainer-web-deploy.md` (comes with WD1).

## 6. Worker secrets for staging

Set them from `apps/api`, one at a time; wrangler prompts for the value, so it never lands in shell history:

```bash
cd apps/api && npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON --env staging
```

| Secret | Status | Value |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | To do, required | the staging service-account JSON (step 3) |
| `MEDIA_SIGNING_SECRET` | To do, required | a new random value, for example from `openssl rand -base64 48`; a different value per env |
| `ZEPTOMAIL_TOKEN` | To do, required once I5 is merged | the ZeptoMail send token (step 5) |
| `EXPO_ACCESS_TOKEN` | Optional | Expo access token (step 4) |
| `SENTRY_DSN` | Later (BT2) | not read by any code yet |

`WA_*` secrets are not needed for the beta. Everything else (Firebase project ID and Web API key, auth, push and email modes, hosts, sender addresses) is already in `wrangler.toml` under `[env.staging.vars]`.

Production (I6b) repeats steps 2, 3 and 6 with the prod project, prod queues and `--env production`.

## 7. Housekeeping

- [ ] Rotate the old shared Confluence credentials (CF2 step 9).
- [ ] DS5: the legal page frame (Privacy, Terms, Credits and licences) into `docs/design/mockups/png/`, and counsel's text by Mon 9 Nov.

## 8. Code that must be on `main` before I6

**Done (31 Oct): all of W2 is merged**, including the rows below. The AU2 guard now accepts only providers that have a sender (push `expo`; email `zeptomail` or `disabled`), and refuses `zeptomail` until the `ZEPTOMAIL_TOKEN` secret is set: staging answers every request with `RUNTIME_MISCONFIGURED` until step 6 is done.

| Task | Why I6 needs it |
|---|---|
| I5 ZeptoMail sender | `EMAIL_PROVIDER = "zeptomail"`; without it the guard refuses every request |
| X4a Expo push sender | `PUSH_PROVIDER_MODE = "expo"`; same guard |
| WD1 web Worker + runbook | serves `app-staging.thefitbud.com` and forwards `/api` |
| OB1 observability | staging logs |
| AU1c client refresh (strongly advised) | without it, trainer web signs out when the 1-hour ID token expires |

## 9. First staging deploy (I6), in order

Follow `docs/runbooks/trainer-web-deploy.md` (merged with WD1). The outline:

1. Steps 1–6 above done for staging.
2. `pnpm --filter @fitbud/api db:migrate:staging`
3. `pnpm --filter @fitbud/api seed:library:staging` (includes the legacy wipe, D-W1 I2d)
4. `pnpm --filter @fitbud/api deploy:staging`, then the web Worker deploy.
5. Attach the custom domains and run the smoke test from the runbook.

Known at the time of I6 (not blockers):
- Trainer web doesn't open its realtime connection yet, so pages refresh on reload only. The runbook marks that smoke step as a known issue; don't roll back for it.
- A wrong `EXPO_ACCESS_TOKEN` shows only as `provider_error` on deliveries. If pushes fail, check that secret first.
- The `*.workers.dev` URLs of both Workers stay reachable alongside the custom domains.
