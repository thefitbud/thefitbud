# Physical-device dev build (iOS and Android)

How to put a FitBud development build on your own phone and point it at the local API or at staging. This is the guide for task X3. Agents never run `eas build` or `eas submit`; Firoz does.

**Expo Go cannot run this app.** It is on Expo SDK 52 with native targets (the Live Activity widget and its App Group), so it needs a dev build made with EAS.

## App variants

`apps/mobile/app.config.js` picks the variant from `APP_VARIANT`, which each EAS profile in `apps/mobile/eas.json` sets.

| EAS profile | `APP_VARIANT` | App name | Bundle id / package | App Group | API (`EXPO_PUBLIC_API_BASE_URL`) | Distribution |
|---|---|---|---|---|---|---|
| `development` | `development` | FitBud Staging | `com.thefitbud.mobile.staging` | `group.com.thefitbud.mobile.staging` | `https://api-staging.thefitbud.com` (see "Pointing the dev build at an API") | internal, dev client |
| `preview` | `staging` | FitBud Staging | `com.thefitbud.mobile.staging` | `group.com.thefitbud.mobile.staging` | `https://api-staging.thefitbud.com` | internal |
| `production` | `production` | FitBud | `com.thefitbud.mobile` | `group.com.thefitbud.mobile` | `https://api.thefitbud.com` | store |

- Staging and production have different bundle ids, so both can be installed side by side.
- The development build uses the staging identity (and the `thefitbud-staging` Firebase Android app). It replaces a `preview` install on the same phone.
- Firebase projects: staging uses `thefitbud-staging`, production uses `thefitbud-prod`.
- An unset `APP_VARIANT` (a plain local `expo start`) means `development`. Any other value makes the config fail.

## Prerequisites

