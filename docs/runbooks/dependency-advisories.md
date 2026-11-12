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

Every override is scoped to the vulnerable range and its target stays inside every affected parent's declared range.

| Package | Override | Parent range it must satisfy | Kind |
|---|---|---|---|
| `shell-quote` (critical) | `shell-quote@>=1.8.4 <1.11.0` to `^1.11.0` | `react-devtools-core` declares `^1.6.1` | JS-only, dev tooling |
| `vite` | `vite@>=6 <6.4.4` to `^6.4.4` | direct dependency `^6.3.2`, peer ranges of `@sentry/cloudflare`, `@vitejs/plugin-react`, `@vitest/mocker` | JS-only |
| `undici` 6.x | `undici@>=6 <6.29.1` to `^6.29.1` | `@expo/cli` declares `^6.18.2` | JS-only |
| `source-map-js` | `source-map-js@>=1 <1.2.2` to `^1.2.2` | `postcss` declares `^1.2.1` | JS-only |
| `node-forge` | `node-forge@>=1 <1.4.1` to `^1.4.1` | `selfsigned` declares `^1` | JS-only |
| `zod` 4.x | `zod@>=4 <4.6.6` to `^4.6.6` | `@scalar/types` declares `^4.4.3` | JS-only; the zod 3 instance is untouched |

## Left, with reason and what would fix it

"Held for FitBud UI" means native config is on hold (D-W11-F2): the fix touches Expo or React Native or their tooling, or a package with native code, so it waits until native config work is allowed again.

| Severity | Package | Path (first) | Reason | What unblocks it |
|---|---|---|---|---|
| high | `drizzle-orm` (SQL identifier escaping, fixed in 0.45.2) | `apps/api` direct dependency, `^0.42.0` | Bump not taken. From 0.44, `DrizzleQueryError` puts the bound query parameters (user data) in its message, which would reach Sentry `exception.values` (`apps/api/src/lib/sentry.ts` does not scrub them) and `console.error` in `routes/plans.ts` (line 1955). That breaks "no sensitive data in errors, logs" (AGENTS.md), and the fix needs files outside Z11-7's `files_owned`. | Follow-up task that owns `apps/api/src/lib/sentry.ts` and `apps/api/src/routes/plans.ts`: scrub `DrizzleQueryError` messages, then bump `drizzle-orm` to 0.45.2 or later. |
| high | `postcss` 8.4.49 | `apps/mobile > expo > @expo/cli > @expo/metro-config > postcss` | Held for FitBud UI: `@expo/metro-config` declares `~8.4.32`, so forcing 8.5.x is out of range (Expo tooling). | Expo SDK upgrade (newer `@expo/metro-config`). |
| high x4 | `undici` 7.x | `apps/api > @sentry/cloudflare > wrangler > miniflare > undici@7.29.0` | Pinned by miniflare (exact `7.29.0`); an override would break its pin. | Clears with a `wrangler` / `miniflare` update. |
| critical | `tinypool` (2 advisories) | `apps/api > vitest@3.2.7 > tinypool@1.1.1` | Major needed: fix is `tinypool` 2.1.2, vitest 3 pins `^1.1.1`. Dev-only (test runner). | Upgrade vitest to 4.x in a task that owns the test tooling (catalog entry in `pnpm-workspace.yaml`, all packages). |
| critical, high x8 | `tar` | `apps/mobile > @sentry/react-native > expo > @expo/cli > cacache > tar@6.2.1` | Major needed (6 to 7) and inside Expo CLI. Held for FitBud UI. Build-time only, the app bundle does not ship it. | Expo SDK upgrade (newer `@expo/cli`) as part of native config work. |
| high x13 | `@xmldom/xmldom` | `apps/mobile > @bacons/apple-targets > @bacons/xcode > @expo/plist > @xmldom/xmldom@0.7.13` | Held for FitBud UI: iOS native config plugin tooling, and the fix (0.8.15) is outside the parent's range. Build-time only. | Update `@bacons/apple-targets` or the Expo SDK when native config work resumes. |
| high x2 | `image-size` | `apps/mobile > expo > react-native > @react-native/community-cli-plugin > metro > image-size@1.2.1` | Held for FitBud UI: React Native Metro pin, and the fix is a major (2.0.3). Dev server only. | React Native / Expo SDK upgrade. |
| high x2 | `happy-dom` | `apps/api > vitest > happy-dom@20.14.6`, also `apps/mobile` and `apps/trainer-web` dev dependency `^20.14.6` | Major needed (20 to 21). Dev-only (test DOM). | Bump `happy-dom` to 21.x in all three places and run the web and mobile suites. Safe to do outside native config work. |
| high | `zod` 3.x instance only | `apps/api > @fitbud/contracts > zod@3.25.76` | Major needed (3 to 4). Every contract schema is affected. (The zod 4 instance under `@scalar/types` is fixed by the override above.) | A dedicated zod 4 migration task. |
| high | `sharp` | `apps/api > @sentry/cloudflare > wrangler > miniflare > sharp@0.35.4` | Package with native code, so not touched under D-W11-F2. Only reached through the local wrangler dev tooling, not deployed. | Update `wrangler` / `miniflare` (brings `sharp` 0.35.5) once native packages may change. |

Moderate and low advisories were not triaged in Z11-7; re-run `pnpm audit` for the list (19 moderate, 1 low after this task). Most are the same Expo / React Native chains.

## Checks run for Z11-7

- `pnpm install --frozen-lockfile` works.
- `pnpm lint`, `pnpm typecheck` and `pnpm test` pass across the workspace (see the PR for the final run).
- Not run: local e2e, banned-strings, and the QA Android build. Nothing native changed, but the overrides sit inside the Expo/React Native dev-tooling tree.
- `pnpm audit --audit-level critical` still fails by design: `tinypool` (needs vitest 4) and `tar` (needs the Expo CLI upgrade) are parked above.
- The `pnpm-lock.yaml` diff against `main` was checked by package key. It lists only `node-forge`, `shell-quote`, `source-map-js`, `undici` (6.x), `vite` (and the `vite` peer suffix of `@sentry/cloudflare`, `@vitejs/plugin-react`, `@vitest/mocker`) and `zod` (4.x). None is an Expo, React Native or native package.
