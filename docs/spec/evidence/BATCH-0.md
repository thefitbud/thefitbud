# Batch 0 evidence

Branch: `cursor/batch-0-foundation-cd97`  
Base: `cursor/stage1-foundation-a3da`  
Proof commands: `pnpm typecheck` (green), `pnpm exec turbo run test --force` (green).

Test counts (Node 22.23.3):

| Package | Tests |
|---|---|
| api | 208 passed |
| core | 121 passed |
| mobile | 52 passed |
| trainer-web | 21 passed |
| contracts | 22 passed |
| api-client | 7 passed |
| tokens | 7 passed |
| **Total** | **438 passed** |

## Item table

| # | Item | Result | Proof |
|---|---|---|---|
| 0.1 | Attention group-by-client before limit | PASS | `apps/api/src/routes/batch-0.test.ts` · `A1` |
| 0.2 | Ended relationships excluded | PASS | `batch-0.test.ts` · `A2` |
| 0.3 | Seed instants + mapper coerce | PASS | `batch-0.test.ts` · `A3` + `coerceIsoInstant` unit |
| 0.4 | Idempotent detection; ≤10 open/client | PASS | `batch-0.test.ts` · `A4` (≤10), `A4b` (human summaries), `A4c` (Aarav not critical; future meal slots not confirmed). Seed: `history.ts` slotReached + snack logging + capped Rohan overlays |
| 0.5 | Structured exception details; human summary | PASS | Core `exception.test.ts`; Home renders `labelFor("exception_type", …)`; mapper coerces `summary===type` |
| 0.6 | `clientWhatsappE164` | PASS | `batch-0.test.ts` · `A6`; mobile Nudge/Review pass `phoneE164` into `wa.me/{digits}` |
| 0.7 | Web `{data}` unwrap | PASS | `http-api.test.ts` |
| 0.8 | RequireAuth role check | PASS | `RequireAuth.test.tsx` + `A12` |
| 0.9 | Activity feed kcal ÷ scale | PASS | `batch-0.test.ts` · `A9` |
| 0.10 | Workout duration | PASS | `workoutDuration.test.ts` |
| 0.11 | No future seed events; sneha trainee-only | PASS | `A11` + `A12`; meal `slotReached` gate |
| 0.12 | `formatPersonName` greeting | PASS | Home `Hi, {formatPersonName(profile) first}` · AppShell sidebar uses profile `formatPersonName` (not email local-part). Live: web Home shows “Hi, Rahul” |
| 0.13 | `labels.ts` for every contract enum | PASS | `packages/core/src/labels.test.ts` covers every mapped contract enum value (incl. `renewal_state`); UI call sites use `labelFor` (Plan/Check-ins/Activity/History/Overview/Configure, mobile Today/Progress/Attention/workout/Activity). Underscore-replace helpers removed from WorkspaceHeader, LibrarySearch, clients label helpers |
| 0.14 | Core date formatters | PASS | `format.test.ts`; Clients/Plan/Templates/Check-ins/Overview/Workout/Diet use `formatCivilDate` / `formatInstant` / `formatRelative`. Check-ins roster shows client names (not UUID initials). Live: Overview relative times use middot separator (no `Dinner-7h`) |
| 0.15 | Token hex + `--radius` 16 | PASS | `brand-hex.test.ts`; `styles.css` |
| 0.16 | Satoshi + type scale | PASS | Expo `FontsProvider` loads TTFs via expo-font (Expo web: `Satoshi-Regular/SemiBold/Bold` status `loaded` on `/__specimens`). Specimen `B0-type.png` from live `/__specimens` |
| 0.17 | Button + OverflowMenu | PASS | Real components on `/__specimens` (web) and Expo `/__specimens`. Captures: `B0-buttons-web.png`, `B0-buttons-mobile.png` |
| 0.18 | StatusChip | PASS | Live `/__specimens` · `B0-chips.png` |
| 0.19 | Pull-to-refresh | PASS | Screen `onRefresh`; banned roleCheck hard-fails Refresh on cleaned mobile screens |
| 0.20 | Honest Week logo + Attention tab | PASS | Sidebar `BrandMark variant="inverse"` (white dots). Mobile tab title `"Attention"`; chip `formatAttentionAge` → `Since 2 days · +N more`. Live logo specimen `B0-logo.png` |
| 0.21 | Banned-strings hard-fail | PASS (harness) | `e2e/banned-strings.spec.ts`: `expect(hardErrors).toEqual([])` for cleaned routes (`/sign-in`, mobile sign-in/Workout/Progress/Notifications/Clients/More/Waiting). Other routes report-only. Regex includes `-7h ago` without requiring a space before `-` |

## Live visual checks (this pass)

- Web `/__specimens`: Button / Overflow / StatusChip / inverse logo / type — screenshots rewritten under `docs/spec/evidence/`.
- Expo web `/__specimens`: same components; Satoshi registered faces loaded (not all CSS `@font-face` aliases).
- Home greeting: profile first name via `formatPersonName`.
- Attention chip copy uses full `days` / lowercase `more`.

## Banned-strings remaining (report-only until screen batches)

Cleaned screens hard-fail. Expected remaining on Home/roster/workspace/Today/Attention until their batches (nav copy, etc.):

- `templates-and-libraries` (`Templates & Libraries` in sidebar — screen-batch TW-03)
- `help-and-support` (warn)
- Possible Home/workspace leftovers tracked in later batches

## Notes

- Prior HTML mock `b0-specimens.html` is superseded by app routes `/__specimens`.
- `pnpm db:reset` still required after seed changes when validating against a live D1/SQLite demo DB.
