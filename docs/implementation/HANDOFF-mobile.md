# FitBud mobile — handoff

Branch: `cursor/mobile-screens-a8e8` → base `cursor/stage1-foundation-a3da`  
Guide: `docs/implementation/guide/FitBud_UIUX_Implementation_Guide.md` v1.2

## Run locally (simulator / web)

```bash
export PATH="/home/ubuntu/.nvm/versions/node/v22.23.3/bin:$PATH"
pnpm install
pnpm db:reset
pnpm api                    # http://127.0.0.1:8787
cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787 pnpm exec expo start --web
```

Demo password: **`FitBud-demo-2026`** (see `HANDOFF-stage1.md` for accounts).

**Typography:** Satoshi + Noto Sans Devanagari via `@fitbud/tokens` / `FontsProvider`.

**Expo web + API:** Metro `/__fitbud_api` proxy; native uses `EXPO_PUBLIC_API_BASE_URL` / LAN IP.

## Physical device against local API

See prior sections in git history for Android/iOS Expo Go, Windows firewall (8787 + 8081), and tunnel fallback.

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @fitbud/mobile test
```

### Screenshots (390×844, Expo web)

```bash
cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787 EXPO_PUBLIC_SCREEN_CAPTURE=1 pnpm exec expo start --web --port 8081
node scripts/capture-all-mobile-screens.mjs http://127.0.0.1:8081
```

**35 captures** in `docs/implementation/screens/mobile/` + `manifest.txt` (distinct SHA-256).

**Meal assignments:** `GET /meals/.../assignments` still returns **500** on current `stage1` seed (`energyKcalScaled` validation). Mobile keeps `lib/mealAssignmentFallback.ts` until foundation branch returns **200** — remove patch + tests when backend lands.

## Per-screen status vs guide

Legend: ✅ matches guide closely on web capture · ⚠️ partial · ❌ blocked

| ID | Status | Notes | Visual diff vs `guide/img/` |
|----|--------|--------|-----------------------------|
| TR-01 | ✅ | Sign-in + OTP | Aligns with `impl_d1440_01_signin` (simpler, no marketing chrome). |
| TR-02 | ✅ | Accept invite | No Figma frame; copy matches §3. |
| TR-03 | ✅ | Intake | Checklist layout; no reference frame. |
| TR-04 | ✅ | Waiting review | Matches review-waiting copy. |
| TR-05 | ✅ | Reminders + OEM sheet | No streaks; utility copy only. |
| TR-06 | ⚠️ | Today + week strip on web (`WebDateHeading`); rings as kcal line on web | vs `figma_trainee_01_today.jpg`: no Figma streak/%, no dense workout list; we show rest day + coach note + check-in (guide-compliant). |
| TR-07 | ✅ | Diet + rings | vs `figma_trainee_05_today_diet.jpg`: no grocery/chat; meal cards simpler. |
| TR-08 | ⚠️ | Portion chips (½×–1½×), repeat recent (`/me/foods/recent`), v2 serving chips from seed bundle + search | vs guide: planned-item prefill blocked on assignment API; sheet height still web-modal. |
| TR-09 | ✅ | Meal plan read-only | vs `figma_trainee_07_assigned_diet_plan.jpg`: no banned chat/grocery. |
| TR-10 | ✅ | Workout overview | vs `figma_trainee_03_active_workout` preamble only. |
| TR-11 | ⚠️ | Active workout set logging | vs Figma: no live-activity / swipe exercise nav yet. |
| TR-12 | ⚠️ | Summary screen | Capture harness; RPE row present. |
| TR-13 | ✅ | Progress | No % judgement rings. |
| TR-14 | ✅ | Check-in | vs `figma_trainee_02_checkin` structure lighter. |
| TR-15 | ⚠️ | Today/Earlier sections + mark read + deep link | vs guide: row copy still type-driven; routing wired. |
| TR-16 | ⚠️ | Category toggles, WhatsApp Coming soon, meal times link | vs §4: status card / Android channels not fully surfaced. |
| TR-17 | ⚠️ | Quiet hours presets | No 24h preview bar. |
| TR-18 | ✅ | Ask coach sheet | wa.me prefill only. |
| TR-19 | ⚠️ | Sync status | Engine events not fully wired. |
| TR-20 | ⚠️ | More rows per §4 | No in-app timezone edit. |
| TR-21 | ✅ | Widget tips | Copy only. |
| TR-22 | ✅ | Ended coaching | |
| TR-23 | ✅ | Deep link unavailable | |
| TR-24 | ⚠️ | Meal times | `updateMealTimes`. |
| TR-25 | ⚠️ | Steps toggle | No HealthKit/Connect. |
| TR-26 | ⚠️ | Food search | Serving presets on TR-08; TR-26 list basic. |
| TM-01 | ⚠️ | **Today** title; one card/client; Mark reviewed + Nudge | vs `figma_trainer_01_home.jpg`: no KPI tiles; cards not swipe (buttons instead). |
| TM-02 | ⚠️ | Clients + Activity segment | vs `figma_trainer_02_clients.jpg`: filter icons partial. |
| TM-03 | ⚠️ | Client status | Week dots / timezone badge partial. |
| TM-04 | ✅ | Exception review | Acknowledge vs Resolve sections separated. |
| TM-05 | ✅ | Check-ins inbox | |
| TM-06 | ✅ | Check-in review | |
| TM-07 | ⚠️ | Trainer more | |
| TM-08 | ✅ | Role select | |
| TM-09 | ⚠️ | Activity feed filters + paging | No row actions. |

Detailed gaps: [`GAPS-mobile.md`](./GAPS-mobile.md).

## Architecture

- API: `@fitbud/api-client` + `stage1Api.ts`; `mealAssignmentFallback.ts` until meal list API fixed.
- UI: `@fitbud/tokens`, `@fitbud/ui-mobile`, `BottomSheet` for TR-08.
- Capture: `EXPO_PUBLIC_SCREEN_CAPTURE=1` + `scripts/capture-all-mobile-screens.mjs`.
