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

- Trainee smoke: `aarav.ontrack@demo.fitbud.test`
- Trainer smoke: `rahul.coach@demo.fitbud.test`
- Dual role: `karan.dual@demo.fitbud.test`

## Physical device against local API

### Android (Expo Go)

1. Install **Expo Go** from Play Store.
2. On your laptop: `pnpm api` and `cd apps/mobile && pnpm exec expo start` (LAN).
3. Set the API URL to your machine’s LAN IP (not `127.0.0.1` on the phone):
   - `export EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:8787` before `expo start`, or add to `apps/mobile/.env` (see `.env.example`).
4. Ensure phone and laptop share Wi‑Fi; allow port **8787** through the host firewall if needed.
5. Scan the QR code from the terminal (Expo Go). Sign in with demo email + password.

**Tunnel (Wi‑Fi blocked):** `pnpm exec expo start --tunnel` for the bundle only; the API must still be reachable (VPN, tailscale, or deploy API to a reachable host).

### iOS (Expo Go)

Same as Android. Use the Camera app / Expo Go to scan the QR code. For iOS simulator on Mac: `pnpm exec expo run:ios` with `EXPO_PUBLIC_API_BASE_URL` pointing at the host running Wrangler.

### Dev client (optional)

`pnpm exec expo run:android` / `run:ios` builds `@fitbud/mobile` with `expo-dev-client` (see `app.json`). Point `EXPO_PUBLIC_API_BASE_URL` at the API as above.

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @fitbud/mobile test
```

Screenshots (390×844, requires API + Expo web):

```bash
pnpm add -D playwright -w && pnpm exec playwright install chromium
# API + expo web running
node scripts/capture-mobile-screens.mjs http://127.0.0.1:8081
```

Output: `docs/implementation/screens/mobile/*.png`

## Per-screen status vs guide

Legend: ✅ navigable MVP aligned with guide · ⚠️ partial / gaps in `GAPS-mobile.md` · ❌ not implemented

### Trainee (TR)

| ID | Status | Primary component |
|----|--------|-------------------|
| TR-01 | ✅ | `screens/AuthScreen.tsx` + `screens/auth/*` (password + email OTP; WhatsApp disabled when `wa_otp` off) |
| TR-02 | ⚠️ | `AcceptInviteScreen.tsx` (preview token path; not universal links) |
| TR-03 | ✅ | `IntakeScreen.tsx` |
| TR-04 | ⚠️ | `WaitingReviewScreen.tsx` (checklist / auto-refresh partial) |
| TR-05 | ⚠️ | `trainee/setup/ReminderSetupScreen.tsx` |
| TR-06 | ⚠️ | `TodayTab.tsx` (rings, week strip, workout card; coach notes / steps partial) |
| TR-07 | ⚠️ | `DietTab.tsx` |
| TR-08 | ⚠️ | `SomethingDifferentSheet.tsx` |
| TR-09 | ⚠️ | `AssignedMealPlanScreen.tsx` |
| TR-10 | ⚠️ | `WorkoutOverviewScreen.tsx` |
| TR-11 | ✅ | `ActiveWorkoutScreen.tsx` |
| TR-12 | ✅ | `WorkoutSummaryScreen.tsx` |
| TR-13 | ✅ | `ProgressTab.tsx` |
| TR-14 | ✅ | `CheckinScreen.tsx` |
| TR-15 | ⚠️ | `NotificationsScreen.tsx` |
| TR-16 | ⚠️ | `settings/ReminderSettingsScreen.tsx` |
| TR-17 | ⚠️ | `settings/QuietHoursScreen.tsx` |
| TR-18 | ⚠️ | `ask/AskCoachSheet.tsx` |
| TR-19 | ⚠️ | `settings/SyncStatusScreen.tsx` + `SyncIndicator` |
| TR-20 | ⚠️ | `MoreScreen.tsx` + settings overlays |
| TR-21 | ⚠️ | `WidgetTipsScreen.tsx` (copy only) |
| TR-22 | ⚠️ | `EndedCoachingScreen.tsx` |
| TR-23 | ⚠️ | `DeepLinkUnavailableScreen.tsx` + `resolveLink` adapter |
| TR-24 | ⚠️ | `settings/MealTimesScreen.tsx` |
| TR-25 | ⚠️ | `settings/StepsSettingsScreen.tsx` (hidden when `steps_enabled` false) |
| TR-26 | ⚠️ | `FoodSearchScreen.tsx` |

Shell: `TraineeShell.tsx` · Overlays: `navigation/TraineeOverlay.tsx`

### Trainer mobile (TM)

| ID | Status | Primary component |
|----|--------|-------------------|
| TM-01 | ⚠️ | `AttentionTab.tsx` (cards + segments) |
| TM-02 | ⚠️ | `ClientsTab.tsx` |
| TM-03 | ⚠️ | `ClientStatusScreen.tsx` |
| TM-04 | ⚠️ | `ExceptionReviewScreen.tsx` |
| TM-05 | ⚠️ | `CheckinsTab.tsx` |
| TM-06 | ⚠️ | `CheckinReviewScreen.tsx` |
| TM-07 | ⚠️ | `trainer/MoreScreen.tsx` |
| TM-08 | ✅ | `RoleSelectScreen.tsx` |
| TM-09 | ⚠️ | `ActivityFeedScreen.tsx` (Clients → Activity) |

Tab indicator: **indigo** (`TrainerShell.tsx`).

## Architecture notes

- API access: `@fitbud/api-client` only; stage-1 methods via `lib/stage1Api.ts`.
- Tokens / type: `@fitbud/tokens`, `@fitbud/ui-mobile` (Inter + Noto Sans Devanagari on native).
- Config flags: `providers/ConfigProvider.tsx` → `GET /config`.
- No client-side `generate*Assignments` on Today/Diet (server must expose assignments).

Detailed gaps: [`GAPS-mobile.md`](./GAPS-mobile.md).
