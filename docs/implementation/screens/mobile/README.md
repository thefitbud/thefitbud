# Mobile screen captures (390×844)

Capture with Expo web or a device simulator after `pnpm api` and `expo start --web` (see `HANDOFF-mobile.md`).

```bash
node scripts/capture-mobile-screens.mjs http://127.0.0.1:8081
```

Files are named by guide screen ID (`TR-01.png`, `TM-01.png`, …).

**Note:** In this cloud run, Expo web bundled but hit a `react-native` vs `react-native-web` runtime error in headless Chromium, so automated captures may be blank until that is resolved on your machine. Use Expo Go on a physical device for authoritative screenshots.
