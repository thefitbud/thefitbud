# Dependency advisories runbook

What `pnpm audit` reports, what Z11-7 fixed, and what is left and why. Decisions: D-W11-10 (no major upgrades), D-W11-F2 (native config on hold, so no native package is bumped, added or overridden, even transitively). No secret value belongs in this file.

## How to check

```bash
pnpm audit                       # full list
pnpm audit --audit-level critical
```

`pnpm audit` needs network access to the npm registry. Transitive fixes are `pnpm.overrides` in the root `package.json`, each limited to the parent's major line.

## Z11-7 result (12 Nov 2026, `main` at 5c457c1)

| | critical | high | moderate | low |
|---|---|---|---|---|
| Before | 4 | 52 | 45 | 12 |
| After | 3 | 29 | 19 | 1 |

`pnpm audit --audit-level critical` still exits non-zero: the 3 critical advisories left (`tinypool` x2, `tar`) each need a major upgrade (see below), which D-W11-10 rules out.

### Fixed (one family per commit)

| Package | Change | Kind |
|---|---|---|
| `drizzle-orm` | `^0.42.0` to `^0.45.2` (resolves 0.45.4), `apps/api` | direct dependency, next 0.x line |
| `shell-quote` (critical) | override `<1.11.0` to `^1.11.0` | JS-only, dev tooling under `react-devtools-core` |
| `vite` | override `<6.4.4` to `^6.4.4` | JS-only |
| `undici` 6.x and 7.x | overrides to `^6.29.1` and `^7.30.1` | JS-only |
| `postcss` | override `<8.5.18` to `^8.5.18` | JS-only |
| `source-map-js` | override `<1.2.2` to `^1.2.2` | JS-only |
| `node-forge` | override `<1.4.1` to `^1.4.1` | JS-only |

## Left, with reason and what would fix it

"Held for FitBud UI" means native config is on hold (D-W11-F2): the fix touches Expo or React Native or their tooling, or a package with native code, so it waits until native config work is allowed again.

| Severity | Package | Path (first) | Reason | What unblocks it |
|---|---|---|---|---|
| critical | `tinypool` (2 advisories) | `apps/api > vitest@3.2.7 > tinypool@1.1.1` | Major needed: fix is `tinypool` 2.1.2, vitest 3 pins `^1.1.1`. Dev-only (test runner). | Upgrade vitest to 4.x in a task that owns the test tooling (catalog entry in `pnpm-workspace.yaml`, all packages). |
| critical, high x8 | `tar` | `apps/mobile > @sentry/react-native > expo > @expo/cli > cacache > tar@6.2.1` | Major needed (6 to 7) and inside Expo CLI. Held for FitBud UI. Build-time only, the app bundle does not ship it. | Expo SDK upgrade (newer `@expo/cli`) as part of native config work. |
| high x13 | `@xmldom/xmldom` | `apps/mobile > @bacons/apple-targets > @bacons/xcode > @expo/plist > @xmldom/xmldom@0.7.13` | Held for FitBud UI: iOS native config plugin tooling, and the fix (0.8.15) is outside the parent's range. Build-time only. | Update `@bacons/apple-targets` or the Expo SDK when native config work resumes. |
| high x2 | `image-size` | `apps/mobile > expo > react-native > @react-native/community-cli-plugin > metro > image-size@1.2.1` | Held for FitBud UI: React Native Metro pin, and the fix is a major (2.0.3). Dev server only. | React Native / Expo SDK upgrade. |
| high x2 | `happy-dom` | `apps/api > vitest > happy-dom@20.14.6`, also `apps/mobile` and `apps/trainer-web` dev dependency `^20.14.6` | Major needed (20 to 21). Dev-only (test DOM). | Bump `happy-dom` to 21.x in all three places and run the web and mobile suites. Safe to do outside native config work. |
| high | `zod` | `apps/api > @fitbud/contracts > zod@3.25.76` | Major needed (3 to 4). Every contract schema is affected. | A dedicated zod 4 migration task. |
| high | `sharp` | `apps/api > @sentry/cloudflare > wrangler > miniflare > sharp@0.35.4` | Package with native code, so not touched under D-W11-F2. Only reached through the local wrangler dev tooling, not deployed. | Update `wrangler` / `miniflare` (brings `sharp` 0.35.5) once native packages may change. |

Moderate and low advisories were not triaged in Z11-7; re-run `pnpm audit` for the list (19 moderate, 1 low after this task). Most are the same Expo / React Native chains.

## Checks run for Z11-7

`pnpm install --frozen-lockfile` works after the change. The `pnpm-lock.yaml` diff against `main` was checked to list only these packages: `drizzle-orm`, `node-forge`, `shell-quote`, `source-map-js`, `undici`, `vite` (and the `vite` peer suffix of `@sentry/cloudflare`, `@vitejs/plugin-react`, `@vitest/mocker`), plus the `postcss` dedupe. None is an Expo, React Native or native package.
