# Trainer web — handoff (guide v1.2)

Branch: `cursor/trainer-web-screens-09cc` → `cursor/stage1-foundation-a3da`.

## Per-screen status

| ID | Route | Status | Notes |
|----|-------|--------|-------|
| TW-01 | `/sign-in`, `/sign-in/code`, `/forgot-password` | ✅ | Password + email OTP; WhatsApp OTP disabled when `wa_otp` false |
| TW-02 | `/welcome` | ✅ | 3-step wizard |
| TW-03 | App shell | ✅ | Tokens, nav, offline banner, support mailto |
| TW-04 | `/` | ✅ | Attention rows, cap 8, coach asks, re-engage, renewals |
| TW-05 | `/?exception=` drawer | ✅ | Acknowledge + resolve; note via exception flow |
| TW-06 | `/clients` | ✅ | Roster, filters, ended clients link to workspace |
| TW-07 | `/clients/add` | ✅ | Invite + reactivate hint for prior clients |
| TW-08 | `/invitations/:id` | ✅ | Reissue/revoke via http adapter |
| TW-09 | `/clients/:rid/overview` | ✅ | Guide cards, week, notes, responsiveness |
| TW-09a | Workspace header | ✅ | Tabs, timezone chip (API or adapter), overflow actions |
| TW-10–TW-22 | Workspace tabs | ✅ | Existing tab pages + header/modals wired |
| TW-13/14 | Plan builder route | ✅ | `/clients/:rid/plan/:planId/versions/:versionId/edit` |
| TW-16 | Assign/publish | ✅ | `AssignPlanModal` + plan tab publish |
| TW-23 | `/templates/*` | ✅ | Six tabs, scope filters, real check-ins + onboarding |
| TW-24–TW-27 | Template builders | ✅ | Dedicated routes under `/templates/.../:tid` |
| TW-28–TW-29 | `/settings/*` | ✅ | Profile, notifications UI (categories in localStorage until API) |
| TW-30 | End/reactivate | ✅ | Header, settings ended list, roster reactivate |
| TW-31 | Responsiveness | ✅ | Overview line + drawer |
| TW-32 | Coach asks on Home | ✅ | Mark answered |
| TW-33 | 404 | ✅ | `NotFoundPage` |
| TW-34 | Note composer | ✅ | Workspace overflow, overview, modals |
| Links | `/links/resolve` | ✅ | Deep link resolver → in-app route |

Legend: ✅ matches guide for demo; see GAPS for API follow-ups.

## Tests

- `pnpm --filter @fitbud/trainer-web test` — unit tests
- `pnpm --filter @fitbud/trainer-web test:e2e` — Playwright (API + web dev servers)

## Screenshots

`pnpm --filter @fitbud/trainer-web capture:screens` with API on `:8787` and web on `:5173` after `pnpm db:reset`.

## Gaps file

See [`GAPS-trainer-web.md`](./GAPS-trainer-web.md).
