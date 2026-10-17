# Trainer web — handoff (guide v1.2)

Branch: `cursor/trainer-web-screens-09cc` → `cursor/stage1-foundation-a3da`.

## E2E

`pnpm --filter @fitbud/trainer-web test:e2e` — **5/5 passing** (global setup: `db:reset`, start API on `:8787`, Vite on `:5173`).

| Flow | Spec |
|------|------|
| Email OTP + dev mail sink | `email OTP sign-in via dev mail sink` |
| Attention ack + resolve | `home acknowledge then resolve` |
| Template → client draft | `apply a workout template from the library` |
| Client-visible note | `share a client-visible note` |
| End + reactivate | `end coaching then reactivate` |

## Screenshots

`pnpm --filter @fitbud/trainer-web capture:screens` after `pnpm db:reset` and API restart on `:8787`.

- **34 PNGs**, **34 distinct byte sizes** (see `docs/implementation/screens/trainer-web/manifest.json`).
- Capture logs in as demo trainer, waits per `data-testid`, fails on duplicate hashes or sign-in/error chrome.
- `TW-03` / `TW-15` use element screenshots (shell / version list) to avoid full-page duplicates.

## Per-screen status (visual + guide)

Legend: ✅ reviewed against capture + guide; ⚠️ works with documented seed/API limits; ❌ not verified / blocked.

| ID | Route / surface | Status | Notes |
|----|-----------------|--------|-------|
| TW-01 | `/sign-in` | ✅ | Password form, dev panel |
| TW-02 | `/welcome` | ✅ | `?capture=welcome` for post-auth wizard |
| TW-03 | App shell | ✅ | Sidebar element shot on `/checkins` |
| TW-04 | `/` Home | ✅ | Attention, coach asks |
| TW-05 | `/?exception=` drawer | ✅ | Ack / resolve |
| TW-06 | `/clients` roster | ✅ | Filters, ended link |
| TW-07 | `/clients/add` | ✅ | Invite + reactivate hint |
| TW-08 | `/invitations/:id` | ✅ | Pending invite from seed |
| TW-09 | Client overview | ⚠️ | Capture uses workspace-OK client (guided overview for Sneha); not Rohan slipping grid |
| TW-09a | Workspace header | ⚠️ | Full header on workspace-OK clients only |
| TW-10 | Onboarding tab | ✅ | Sneha review |
| TW-11 | Configure coaching | ✅ | Workspace-OK client |
| TW-12 | Plan tab (list) | ⚠️ | Aarav plan list in degraded shell (workspace validation error banner) |
| TW-13 | Workout template editor | ✅ | `/templates/workouts/:id` |
| TW-14 | Diet template editor | ✅ | Fixed hub slug → `nutrition` routing |
| TW-15 | Plan versions panel | ✅ | Element capture of version list |
| TW-16 | Publish & schedule modal | ✅ | `?assign=1` + seeded draft |
| TW-17 | Activity | ⚠️ | Degraded workspace client |
| TW-18 | Progress | ⚠️ | Degraded workspace client |
| TW-19 | Client check-ins | ⚠️ | Degraded workspace client |
| TW-20 | Check-in review | ✅ | Inbox item from seed |
| TW-21 | History | ⚠️ | Degraded workspace client |
| TW-22 | `/checkins` inbox | ✅ | |
| TW-23 | Templates hub workouts | ✅ | |
| TW-24 | Onboarding templates | ✅ | |
| TW-25 | Check-in templates | ✅ | |
| TW-26 | Libraries | ✅ | |
| TW-27 | Combined template editor | ✅ | |
| TW-28 | Profile settings | ✅ | |
| TW-29 | Notification settings | ⚠️ | Categories in localStorage until API schema exposes `trainerCategories` |
| TW-30 | Ended clients settings | ✅ | `/settings/ended` |
| TW-31 | Responsiveness drawer | ✅ | Overview Details or overflow menu |
| TW-32 | Coach ask drawer | ✅ | `/?ask=` when seeded |
| TW-33 | 404 | ✅ | |
| TW-34 | Note composer | ✅ | Overflow menu on guided overview |

## Tests

- `pnpm --filter @fitbud/trainer-web test` — unit tests
- `pnpm --filter @fitbud/trainer-web test:e2e` — Playwright (see above)

## Gaps file

See [`GAPS-trainer-web.md`](./GAPS-trainer-web.md).
