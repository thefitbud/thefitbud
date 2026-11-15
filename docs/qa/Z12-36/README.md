# Z12-36 · Mobile token layer, theme and Inter

Branch `claude/Z12-36-tokens-theme`, off `main` at `6e088ce7`. Spec: `docs/specs/Z12-36.md`; decisions D-W12-12, D-W12-13, D-W12-14, D-W12-20, D-W12-29 in `docs/specs/batches/W12.md`.

**Status:** built; lint, typecheck, unit/render tests, `ci`, `e2e` and `banned-strings` green. **Device gate:** every flow passed on Android and on iOS in both themes (Android run 43669586698 fully green; iOS run 43661044035 every flow passed), but the iOS job still fails on four React Native "ADVICE" warnings raised by views on the trainee workout path, not by this task's primitives (see "Device-gate blocker" below). Reported to the orchestrator; PR stays in draft until that is settled.

## Gap list, re-checked against `main` (`6e088ce7`)

All four items were still open on `main`; none was already done.

| Gap (spec) | Now |
|---|---|
| `packages/tokens/src/tokens.ts` has v2 values; CSS is generated from TS, not from `kit-v3.css` | v3 light + dark colours and the type scale are **generated from the kit** into `src/v3.generated.ts` and `src/tokens-v3.css`, re-exported by `tokens.ts`. The v2 exports stay (trainer web and unmigrated screens). |
| No `ThemeProvider` / `useTheme()`; no dark palette | `apps/mobile/src/providers/ThemeProvider.tsx`: tracks `Appearance` live, no in-app switch; dark is **opt-in per screen** (below). `themes.light` / `themes.dark` in `@fitbud/ui-mobile`. |
| `FontsProvider` loads Satoshi; `Text` applies Satoshi | Inter 400/500/600/700 via `@expo-google-fonts/inter` (per-weight imports) through `expo-font`; Noto Sans Devanagari kept. `Text` maps weight to the Inter face. |
| Primitives use fixed colours | Every file in `apps/mobile/src/components/**` reads colours from the theme; the `fitbud-theme/no-hard-coded-colour` lint rule rejects hex / `rgb()` literals there and in `src/providers/**`. |

## Dark is opt-in per screen (orchestrator decision, PR #440 review)

The root `ThemeProvider` tracks the system scheme live, but the **effective** scheme of every subtree is **light** unless it opts in, because unmigrated screens still use v2 light colours (for example `screens/RoleSelectScreen.tsx:245`, navy text that would sit on `#0F0F13`).

- **API:** `<Screen v3 …>` opts a screen in. For a subtree that does not use `Screen`, wrap it in `<ThemeScope scheme="system">…</ThemeScope>`. `ThemeScope scheme="light" | "dark"` forces a scheme (previews and tests only). `useTheme()` returns the effective theme; `useSystemColorScheme()` returns the live system scheme.
- **Status bar:** follows the effective scheme of the most recently mounted opted-in scope (`useBarScheme()`, read by `SystemBars`), else light. The Android navigation bar will follow the same value once Z12-57 adds `expo-navigation-bar`.
- **Who opts in:** each screen's own W12 task, once the screen is on v3 tokens. `PrimitiveGallery` opts in. **Z12-58 verifies nothing is left un-opted** (every `Screen` has `v3`, every other root has a `ThemeScope scheme="system"`).
- Tests (`src/providers/ThemeProvider.render.test.tsx`): "under system dark, an un-opted subtree renders light tokens", "under system dark, an opted-in subtree renders dark tokens", "under system dark, an un-opted Screen renders light tokens", "under system dark, <Screen v3> renders dark tokens", plus live flip, null → light, unsubscribe, forced scope, status bar follows the opted-in screen.

## Token generator

```bash
pnpm --filter @fitbud/tokens generate:v3     # kit → src/v3.generated.ts + src/tokens-v3.css
pnpm --filter @fitbud/tokens contrast:v3     # prints the contrast table below
```

