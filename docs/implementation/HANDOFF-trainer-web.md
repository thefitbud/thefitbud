# Trainer web — handoff (guide v1.2)

Branch: `cursor/trainer-web-screens-09cc` → `cursor/stage1-foundation-a3da` (includes `be8a1ec` demo nutrient seed fix + `trainerCategories` on preferences).

## E2E

`pnpm --filter @fitbud/trainer-web test:e2e` — **5/5 passing** after `pnpm db:reset` and API on `:8787`.

## Screenshots

`pnpm --filter @fitbud/trainer-web capture:screens` — **34 distinct PNG sizes**, duplicate hash guard, demo trainer login. Manifest: `docs/implementation/screens/trainer-web/manifest.json`.

## Per-screen status

| ID | Route / surface | Status | Notes |
|----|-----------------|--------|-------|
| TW-01 | `/sign-in` | ✅ | |
| TW-02 | `/welcome` | ✅ | |
| TW-03 | App shell | ✅ | Element shot on `/checkins` |
| TW-04 | `/` Home | ✅ | |
| TW-05 | Exception drawer | ✅ | |
| TW-06 | `/clients` | ✅ | |
| TW-07 | `/clients/add` | ✅ | |
| TW-08 | `/invitations/:id` | ✅ | |
| TW-09 | Overview grid | ✅ | Rohan slipping (post seed fix) |
| TW-09a | Workspace header | ✅ | Rohan workspace |
| TW-10 | Onboarding tab | ✅ | Sneha review |
| TW-11 | Configure coaching | ✅ | Rohan |
| TW-12 | Plan tab | ✅ | Rohan workspace |
| TW-13 | Workout template editor | ✅ | |
| TW-14 | Diet template editor | ✅ | |
| TW-15 | Plan versions panel | ✅ | Element capture |
| TW-16 | Assign/publish modal | ✅ | |
| TW-17 | Activity | ✅ | Rohan |
| TW-18 | Progress | ✅ | Rohan |
| TW-19 | Client check-ins | ✅ | Rohan |
| TW-20 | Check-in review | ✅ | |
| TW-21 | History | ✅ | Rohan |
| TW-22 | `/checkins` inbox | ✅ | |
| TW-23–TW-27 | Templates | ✅ | |
| TW-28 | Profile settings | ✅ | |
| TW-29 | Notification settings | ✅ | `trainerCategories` via GET/PUT preferences |
| TW-30 | Ended clients | ✅ | |
| TW-31 | Responsiveness drawer | ✅ | Rohan overview |
| TW-32 | Coach ask drawer | ✅ | |
| TW-33 | 404 | ✅ | |
| TW-34 | Note composer | ✅ | Rohan |

## Gaps

See [`GAPS-trainer-web.md`](./GAPS-trainer-web.md).
