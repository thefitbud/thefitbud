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

**Typography:** Satoshi + Noto Sans Devanagari via `@fitbud/tokens` / `FontsProvider` (native TTF + Fontshare/Google on web).

**Expo web + API:** Web uses same-origin proxy `/__fitbud_api` (Metro) to avoid CORS; native still uses `EXPO_PUBLIC_API_BASE_URL` / LAN IP.

## Physical device against local API

### Android (Expo Go)

1. Install **Expo Go** from Play Store.
2. On your laptop: `pnpm api` and `cd apps/mobile && pnpm exec expo start` (LAN).
3. Set the API URL to your machine’s LAN IP (not `127.0.0.1` on the phone):
   - `export EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:8787` before `expo start`, or add to `apps/mobile/.env` (see `.env.example`).
4. Ensure phone and laptop share Wi‑Fi; allow port **8787** through the host firewall if needed.
5. Scan the QR code from the terminal (Expo Go). Sign in with demo email + password.

**Windows firewall:** Allow inbound TCP **8787** (Wrangler API) and **8081** (Metro) for Private networks, or temporarily allow `node.exe` / `workerd` when prompted.

**Tunnel (Wi‑Fi blocked):** `pnpm exec expo start --tunnel` for the bundle only; the API must still be reachable (VPN, Tailscale, or deploy API to a reachable host).

### iOS (Expo Go)

Same as Android. Use the Camera app / Expo Go to scan the QR code. For iOS simulator on Mac: `pnpm exec expo run:ios` with `EXPO_PUBLIC_API_BASE_URL` pointing at the host running Wrangler.

### Dev client (optional)

`pnpm exec expo run:android` / `run:ios` builds `@fitbud/mobile` with `expo-dev-client` (see `app.json`). Point `EXPO_PUBLIC_API_BASE_URL` at the API as above.

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @fitbud/mobile test
```

### Screenshots (390×844, Expo web)

```bash
pnpm add -D playwright -w && pnpm exec playwright install chromium
# API running; restart API after db:reset
cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787 EXPO_PUBLIC_SCREEN_CAPTURE=1 pnpm exec expo start --web --port 8081
node scripts/capture-all-mobile-screens.mjs http://127.0.0.1:8081
```

Output: `docs/implementation/screens/mobile/*.png` and `manifest.txt` (size + SHA-256).  
**35 captures** (TR-01–TR-26 except none skipped, TM-01–TM-09). Script fails on duplicate hashes or sign-in/error chrome.

**Meal assignments (dev):** `GET /meals/.../assignments` can return `LOCAL_DEV_ERROR` when seeded `energyKcalScaled` exceeds contract max. Mobile patches the client with a **`/me/day` fallback** (`lib/mealAssignmentFallback.ts`) so Diet / TR-08 work locally until the API seed is fixed (do not rely on this in production).

## Per-screen status vs guide

Legend: ✅ navigable, visually checked on web capture · ⚠️ partial / gaps · ❌ missing capture or major gap

| ID | Status | Notes |
|----|--------|--------|
| TR-01 | ✅ | Sign-in + OTP paths |
| TR-02 | ✅ | Accept invite (test token / needs-account-link) |
| TR-03 | ✅ | Intake (`vikram.onboarding`) |
| TR-04 | ✅ | Waiting review (`sneha.review`) |
| TR-05 | ✅ | Reminder setup + `expo-notifications` + OEM sheet |
| TR-06 | ⚠️ | Today: web uses simplified date/nutrition chrome; rings/week strip on native |
| TR-07 | ✅ | Diet (`lakshmi.foods`) |
| TR-08 | ⚠️ | “What did you have instead?” + serving presets; API fallback for assignments |
| TR-09 | ✅ | Meal plan overlay |
| TR-10 | ✅ | Workout overview |
| TR-11 | ⚠️ | Active workout via capture harness (not device-verified) |
| TR-12 | ⚠️ | Summary via capture harness |
| TR-13 | ✅ | Progress |
| TR-14 | ✅ | Check-in |
| TR-15 | ⚠️ | Notifications mark-read |
| TR-16–TR-20 | ⚠️ | Settings rows per §4; see GAPS |
| TR-21 | ✅ | Widget tips (copy) |
| TR-22 | ✅ | Ended coaching (`kavya.ended`; route fix for `onboardingStatus: ended`) |
| TR-23–TR-26 | ⚠️ | Deep link / meal times / steps / food search |
| TM-01–TM-09 | ⚠️ | Trainer tabs + overlays; TM-06/09 need device pass |
| TM-08 | ✅ | Role select (`karan.dual`) |

Detailed gaps: [`GAPS-mobile.md`](./GAPS-mobile.md).

## Architecture notes

- API: `@fitbud/api-client` + `lib/stage1Api.ts` (`updateMealTimes`, `getInvitationPreview`, etc.).
- UI: `@fitbud/tokens`, `@fitbud/ui-mobile` (Satoshi stack).
- Capture: `EXPO_PUBLIC_SCREEN_CAPTURE=1` enables `window.__fitbudCapture` for Playwright (`scripts/capture-all-mobile-screens.mjs`).
