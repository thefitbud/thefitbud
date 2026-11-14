# Z12-36 · Mobile token layer, theme and Inter

Branch `claude/Z12-36-tokens-theme`, off `main` at `6e088ce7`. Spec: `docs/specs/Z12-36.md`; decisions D-W12-12, D-W12-13, D-W12-14, D-W12-20, D-W12-29 in `docs/specs/batches/W12.md`.

**Status:** built, unit/render tests and checks green. The **device gate is not run yet**: the Z12-35 harness is not on `main`. The orchestrator runs the steps in "Device check" below once it lands.

## Gap list, re-checked against `main` (`6e088ce7`)

All four items were still open on `main`; none was already done.

| Gap (spec) | Now |
|---|---|
| `packages/tokens/src/tokens.ts` has v2 values; CSS is generated from TS, not from `kit-v3.css` | v3 light + dark colours and the type scale are **generated from the kit** into `src/v3.generated.ts` and `src/tokens-v3.css`, re-exported by `tokens.ts`. The v2 exports stay (trainer web and unmigrated screens). |
| No `ThemeProvider` / `useTheme()`; no dark palette | `apps/mobile/src/providers/ThemeProvider.tsx`: follows `Appearance` live, no in-app switch. `themes.light` / `themes.dark` in `@fitbud/ui-mobile`. |
| `FontsProvider` loads Satoshi; `Text` applies Satoshi | Inter 400/500/600/700 via `@expo-google-fonts/inter` (per-weight imports) through `expo-font`; Noto Sans Devanagari kept. `Text` maps weight to the Inter face. |
| Primitives use fixed colours | Every file in `apps/mobile/src/components/**` reads colours from the theme; the `fitbud-theme/no-hard-coded-colour` lint rule rejects hex / `rgb()` literals there and in `src/providers/**`. |

## Token generator

```bash
pnpm --filter @fitbud/tokens generate:v3     # kit → src/v3.generated.ts + src/tokens-v3.css
pnpm --filter @fitbud/tokens contrast:v3     # prints the contrast table below
```

- Reads `docs/design/v3/kit-v3.css` (`:root` light, `body.dark` dark) and the "v3 additions" block of `docs/design/v3/src/kit.css` (its `:root` and `body.dark`). Dark = light overlaid with both dark blocks, so every key exists in both themes (90 colour tokens each). The `.t-*` / `.n-*` classes become `v3TypeScale` (14 styles).
- Parser: `packages/tokens/src/kitCss.ts` (pure, no file access). Script: `packages/tokens/scripts/generate-v3.ts`.
- `packages/tokens/src/v3.test.ts` diffs the tokens exported by `tokens.ts` against the kit, value for value, with its own independent CSS reader; checks the type scale; checks that `kit-v3.css` equals `src/kit.css` before the additions; and fails when either generated file is stale. Mutation-checked: changing one generated value (`ink3`) fails three tests.
- `src/tokens-v3.css` has light on `:root` and the differing dark values on `:root[data-theme="dark"]`, which nothing sets (D-W12-14). `src/tokens.css` (v2, imported by trainer web) is unchanged byte for byte.

## Primitives rebuilt on tokens

All read `useTheme()` / `createThemedStyles` (one StyleSheet per scheme, cached). Light keeps the shadows of the kit; dark drops them for a 1 pt `--edge` (DESIGN-SYSTEM-v3 §4).

