# Trainer web — handoff (guide v1.2)

Branch: `cursor/trainer-web-screens-09cc` → `cursor/stage1-foundation-a3da`.

## Per-screen status

| ID | Route | Status | Notes |
|----|-------|--------|-------|
| TW-01 | `/sign-in`, `/sign-in/code`, `/forgot-password` | ✅ | Password + email OTP; WhatsApp OTP disabled when `wa_otp` false; dev test identity in DEV |
| TW-02 | `/welcome` | ✅ | 3-step wizard; skips when `trainerProfile.displayName` set |
| TW-03 | App shell | ✅ | Tokens, nav, offline banner, support mailto from `/config` |
| TW-04 | `/` | ✅ | One row per client, severity·age chip, cap 8 + View all; sections for ack, asks, re-engage, renewals |
| TW-05 | `/?exception=` drawer | ✅ | Acknowledge separate from Resolve; `/exceptions/:id` redirects here |
| TW-06 | `/clients` | ✅ | Existing roster; renewal filter via query (prior behaviour) |
| TW-07 | `/clients/add` | ✅ | Existing invite flow |
| TW-08 | `/invitations/:id` | ✅ | Reissue/revoke via http adapter |
| TW-09 | `/clients/:rid/overview` | ⚠️ | Overview cards; responsiveness/notes partially wired |
| TW-09a | Workspace header | ⚠️ | Timezone chip when API provides `traineeTimezone` |
| TW-10–TW-22 | Workspace tabs | ⚠️ | Prior screens retained; formatting/copy pass incomplete |
| TW-23 | `/templates/*` | ⚠️ | Six tabs + hub; scope filters via http adapter; check-ins tab placeholder |
| TW-24–TW-27 | Template builders | ⚠️ | Inline editors; dedicated routes not all split out |
| TW-28–TW-29 | `/settings/*` | ⚠️ | Profile + password; notifications JSON preview |
| TW-30 | End/reactivate | ⚠️ | API wired in stage1 client; UI modals not on all entry points |
| TW-31 | Responsiveness | ⚠️ | Shown in exception drawer; overview line pending |
| TW-32 | Coach asks on Home | ✅ | Mark answered |
| TW-33 | 404 | ✅ | `NotFoundPage` |
| TW-34 | Note composer | ⚠️ | Component ready; not on every entry point |

Legend: ✅ matches guide for demo; ⚠️ partial or needs polish.

## Deviations

- Check-in templates tab uses onboarding list placeholder until dedicated check-in template grid is built (see GAPS).
- Notification settings shows raw JSON until category toggles are implemented.

## Gaps file

See [`GAPS-trainer-web.md`](./GAPS-trainer-web.md).

## Tests

`pnpm --filter @fitbud/trainer-web test` — unit tests for auth/format/config/clients.

## Screenshots

Captured under `docs/implementation/screens/trainer-web/TW-*.png` (Playwright, 1440px) when API + web are running after `pnpm db:reset`.