- Reads `docs/design/v3/kit-v3.css` (`:root` light, `body.dark` dark) and the "v3 additions" block of `docs/design/v3/src/kit.css` (its `:root` and `body.dark`). Dark = light overlaid with both dark blocks, so every key exists in both themes (90 colour tokens each). The `.t-*` / `.n-*` classes become `v3TypeScale` (14 styles).
- `v3Radii` (hand-listed in `tokens.ts`) is under the same drift test: each key names its kit rule (`.card`, `.btn.sm`, `.sheet`, …) and must equal that rule's `border-radius`; a new key fails until it is mapped.
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

## Device check (Z12-35 harness, `device.yml`, flows `apps/mobile/.maestro/device/z12-36/`)

Dispatch: `device.yml` on `main`, inputs `ref=claude/Z12-36-tokens-theme`, `flows=z12-36` (both roles, both themes, both platforms). The flows run one Maestro invocation each, in path order (`9-gallery-hold.yaml` is tagged `device-offline` for that; the gallery makes no network call).

| Flow | Role | What it captures |
|---|---|---|
| `1-primitives-gallery.yaml` | none | The primitive gallery section by section (`primitives-1-type` … `primitives-6-sheet`) and, in the second theme, `primitives-live-flip`: the gallery after `theme.sh` flipped the system theme **with the app open** (the app is not stopped or cleared; a relaunch would land on sign-in) |
| `2-trainee-today-diet.yaml` | trainee (Aarav) | `TR-06a`, `TR-07a` |
| `3-trainee-workout.yaml` | trainee (Rohan) | `W-03`: this week's Saturday "Lower body B" from the week strip (light starts it, dark continues it), one set logged, rest skipped |
| `4-trainer-needs-you-nudge.yaml` | trainer (Rahul) | `TM-01a`, then Clients → Rohan → Review → "Nudge on WhatsApp" → `TM-04b` (opened and closed; nothing is sent) |
| `9-gallery-hold.yaml` | none | Leaves the gallery open for the flip (`primitives-before-flip`) |
| `open-gallery.yaml`, `sign-in-password.yaml` | subflows | Open `fitbud://qa/primitives` (accepting iOS's "Open in …?" prompt); a task-local sign-in (see below) |

**How the Release gate reaches the gallery (decision 18).** The gate builds a Release app against the runner's local API (`EXPO_PUBLIC_API_BASE_URL` = `http://127.0.0.1:8787` / `http://10.0.2.2:8787`). `App.tsx` loads the gallery only in that build (or a dev build with `EXPO_PUBLIC_PRIMITIVE_GALLERY=1`), from literal comparisons on the inlined env values, and `fitbud://qa/primitives` opens it (`fitbud://qa/app` returns). Checked with `expo export:embed`: a production-env bundle has no gallery module ("Large title 30" absent); a local-API bundle has it. No native file touched.

**Evidence** (screenshots in this folder, `<screen ID>-<theme>-<platform>.png` and `primitives-*-<theme>-<platform>.png`). Sources: Android from run 43669586698 (head `448a2f5a`, all flows passed, device log clean); iOS screen IDs, dark gallery, live flip and `primitives-before-flip-light-ios` from run 43673200079 (head `c7bc6a33`), iOS light gallery sections from run 43661044035 (head `79e9fdea`, where every iOS flow passed). The app code is the same in all three heads apart from the gallery's Android status-bar padding (`31b2da4b`).
- Live flip: `primitives-live-flip-dark-{ios,android}.png` is the gallery in dark taken without a relaunch after the flip from light (`primitives-before-flip-light-*`). Mean screenshot luminance per theme (harness evidence): Android light 0.85 / dark 0.43 (run 43669586698); iOS light 0.83 / dark 0.38 (run 43673200079).
- Inter weights: the gallery's type block shows 400/500/600/700 and the Devanagari fallback ("आज का प्लान") on both platforms; no font warning in the device logs.
- Un-opted screens stay light under system dark (decision 3): `TR-06a-dark-*`, `TM-01a-dark-*` etc. render light with dark status-bar content.

### `screen ID → control → result`

| Screen | Control | Result |
|---|---|---|
| Gallery | system theme flip light → dark with the app open | gallery changes live (Android ✓, iOS ✓) |
| Gallery | scroll through every section | every primitive renders in both themes, no unreadable text by eye |
| Gallery | "Open sheet" → sheet → "Close sheet" | sheet over the scrim opens and closes |
| TR-06a | sign in (password) → Today | loads, light in both themes |
| TR-07a | Diet tab | loads with "Something different" |
| W-03 | Workout tab → "Sat Lower B" → Start/Continue workout → "Log set" → "Skip rest" | active workout mid-session |
| TM-01a | sign in → Needs you | loads (skeleton gone) |
| TM-04b | Clients → Rohan Mehta → Review → Nudge on WhatsApp → Close | nudge sheet opens with the message preview, closes; nothing sent |

### Deliberate departures from the mocks
- The five anchors are captured on **unmigrated** screens: their layout and colours are still v2 (their own W12 tasks migrate them); only the primitives and Inter are v3 here. All ten parity rows are GAP for that reason.
- Dark mocks: the screens render light under system dark until opted in (decision 3).
- TM-04b today is the exception review's WhatsApp nudge sheet; the v3 mock is the push nudge sheet (Z12-50).
- Tab bar (light): opaque `--card` instead of 90 % `--glass` (decision 19).

### For Firoz's real-phone checklist (Z12-58)
- Flip the system theme on a real iPhone **after Z12-57** sets `userInterfaceStyle: "automatic"` (the gate patches the generated Info.plist; the shipped app is pinned light until then).
- Android navigation bar colour in both themes (not themed until Z12-57 adds `expo-navigation-bar`).
- Inter on a real device at the user's text-size setting (Dynamic Type / font scale), and the Devanagari fallback on a Hindi-locale phone.

### Device-gate runs and the blocker

| Run | Head | Android | iOS |
|---|---|---|---|
| 43643116147 | `1649a204` | W-03 (rest day), TM-04b ("Nudge…" opens WhatsApp) failed | "Open in …?" alert blocked every flow |
| 43657287248 | `d5a4700b` | W-03 dark failed | sign-in wait (rest-day label), gallery tab-bar shadow advice |
| 43659668747 | `613828e1`→`79e9fdea` | **pass** | Needs-you load > 30 s, email typed with dropped characters; 4 rn-warn |
| 43661044035 | `79e9fdea` | **pass** | **every flow passed, both themes**; 4 rn-warn |
| 43665745548 | `84a38bc9` | **pass** | sign-in > 30 s on a cold simulator; 4 rn-warn |
| 43669586698 | `448a2f5a` | **pass** | iOS alert not seen by the conditional wait; 2 rn-warn |
| 43673200079 | `c7bc6a33` | first flow: app never started (`capture-empty`, "Unknown error", harness/emulator) | first cold gallery open > 60 s; everything else passed; 4 rn-warn |

**Blocker (iOS `rn-warn`, not this task's code).** Every iOS run logs 2–4 `[fitbud-gate] native.warn (ADVICE) View #… of type RCTView has a shadow set but cannot calculate shadow efficiently`, always during `3-trainee-workout.yaml` (Rohan: Today → Workout → active workout), in both themes (the screens are light in both, not opted in). The gallery flows, which render every rebuilt primitive, log none since the tab-bar fix (`79e9fdea`). The only shadow over a translucent fill left in the app is the in-app banner, `apps/mobile/src/trainee/notifications/Surfaces.tsx:753` (`backgroundColor: "rgba(250,249,253,0.97)"` with `shadowOpacity: 0.24`), shown over Rohan's tabs for his due meal and coach notes; that is the likely source (the harness publishes no device log to confirm the view). That file belongs to Z12-38 (D-W12-29), so it is not changed here. Options for the orchestrator: Z12-38 makes the banner fill opaque (or drops the shadow) before this merges, or the harness allow-lists this ADVICE line with a reason.

## Native items for Z12-57 (none done here, D-W12-13)

1. `apps/mobile/app.json`: `"userInterfaceStyle": "automatic"` (today `"light"`: iOS stays light; this blocks the iOS dark gate).
2. `expo-navigation-bar` as a dependency, then in `apps/mobile/src/providers/SystemBars.tsx` set the Android navigation bar background from `theme.colors.bg` and its button style per scheme.
3. Optional, recommended: `expo-system-ui` so the Android window/root background is dark before JS draws (no white flash in dark), and so `userInterfaceStyle` is honoured on Android; a dark splash background (`splash.dark` / `android.splash.dark`), today `#FAF7F2` only.
4. Inter needs **no** native config: it is loaded from JS through `expo-font` (Z12-57 item 6 can be closed as not needed).

## Checks run

- `pnpm install --frozen-lockfile`, `pnpm build:packages`: pass.
- `pnpm lint` (17 turbo tasks): pass. `pnpm typecheck` (17 tasks): pass.
- `pnpm test` (turbo, 17 tasks): pass. `@fitbud/mobile` 1293 tests, `@fitbud/api` 1598, `@fitbud/trainer-web` 678, `@fitbud/core` 244, `@fitbud/tokens` 116, others green.
- `@fitbud/tokens`: 116 tests (v3 diff 7 incl. radii, contrast 108 incl. 100 v3 pair checks, brand 1).
- `@fitbud/mobile`: new `ThemeProvider.render.test.tsx` (10, listed in the opt-in section), `PrimitiveGallery.render.test.tsx` (8), `eslint-rules/no-hard-coded-colour.test.mjs` (27, including named colours, the failing fixture through the real eslint config, and a check that every file in `src/components` gets the rule).
- Device gate: see "Device-gate runs and the blocker" above.
- Not run locally: trainer-web Playwright e2e (CPU shared); `e2e` and `banned-strings` are green in CI on the PR head.

## Decisions taken (decide and note)

1. **v3 CSS goes to a new `tokens-v3.css`, not into `tokens.css`.** Question: generate the web CSS into the existing file trainer web imports? Option taken: keep `tokens.css` (v2) byte-identical and add `@fitbud/tokens/tokens-v3.css`. Why: trainer web is Z12-37's lane and must not change before it; the kit's `--info` collides with the v2 alias `--info` in `tokens.css`. Z12-37 swaps the import.
2. **v2 exports stay, deprecated.** `brand`, `ink`, `surface`, `semantic`, `rings` in `@fitbud/tokens` and `colors`, `semanticColors`, `radii`, `typeScale`, `textStyles` in `@fitbud/ui-mobile` keep their values, so unmigrated screens render as before in light (only the font changes to Inter). Primitives use v3 only. Removing them is the last screen task's job.
3. **Dark is opt-in per screen until each screen migrates (orchestrator decision on PR #440 review; replaces the first draft, which let every primitive go dark at once).** The system scheme is tracked live, but an un-opted subtree renders light; `<Screen v3>` / `<ThemeScope scheme="system">` opt in. Each screen's W12 task opts it in; Z12-58 checks none is left. See "Dark is opt-in per screen" above.
4. **Button variant names follow the kit.** `secondary` is now the kit's fill button (v2 `secondary` was an outlined white button, now `outline`); `tinted`/`tertiary`/`ghost`/`destructive` remain as aliases. Disabled uses the kit's `--fill2`/`--ink4` instead of 50% opacity; loading keeps the variant colours.
5. **New primitives created where none existed:** Card, Chip, Pill, TabBar, ListRow, Badge in `components/`. The trainee and trainer shells keep their inline tab bars until the shell tasks adopt `TabBar` (those files are not this task's).
6. **Toast host:** `Snackbar` is the themed toast and Screen's toast footer the slot; the single queue/notice host is Z12-38's (`components/notice/**`).
7. **Field placeholder is `--ink3`, not the kit's `--ink4`**, so placeholder copy meets 4.5:1 (`--ink4` is disabled-only per §2.3).
8. **StatusChip takes the kit `.sch` shape** (22 pt, 7 pt corners) instead of the v2 full pill; tones map to v3 crit/warn/done/info/neutral pairs, always icon + word.
9. **Synced dot is `--done`** (v2 indigo): green means synced/saved in v3.
10. **Primitive gallery reachable on device through `EXPO_PUBLIC_PRIMITIVE_GALLERY=1`** (dev builds only, `App.tsx`), because `src/dev/**` and `AppRouter.tsx` are not this task's files. It is `require`d only inside `if (__DEV__ && process.env.EXPO_PUBLIC_PRIMITIVE_GALLERY === "1")`, which Metro constant-folds away in release, so it is not in release bundles. It opts in to the system theme, so it is also the live-flip check.
11. **Text colour:** the outermost `Text` defaults to `--ink` (was the platform black); nested runs inherit their parent's colour unless they set `tone`, so text inside a coloured parent keeps it.
12. **Lint rule scope:** `src/components/**` and `src/providers/**` (not tests). It rejects hex, numeric `rgb()/hsl()` and CSS named colours (whole-string `"white"`, `"Black"`, `"red"`…; `transparent`, `currentColor`, `inherit`, import paths and object keys are allowed). Only WhatsApp's own brand-mark colours are exempt, each behind a reasoned `eslint-disable`.
13. **Satoshi files left in `apps/mobile/assets/fonts/satoshi/`** (no longer loaded). The root `README.md` troubleshooting row and `packages/brand/fonts/README.md` still name them and are not this task's files; remove all three together in Z12-37 or a hygiene task.
14. **Turbo cache:** `@fitbud/tokens`' tests read `docs/design/v3/*.css`, outside the package; `turbo.json` (not this task's file) does not list them as inputs, so a local cached run can miss a kit change. CI runs uncached. Follow-up: add `$TURBO_ROOT$/docs/design/v3/**` to a `@fitbud/tokens#test` inputs entry.
15. **Model:** opus, as the spec's `model` field says.
16. **Depends on Z12-35:** the spec waits for Z12-35 (D-W12-21a); the orchestrator started this lane in parallel. Nothing here touches the vitest configs or CI files Z12-35 owns; after Z12-35 merges, merge `main` and re-run `pnpm test` (its console-error setup may flag the render tests' pre-existing icon-mock warnings, which are not from this change).
17. **Files outside `files_owned` left as they are:** `packages/ui-mobile/src/FitText.tsx` still says "Satoshi" in comments and a helper name (`satoshiFamilyForWeight`); it already maps to the Inter faces through `typography.ts`. Its holder is Z12-42 (D-W12-29). `apps/mobile/src/dev/SpecimensScreen.tsx` still shows the sample line "Satoshi 600 · actions" (dev-only, web `__specimens` path); `src/dev/**` is not this task's, so it is left for its owner or a hygiene task.

18. **How the Release device gate reaches the primitives (orchestrator asked to pick one).** Option taken: the gallery behind a build-time QA condition, not real screens, because no real screen is opted in to dark yet, so only the gallery can show the primitives in dark. The condition is "the bundle is made against the runner's local API" (`EXPO_PUBLIC_API_BASE_URL` is `http://127.0.0.1:8787` or `http://10.0.2.2:8787`), which the harness already sets and no store or EAS profile can have; `fitbud://qa/primitives` then opens the gallery. Literal comparisons let Metro drop the gallery from every other bundle (checked with `expo export:embed`); `src/providers/qaGallery.test.ts` pins the gate. No native file touched.
19. **Tab bar (light) is opaque `--card`, not 90 % `--glass`.** React Native core has no backdrop blur, and iOS logs "View … has a shadow set but cannot calculate shadow efficiently" for a shadow over a translucent fill, which the gate counts as a warning (run 43657287248). Dark keeps `--glass` (no shadow there).
20. **Task-local sign-in subflow.** `device/z12-36/sign-in-password.yaml` copies `common/sign-in-password.yaml` with a looser final wait (`Today's workout.*`: on iOS a rest-day Today exposes only "Today's workout: rest day"), a 60 s wait and a retype when the simulator drops characters from the email. Reported for the shared subflow's owner; `common/` is not this task's.
21. **W-03 is reached through this week's Saturday workout** ("Sat Lower B", which the seed keeps startable): the runner's day can be a rest day, and the light run uses up a "Log it". Light starts it, dark continues it.