- A Mac is needed only for local iOS builds. EAS builds in the cloud, so Linux or Windows works for `eas build`.
- Node 22.23+ and pnpm 9.15.4; `pnpm install` at the repo root.
- An **Expo account** that owns the FitBud project, and the EAS CLI: `npm install -g eas-cli`, then `eas login`.
- **iOS:** an Apple Developer account (paid). EAS creates the certificates, provisioning profiles and App IDs (including the App Group) when you build. Each phone must be registered for internal distribution (below).
- **Android:** the `google-services.json` for the variant, downloaded from the Firebase console (Project settings → Your apps → the Android app with the variant's package name). A Google Play account is not needed for a dev build.

## One-time EAS setup

1. `cd apps/mobile`, then `eas init`. It links the folder to the Expo project.
   - Because the config is dynamic (`app.config.js`), `eas init` may ask you to add `extra.eas.projectId` yourself. The project id is not a secret: add `"extra": { "eas": { "projectId": "<id>" } }` to `apps/mobile/app.json` in a small PR.
2. Add the Firebase Android config as an **EAS file environment variable** named `GOOGLE_SERVICES_JSON`, one per EAS environment:
   - `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./path/to/staging/google-services.json --environment development --visibility secret`
   - The same with `--environment preview` (staging file) and `--environment production` (the `thefitbud-prod` file).
   - Keep the downloaded files outside the repo (for example in `~/Downloads` or your vault), and delete them once uploaded.
   - At build time EAS writes the file to a temporary path and sets `GOOGLE_SERVICES_JSON` to it; `app.config.js` passes that path to `android.googleServicesFile`. When the variable is not set (local runs), no Firebase file is used.
3. iOS devices: `eas device:create`, then open the link on each iPhone to register it for internal distribution. On iOS 16+ turn on **Settings → Privacy & Security → Developer Mode** after the first install.

## Build

From `apps/mobile`:

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

- iOS: the first build asks to sign in to Apple and to create the certificate, provisioning profile and App Group. Say yes.
- Android: the build is an `.apk` for internal distribution.
- `preview` builds (`--profile preview`) are standalone staging builds with the JS bundle embedded. `production` is for store builds (task BT1), not for X3.

## Install on the phone

- When the build finishes, EAS prints a link and a QR code. Open it on the phone (or scan the QR code with the camera) and install.
- iOS: if the app does not open, check that the phone was registered before the build (rebuild after `eas device:create` if not) and that Developer Mode is on.
- Android: allow installs from the browser when asked.

## Pointing the dev build at an API

A development build loads its JavaScript from Metro on your computer, so the API URL comes from **your computer's environment when Metro starts**, not from `eas.json`. Expo inlines `EXPO_PUBLIC_API_BASE_URL` into the bundle (`apps/mobile/src/lib/api.ts`).

**Local API over LAN** (phone and computer on the same Wi-Fi):

1. From the repo root: `pnpm setup:local`, `pnpm db:reset`, then `pnpm api`. The API listens on port 8787 on all interfaces (`0.0.0.0`).
2. In another terminal: `pnpm mobile` (runs `expo start --dev-client`) with `EXPO_PUBLIC_API_BASE_URL` **unset**.
3. Open the dev build on the phone and pick the Metro server (or scan the QR code Metro prints).
4. The app uses `http://127.0.0.1:8787` and rewrites the loopback host to your computer's LAN address (the host Metro was loaded from). If that does not work, set it explicitly: `EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-IP>:8787 pnpm mobile`.
5. Sign in with a demo account from `docs/LOCAL_TESTING.md` (password `FitBud-demo-2026`).

**Staging API:**

```bash
EXPO_PUBLIC_API_BASE_URL=https://api-staging.thefitbud.com pnpm mobile
```

- Staging exists only after the first staging deploy (I6). Staging uses real Firebase sign-in (`AUTH_MODE=firebase`), so demo passwords and test tokens do not work there.

A `preview` build has the staging URL built in and needs no Metro.

## Where secrets live

- **EAS** (encrypted, per environment): `GOOGLE_SERVICES_JSON`, the Apple credentials EAS manages, the APNs key and the FCM V1 service-account key (push, later tasks).
- **Cloudflare Worker secrets** (API, set with `wrangler secret put` per env): `FIREBASE_SERVICE_ACCOUNT_JSON`, `MEDIA_SIGNING_SECRET` and the rest.
- **Never** in the repo, in chat, in screenshots, in issues or PRs, or in logs. `google-services.json` and `GoogleService-Info.plist` are never committed. The Firebase **web** API keys in `apps/api/wrangler.toml` are public identifiers and are the only Firebase keys in the repo.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Expo Go opens and shows an error | Expo Go cannot run this app. Install the dev build. |
| `Unknown APP_VARIANT "…"` | Use `development`, `staging` or `production` (set by the EAS profile). |
| Android build fails on `google-services.json` or a package-name mismatch | The `GOOGLE_SERVICES_JSON` file for that EAS environment must come from the Firebase Android app whose package matches the variant (`com.thefitbud.mobile.staging` for development and preview). |
| The app cannot reach the local API | Same Wi-Fi for phone and computer; `pnpm api` running; no firewall on port 8787; try `EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:8787`. Restart Metro with `--clear` after changing the variable. |
| The app keeps using the old API URL | `EXPO_PUBLIC_*` values are inlined when Metro bundles. Restart Metro with `pnpm mobile -- --clear`. |
| The dev build cannot find Metro | Same Wi-Fi; enter the URL Metro prints by hand in the dev launcher; or run `expo start --dev-client --tunnel`. |
| iOS: "Unable to install" or "untrusted developer" | Register the phone (`eas device:create`) and rebuild; turn on Developer Mode. |
| Live Activity does not appear | It needs the widget target from LA1 (`@bacons/apple-targets`); until then the dev build has the App Group entitlement but no widget. |

## Device checklist (X3)

- [ ] The development build installs on the iPhone and on the Android phone.
- [ ] Against the local API over LAN: sign in with a demo account and see Today.
- [ ] Against staging (after I6): sign in with a real account.
- [ ] Live Activity appears during a workout (once the LA1 widget target is in the build).
