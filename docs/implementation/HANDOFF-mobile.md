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

`pnpm api` runs Wrangler with `--ip 0.0.0.0` (port **8787**), so phones on the same LAN can reach the API when the firewall allows it.

### Android (Expo Go)

1. Install **Expo Go** from the Play Store.
2. On your laptop: `pnpm api` and `cd apps/mobile && pnpm exec expo start` (LAN mode).
3. Point the app at your machine’s **LAN IP**, not `127.0.0.1` on the phone:
   - `export EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:8787` before `expo start`, or set it in `apps/mobile/.env` (see `.env.example`).
4. Phone and laptop must be on the same Wi‑Fi. Open inbound **8787** (API) and **8081** (Metro) on the host firewall.
5. Scan the QR code in Expo Go and sign in with a demo account + `FitBud-demo-2026`.

**Windows firewall:** allow inbound TCP on **8787** and **8081** for private networks (Wrangler + Metro). If the phone cannot connect, temporarily test with the firewall off to confirm, then add a rule.

**Tunnel (Wi‑Fi blocked):** `pnpm exec expo start --tunnel` serves the JS bundle only; `EXPO_PUBLIC_API_BASE_URL` must still reach the API (VPN, Tailscale, or a deployed API).

### iOS (Expo Go)

Same as Android: scan the QR with Camera / Expo Go. Set `EXPO_PUBLIC_API_BASE_URL` to the host running `pnpm api`. On the iOS simulator (Mac): `pnpm exec expo run:ios` with the same API URL.

### Dev client (optional)

`pnpm exec expo run:android` / `run:ios` builds with `expo-dev-client`. Use the same `EXPO_PUBLIC_API_BASE_URL` as above.

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

**Meal assignments:** `GET /meals/.../assignments` returns **200** after stage1 seed fix (merged be8a1ec). No mobile fallback patch.

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
| TR-08 | ✅ | “You planned” prefill from assignment prescription items; bottom sheet (native page sheet / Android slide); portion chips, recent foods, serving API | vs Figma: no full macro comparison bar yet. |
| TR-09 | ✅ | Meal plan read-only | vs `figma_trainee_07_assigned_diet_plan.jpg`: no banned chat/grocery. |
| TR-10 | ✅ | Workout overview | vs `figma_trainee_03_active_workout` preamble only. |
| TR-11 | ⚠️ | Prev/next, overview, steppers, RPE chips, **90 s rest timer** (−15/+15/skip); capture uses live API | vs Figma: no ring progress / live activity. |
| TR-12 | ⚠️ | Summary after capture complete | Harness completes via `Complete workout`. |
| TR-13 | ✅ | Progress | No % judgement rings. |
| TR-14 | ✅ | Check-in | vs `figma_trainee_02_checkin` structure lighter. |
| TR-15 | ✅ | Today/Earlier, guide row title/body copy, mark read, deep link | |
| TR-16 | ✅ | Status card, category toggles, WhatsApp Coming soon, meal times, Android channels at startup | |
| TR-17 | ✅ | Quiet hours presets + 24 h preview bar | |
| TR-18 | ✅ | Ask coach sheet | wa.me prefill only. |
| TR-19 | ✅ | Queued / syncing / synced (last 10 or 24 h) / failed + retry | |
| TR-20 | ⚠️ | More rows per §4 | Timezone auto-detected per guide (no manual edit required on mobile). |
| TR-21 | ✅ | Widget tips | Copy only. |
| TR-22 | ✅ | Ended coaching | |
| TR-23 | ✅ | Deep link unavailable | |
| TR-24 | ⚠️ | Meal times | `updateMealTimes`. |
| TR-25 | ⚠️ | Steps toggle (`steps_enabled` false) | No HealthKit/Connect (accepted). |
| TR-26 | ⚠️ | Food search | Shared serving preset helper with TR-08. |
| TM-01 | ⚠️ | Swipeable Mark reviewed / Nudge + visible buttons | vs Figma: no KPI tiles. |
| TM-02 | ✅ | `GET /clients` with `adherenceState=needs_attention` (trainer-web parity) | |
| TM-03 | ✅ | Client status + timezone badge (`traineeTimezone` + diff vs trainer) | |
| TM-04 | ✅ | Exception review | Acknowledge vs Resolve sections separated. |
| TM-05 | ✅ | Check-ins inbox | |
| TM-06 | ✅ | Check-in review | |
| TM-07 | ✅ | Notifications (TW-29 categories), profile, web link, permission row, help mailto, switch role, sign out | |
| TM-08 | ✅ | Role select | |
| TM-09 | ✅ | Activity feed filters, client day grouping, row actions | API has no extra grouping; client day groups match guide. |

Detailed gaps: [`GAPS-mobile.md`](./GAPS-mobile.md).

## Architecture

- API: `@fitbud/api-client` + `stage1Api.ts` (`getTraineeFood`, `markNotificationRead`).
- UI: `@fitbud/tokens`, `@fitbud/ui-mobile`, `BottomSheet` for TR-08, `react-native-gesture-handler` swipe rows (TM-01).
- Food servings: `GET /me/foods/:foodId` via `foodServingsApi.ts`; heuristic fallback in `servingPresetsV2.ts` only on fetch failure.
- Capture: `EXPO_PUBLIC_SCREEN_CAPTURE=1` + `scripts/capture-all-mobile-screens.mjs`.