| Spec name | File | Notes |
|---|---|---|
| Screen | `components/Screen.tsx` | `--bg` page, largeTitle / body variants, themed pull-to-refresh, toast footer slot |
| Text | `components/Text.tsx` | `variant` (v3 type scale) and `tone` (colour token); outermost text defaults to `--ink`, nested runs inherit |
| Button | `components/Button.tsx` (+ `PrimaryButton.tsx` re-export) | kit `.btn` variants: primary, secondary (fill), tint, outline, danger, dangerQuiet, text, whatsapp; `size="sm"` keeps a 44 pt target; legacy names aliased |
| Card | `components/Card.tsx` (new) | `.card` / `.group`, `due` coral outline |
| Chip | `components/Chip.tsx` (new) | `.chip` default / selected (ink) / tint / coach / disabled |
| Pill | `components/Pill.tsx` (new) | `.pill` brand / tint / ghost, `size="action"` |
| Sheet | `components/BottomSheet.tsx` | card over `--scrim`, 22 pt corners, fill2 grab |
| TabBar | `components/TabBar.tsx` (new) | glass capsule, brand-tint active tab, badges; the shells adopt it in their own tasks (TraineeShell / TrainerShell are not this task's files) |
| ListRow | `components/ListRow.tsx` (new) | `.li` with icon tile, value, chevron, danger, inset divider |
| Badge | `components/Badge.tsx` (new) | coral-strong, navy numeral, 2 pt card ring; count or dot |
| Toast host | `components/Snackbar.tsx` + Screen `footerVariant="toast"` | `.toast` on `--navy`, white text, white-tint action, toast-ok tick. The queue and notice host are Z12-38's (`components/notice/**`) |
| also | `AppTopBar`, `ErrorBanner` (banner crit), `Field` (focus edge), `OverflowMenu`, `SegmentedControl` (`.seg`), `StatusChip` (`.sch`), `SwipeActionRow`, `SyncIndicator`, `QuietHoursPreviewBar`, `m2/InviteHeroCard` (hero tokens), `m2/M2Form`, `m2/M2Layout` | |

`components/PrimitiveGallery.tsx` shows every primitive on one page. `PrimitiveGallery.render.test.tsx` renders it in light and dark and asserts: every primitive renders; every colour painted (text, fill, borders with a width) is a token of **that** theme; every text run meets 4.5:1 (3:1 large) against the composited surface behind it (`--ink4`, disabled-only, is exempt). Mutation-checked: a light-only fill in `ErrorBanner` fails the dark run; navy toast text fails the readability check.

## Contrast (WCAG 2.x), both themes

Measured from the generated tokens by `pnpm --filter @fitbud/tokens contrast:v3`; the same pairs are asserted in `packages/tokens/src/contrast.test.ts`. The first 25 rows are DESIGN-SYSTEM-v3 §2.3 and reproduce its numbers exactly; the rest are the other pairs the primitives draw. Translucent colours are composited over `--bg`.

**No pair fails.** Under 4.5:1 but legitimately so (graphics, 3:1 minimum): `coral-strong` on `card` (3.68 light) and on `bg` (3.37 light), `fat` on `fill2` (3.33 / 3.48). `--ink4` (2.0–2.4:1) is disabled-only and exempt, and is never used for placeholder text (Field uses `--ink3`).

| Pair | Kind (min) | Light | Dark | Used for |
|---|---|---|---|---|
| `ink` on `bg` | text (4.5:1) | 15.74 | 17.13 | Screen title and body on the page |
| `ink` on `card` | text (4.5:1) | 17.16 | 15.51 | Card, sheet and list text |
| `ink2` on `card` | text (4.5:1) | 9.32 | 8.63 | Secondary text on cards |
| `ink2` on `fill` | text (4.5:1) | 8.03 | 7.48 | Neutral banner, segmented label |
| `ink3` on `bg` | text (4.5:1) | 5.18 | 6.22 | Captions on the page |
| `ink3` on `card` | text (4.5:1) | 5.65 | 5.64 | Captions, hints, row trailing text |
| `ink3` on `fill` | text (4.5:1) | 4.87 | 4.88 | Captions on fills |
| `onBrand` on `brand` | text (4.5:1) | 17.16 | 16.86 | Primary button, brand pill |
| `coachInk` on `card` | text (4.5:1) | 7.62 | 8.76 | Coach text on cards |
| `coachInk` on `coachTint` | text (4.5:1) | 6.48 | 7.55 | Coach target chip |
| `coralStrong` on `card` | graphic (3:1) | 3.68 | 5.73 | Today ring, due outline on cards |
| `coralStrong` on `bg` | graphic (3:1) | 3.37 | 6.32 | Today ring on the page |
| `coralInk` on `card` | text (4.5:1) | 5.36 | 8.04 | Coral text on cards |
| `coralInk` on `coralTint` | text (4.5:1) | 4.60 | 6.98 | Coral tint tag |
| `fixedNavy` on `coralStrong` | text (4.5:1) | 4.67 | 5.67 | Badge numeral (tab badge) |
| `done` on `card` | text (4.5:1) | 5.34 | 8.39 | Done text on cards |
| `done` on `doneTint` | text (4.5:1) | 4.69 | 6.84 | Done tag |
| `onBrand` on `done` | graphic (3:1) | 5.34 | 9.12 | Tick on a done button |
| `ink3` on `doneRow` | text (4.5:1) | 5.31 | 5.43 | Previous value on a done row |
| `warn` on `warnTint` | text (4.5:1) | 4.86 | 7.82 | Warn tag / chip |
| `crit` on `critTint` | text (4.5:1) | 5.68 | 6.59 | Danger tag / quiet danger button |
| `info` on `infoTint` | text (4.5:1) | 5.31 | 6.88 | Info tag / chip |
| `pr` on `prTint` | text (4.5:1) | 5.16 | 8.06 | PR tag |
| `carbs` on `fill2` | graphic (3:1) | 5.69 | 6.23 | Carbs bar on its track |
| `fat` on `fill2` | graphic (3:1) | 3.33 | 3.48 | Fat bar on its track |
| `ink` on `fill` | text (4.5:1) | 14.78 | 13.44 | Secondary button, ghost pill, workout chip |
| `brandInk` on `brandTint` | text (4.5:1) | 14.14 | 13.44 | Tint button / pill / chip, banner brand |
| `brand` on `brandTint` | text (4.5:1) | 14.14 | 13.44 | Active tab label and icon |
| `ink2` on `glass` | text (4.5:1) | 9.24 | 8.69 | Inactive tab label (glass over page) |
| `onBrand` on `ink` | text (4.5:1) | 17.16 | 16.86 | Selected chip |
| `onBrand` on `crit` | text (4.5:1) | 6.54 | 8.25 | Danger button |
| `crit` on `card` | text (4.5:1) | 6.54 | 7.59 | Danger list row, field error help |
| `infoInk` on `infoTint` | text (4.5:1) | 8.83 | 9.39 | Info banner |
| `warnInk` on `warnTint` | text (4.5:1) | 7.44 | 9.47 | Warn banner |
| `critInk` on `critTint` | text (4.5:1) | 7.80 | 8.86 | Danger banner (ErrorBanner) |
| `doneInk` on `doneTint` | text (4.5:1) | 6.77 | 9.57 | Done banner |
| `brand` on `card` | text (4.5:1) | 17.16 | 15.51 | Text button, link, nav button |
| `white` on `navy` | text (4.5:1) | 17.16 | 12.50 | Toast text (kit: white on --navy in both themes) |
| `toastOk` on `navy` | graphic (3:1) | 10.80 | 7.87 | Toast success tick |
| `onCoach` on `coach` | text (4.5:1) | 6.69 | 8.40 | Coach avatar initials |
| `av1Fg` on `av1Bg` | text (4.5:1) | 5.31 | 8.86 | Client avatar 1 |
| `av2Fg` on `av2Bg` | text (4.5:1) | 4.70 | 9.57 | Client avatar 2 |
| `av3Fg` on `av3Bg` | text (4.5:1) | 5.59 | 9.47 | Client avatar 3 |
| `av4Fg` on `av4Bg` | text (4.5:1) | 6.16 | 9.39 | Client avatar 4 |
| `av5Fg` on `av5Bg` | text (4.5:1) | 6.54 | 9.17 | Client avatar 5 |
| `av6Fg` on `av6Bg` | text (4.5:1) | 5.12 | 8.84 | Client avatar 6 |
| `heroFg` on `heroB` | text (4.5:1) | 17.16 | 13.44 | Workout hero card text |
| `heroBtnFg` on `heroBtn` | text (4.5:1) | 17.16 | 16.86 | Workout hero button |
| `prInk` on `prTint2` | text (4.5:1) | 7.80 | 8.90 | PR moment text |
| `waInk` on `waBubble` | text (4.5:1) | 4.59 | 8.04 | WhatsApp preview bubble |

All 50 pairs pass in both themes.

## Device check (orchestrator, on the Z12-35 harness, on this PR's head)

Prerequisite, iOS: `apps/mobile/app.json` still has `"userInterfaceStyle": "light"`, which pins `Appearance` to light on iOS. Until Z12-57 sets it to `"automatic"` (native config, D-W12-13), **iOS cannot show dark**: run the iOS dark steps on a build that has that change (Z12-57's head, or a harness build that overrides it), and record iOS dark as "blocked on Z12-57" if neither exists. Android follows the system already.

1. **Builds.** iOS simulator and Android emulator dev builds of this head through the harness. Start Metro with `EXPO_PUBLIC_PRIMITIVE_GALLERY=1` for steps 2–4 (dev builds only: the app opens on the primitive gallery instead of sign-in), and without it for steps 5–6.
2. **Live flip, gallery.** With the gallery open, flip the system theme without restarting the app:
   - iOS: `xcrun simctl ui booted appearance dark`, then `… light`.
   - Android: `adb shell cmd uimode night yes`, then `… no`.
   Expect within a second: page `#F4F5F8` ↔ `#0F0F13`, cards `#FFFFFF` ↔ `#1A1A20`, primary button navy-on-white ↔ off-white-on-dark, and the status bar content dark ↔ light. No restart, no red box, no warning in the device log.
3. **Screenshots, both themes, both platforms:** scroll the gallery and capture every section (type, buttons, chips/pills/status/badge, card and list, inputs and banners, toast and tab bar) to `docs/qa/Z12-36/primitives-<section>-<light|dark>-<ios|android>.png`. Check by eye: no text unreadable on any primitive; disabled button and chip read as disabled (`--ink4`); badge numeral navy on coral in both themes.
4. **Inter weights render.** On the gallery's type block: Large title 30 (700), Title 20 (700), Headline 17 (600), Body 16 (400), Body 16 semibold (600), Caption 12 (500) show four visibly distinct Inter weights, and the device log has no "fontFamily "Inter_…" is not a system font and has not been loaded" warning. The Hindi run "आज का प्लान" renders (Devanagari fallback), not boxes.
5. **App screens, light (regression).** Sign in as trainee and as trainer (`docs/LOCAL_TESTING.md` personas) and open Today (TR-06a), Workout (W-03), Diet (TR-07a), Needs you (TM-01a) and a nudge sheet (TM-04b). Expect them to render as before in light, with v3 primitives (navy primary buttons, Inter, coral notification dot) and nothing clipped or unreadable. Screens themselves are not migrated in this task.
6. **App screens, dark (informational).** Same screens in dark: primitives (page, sheets, buttons, toasts, banners) go dark; **unmigrated screen content still uses v2 light colours** and may be unreadable on the dark page until each screen's own W12 task migrates it (decision 3 below). Record what you see in `docs/qa/W12/parity.md` as GAP with that reason; do not grade it MATCH.
7. **Android navigation bar.** Note its colour in both themes. It is not themed yet (no JS API without `expo-navigation-bar`, a native module): expected to keep the native theme's colour. Z12-57 item below.

Mock anchors for primitives only (colour, type, radius): TR-06a, W-03, TR-07a, TM-01a, TM-04b in `docs/design/v3/png/` and `png-dark/`. Grade CLOSE/GAP per platform, never a pixel match.

## Native items for Z12-57 (none done here, D-W12-13)

1. `apps/mobile/app.json`: `"userInterfaceStyle": "automatic"` (today `"light"`: iOS stays light; this blocks the iOS dark gate).
2. `expo-navigation-bar` as a dependency, then in `apps/mobile/src/providers/SystemBars.tsx` set the Android navigation bar background from `theme.colors.bg` and its button style per scheme.
3. Optional, recommended: `expo-system-ui` so the Android window/root background is dark before JS draws (no white flash in dark), and so `userInterfaceStyle` is honoured on Android; a dark splash background (`splash.dark` / `android.splash.dark`), today `#FAF7F2` only.
4. Inter needs **no** native config: it is loaded from JS through `expo-font` (Z12-57 item 6 can be closed as not needed).

## Checks run

- `pnpm install --frozen-lockfile`, `pnpm build:packages`: pass.
- `pnpm lint` (17 turbo tasks): pass. `pnpm typecheck` (17 tasks): pass.
- `pnpm test` (turbo, 17 tasks): pass. `@fitbud/mobile` 128 files / 1280 tests, `@fitbud/api` 1598, `@fitbud/trainer-web` 678, `@fitbud/core` 244, `@fitbud/tokens` 115, others green.
- `@fitbud/tokens`: 115 tests (v3 diff 6, contrast 108 incl. 100 v3 pair checks, brand 1).
- `@fitbud/mobile`: new `ThemeProvider.render.test.tsx` (6: system start, live flip both ways, null → light, unsubscribe on unmount, preview override, light outside a provider), `PrimitiveGallery.render.test.tsx` (8), `eslint-rules/no-hard-coded-colour.test.mjs` (18, including the failing fixture through the real eslint config and a check that every file in `src/components` gets the rule).
- Not run: the device gate (harness not on `main`), trainer-web Playwright e2e (CPU shared; trainer web is untouched: `tokens.css` unchanged).

## Decisions taken (decide and note)

1. **v3 CSS goes to a new `tokens-v3.css`, not into `tokens.css`.** Question: generate the web CSS into the existing file trainer web imports? Option taken: keep `tokens.css` (v2) byte-identical and add `@fitbud/tokens/tokens-v3.css`. Why: trainer web is Z12-37's lane and must not change before it; the kit's `--info` collides with the v2 alias `--info` in `tokens.css`. Z12-37 swaps the import.
2. **v2 exports stay, deprecated.** `brand`, `ink`, `surface`, `semantic`, `rings` in `@fitbud/tokens` and `colors`, `semanticColors`, `radii`, `typeScale`, `textStyles` in `@fitbud/ui-mobile` keep their values, so unmigrated screens render as before in light (only the font changes to Inter). Primitives use v3 only. Removing them is the last screen task's job.
3. **The theme follows the system from now on (D-W12-12), before screens migrate.** On Android in dark, primitives go dark while unmigrated screen content keeps v2 light colours until its own W12 task. Alternative rejected: an internal flag holding the app in light until every screen migrates — it would contradict D-W12-12 and hide dark problems from each screen task's device gate. No build reaches users before Z12-57, and iOS stays light until then anyway.
4. **Button variant names follow the kit.** `secondary` is now the kit's fill button (v2 `secondary` was an outlined white button, now `outline`); `tinted`/`tertiary`/`ghost`/`destructive` remain as aliases. Disabled uses the kit's `--fill2`/`--ink4` instead of 50% opacity; loading keeps the variant colours.
5. **New primitives created where none existed:** Card, Chip, Pill, TabBar, ListRow, Badge in `components/`. The trainee and trainer shells keep their inline tab bars until the shell tasks adopt `TabBar` (those files are not this task's).
6. **Toast host:** `Snackbar` is the themed toast and Screen's toast footer the slot; the single queue/notice host is Z12-38's (`components/notice/**`).
7. **Field placeholder is `--ink3`, not the kit's `--ink4`**, so placeholder copy meets 4.5:1 (`--ink4` is disabled-only per §2.3).
8. **StatusChip takes the kit `.sch` shape** (22 pt, 7 pt corners) instead of the v2 full pill; tones map to v3 crit/warn/done/info/neutral pairs, always icon + word.
9. **Synced dot is `--done`** (v2 indigo): green means synced/saved in v3.
10. **Primitive gallery reachable on device through `EXPO_PUBLIC_PRIMITIVE_GALLERY=1`** (dev builds only, `App.tsx`), because `src/dev/**` and `AppRouter.tsx` are not this task's files. It follows the system theme, so it is also the live-flip check.
11. **Text colour:** the outermost `Text` defaults to `--ink` (was the platform black); nested runs inherit their parent's colour unless they set `tone`, so text inside a coloured parent keeps it.
12. **Lint rule scope:** `src/components/**` and `src/providers/**` (not tests). Only WhatsApp's own brand-mark colours are exempt, each behind a reasoned `eslint-disable`.
13. **Satoshi files left in `apps/mobile/assets/fonts/satoshi/`** (no longer loaded). The root `README.md` troubleshooting row and `packages/brand/fonts/README.md` still name them and are not this task's files; remove all three together in Z12-37 or a hygiene task.
14. **Turbo cache:** `@fitbud/tokens`' tests read `docs/design/v3/*.css`, outside the package; `turbo.json` (not this task's file) does not list them as inputs, so a local cached run can miss a kit change. CI runs uncached. Follow-up: add `$TURBO_ROOT$/docs/design/v3/**` to a `@fitbud/tokens#test` inputs entry.
15. **Model:** opus, as the spec's `model` field says.
16. **Depends on Z12-35:** the spec waits for Z12-35 (D-W12-21a); the orchestrator started this lane in parallel. Nothing here touches the vitest configs or CI files Z12-35 owns; after Z12-35 merges, merge `main` and re-run `pnpm test` (its console-error setup may flag the render tests' pre-existing icon-mock warnings, which are not from this change).
