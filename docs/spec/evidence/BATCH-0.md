# Batch 0 evidence

Branch: `cursor/batch-0-foundation-cd97`  
Base: `cursor/stage1-foundation-a3da`  
Proof commands: `pnpm typecheck` (green), `pnpm test` (green), `pnpm db:reset` (complete), banned-strings Playwright (see below).

Test counts (`pnpm test`, Node 22.23.3):

| Package | Tests |
|---|---|
| api | 206 passed |
| core | 121 passed |
| mobile | 52 passed |
| trainer-web | 21 passed |
| contracts | 22 passed |
| api-client | 7 passed |
| tokens | 7 passed |
| **Total** | **436 passed** |

## Item table

| # | Item | Result | Proof |
|---|---|---|---|
| 0.1 | Attention group-by-client before limit | PASS | `apps/api/src/routes/batch-0.test.ts` · `A1: attention groupBy=relationship returns separate client groups; limit counts groups` |
| 0.2 | Ended relationships excluded (inbox/attention/feed/Home) | PASS | `batch-0.test.ts` · `A2: ended Kavya and Nikhil absent from inbox and attention`; filters in `routes/checkins.ts`, `domain/exceptions.ts`, `routes/activity-feed.ts` |
| 0.3 | Seed `detected_at`/`acknowledged_at` full instants; mapper tolerant | PASS | `batch-0.test.ts` · `A3: Meera exception GET returns 200 with coerced detectedAt`; `coerceIsoInstant` unit test |
| 0.4 | Idempotent detection; realistic exception volume | PASS | `batch-0.test.ts` · `A4: open exceptions per client stay realistic after attention evaluate` (≤12/group); `DETECTION_LOOKBACK_DAYS=3` in `domain/exceptions.ts:35` without resolving aged open items |
| 0.5 | Structured exception details; no ISO in `summary` | PASS (core) / FAIL (Home UI) | Unit: `packages/core/src/exception.test.ts`; Home still hits `iso-date` (`2026-10-15`) — see banned-strings report (screen batches) |
| 0.6 | `clientWhatsappE164` in workspace header / re-engage | PASS | `batch-0.test.ts` · `A6: workspace header includes clientWhatsappE164`; contract `packages/contracts/src/workspace.ts:113`; `WorkspaceHeader.tsx` |
| 0.7 | Web `{data}` envelope unwrapped | PASS | `apps/trainer-web/src/lib/http-api.test.ts` |
| 0.8 | RequireAuth role check (trainee-only) | PASS | `apps/trainer-web/src/layout/RequireAuth.test.tsx` · `includes the client-account message`; decision 20 via `A12` |
| 0.9 | Activity feed kcal ÷ NUTRIENT_SCALE | PASS | `batch-0.test.ts` · `A9: activity feed kcal is divided by NUTRIENT_SCALE` |
| 0.10 | Workout duration from events | PASS | `apps/mobile/src/trainee/workoutDuration.test.ts` |
| 0.11 | No future-dated seed events; sneha.review trainee-only | PASS | `batch-0.test.ts` · `A11` + `A12/decision 20: sneha.review is trainee-only` |
| 0.12 | Seed display names title-cased; `formatPersonName()` | PASS (seed/API) / FAIL (Home UI) | `batch-0.test.ts` · `A13`; `packages/core/src/format.test.ts` title-case; Home still hits `lowercase-demo-name`=`rahul` (nav/account chrome — screen batches) |
| 0.13 | `packages/core/src/labels.ts` for every API enum | PASS | `packages/core/src/labels.test.ts` · `covers every value of core contract enums`; mobile `trainer/labels.ts` + web `HomePage.tsx` wired |
| 0.14 | Date/time formatter in `packages/core/src/format.ts` | PASS | `packages/core/src/format.test.ts` (`Thu 15 Oct`, `7:30 am`, clamped relative); web `lib/format.ts` + mobile `lib/dates.ts` re-export |
| 0.15 | Token hex fixes + web `--radius` 16 | PASS | `packages/tokens/src/brand-hex.test.ts`; `tokens.ts:7–8`; `styles.css` `--radius: 16px` |
| 0.16 | Satoshi single web import; native 600; body 16 / display 28; touch 48 | PASS | Web: only `index.html` Fontshare import (styles.css has Noto only); `FontsProvider.tsx` Satoshi-600; `typography.ts` body 16 / display 28; `theme.ts` `touchTargetMin=48`; specimen `evidence/B0-type.png` |
| 0.17 | Button hierarchy + OverflowMenu (web + mobile) | PASS | `apps/trainer-web/src/components/Button.tsx`, `OverflowMenu.tsx`; `apps/mobile/src/components/Button.tsx`, `OverflowMenu.tsx`; specimens `B0-buttons-web.png`, `B0-buttons-mobile.png` |
| 0.18 | StatusChip with Lucide icons (attention amber) | PASS | Web + mobile `StatusChip.tsx` (attention `#FFFBEB`/`#B45309`); specimen `B0-chips.png` |
| 0.19 | Pull-to-refresh Screen; remove 7 manual Refresh buttons | PASS | `Screen.tsx` `onRefresh` + RefreshControl; 7 list screens wired; no `label="Refresh"` remaining; banned-strings mobile roleCheck did not report `manual-refresh-button` on Today/Attention |
| 0.20 | Honest Week four-dot logo | PASS | `BrandMark.tsx` (web + mobile); `AppShell.tsx` uses mark; specimen `B0-logo.png` from `packages/brand/logo/mark.svg` |
| 0.21 | Banned-strings Playwright (web + Expo web) | PASS (harness) | `e2e/banned-strings.spec.ts` (+ `playwright.banned.config.ts` for seeded-API runs); reports in `evidence/banned-strings-web.json`, `banned-strings-mobile.json` |

## Banned-strings remaining hits (expected until screen batches)

Command:

```bash
EXPO_WEB_URL=http://127.0.0.1:8081 pnpm exec playwright test --config=playwright.banned.config.ts
# Expo must run with EXPO_PUBLIC_SCREEN_CAPTURE=1 so __fitbudCapture is available
```

### Trainer web — Home `/`

| id | match |
|---|---|
| iso-date | `2026-10-15` |
| snake-case | `missed_workout` |
| good-to-see-you | `Good to see you` |
| templates-and-libraries | `Templates & Libraries` |
| lowercase-demo-name | `rahul` |
| help-and-support (warn) | `Help & Support` |

### Trainer web — roster `/clients`

| id | match |
|---|---|
| templates-and-libraries | `Templates & Libraries` |
| help-and-support (warn) | `Help & Support` |

### Trainer web — client workspace `/clients/f2a64fdb-…`

| id | match |
|---|---|
| iso-date | `2026-09-22T00:00`, `2026-10-18`, `2026-10-19`, `2026-10-20`, `2026-10-21` |
| templates-and-libraries | `Templates & Libraries` |
| help-and-support (warn) | `Help & Support` |
| 24h-time (warn) | `00:00` |

### Mobile Today (TR-06 via capture bridge)

| id | match |
|---|---|
| iso-date | `2026-10-18` |

### Mobile trainer Attention (TM-01 via capture bridge)

| id | match |
|---|---|
| snake-case | `missed_workout` |

## Notes

- `pnpm db:reset` completed successfully after Batch 0 seed changes (demo accounts listed; no UNIQUE constraint failures).
- RequireAuth sneha E2E browser path is covered by unit gate + `/me` role API test; full sign-in E2E against trainer web as sneha is left to screen-batch TR-04/TM-08 runs.
- Specimen HTML source: `evidence/b0-specimens.html` (not a product screen).
