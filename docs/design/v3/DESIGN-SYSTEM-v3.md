# FitBud design system v3

Status: approved direction, 14 Nov 2026. Supersedes `docs/design/v2/DESIGN-SYSTEM.md` for colour and theming. Everything not mentioned here is unchanged from v2.

## 0. What v3 is

v3 is a **colour and theme release**. Firoz reviewed three new visual directions and two rebuilt screens, and decided to keep the v2 layouts.

- **Changed:** every colour token, the meaning of each colour, and a new dark theme.
- **Not changed:** screen IDs, flows, features, layouts, component sizes, the type scale, Inter, spacing, radii, icons, copy and the logo files.
- **Source of truth:** `docs/design/v2/src/kit.css` after the v3 update (the full file is delivered as `kit-v3.css`).

The five anchor screens (TR-06a, W-03, TR-07a, TM-01a, TM-04b) were rendered from the real kit scripts in both themes and approved. The other 175 screens have not been rendered yet.

## 1. Colour roles

Each colour has one job. If a use is not listed here, use a neutral.

| Role | Light | Dark | Used for |
|---|---|---|---|
| **Ink / primary** | Navy `#1A1248` | Off-white `#F2F2F6` | Text, numbers, the main button, active tab, links, rings, progress bars, selected chips |
| **Today** | Coral `#EE456E` (logo coral `#FF587D` on dark) | Coral `#FF587D` | The "today" date ring, the outline of the due item, the rest-bar progress line, notification dots and tab badges |
| **Coach** | Periwinkle `#5448C8` | `#A9A3FF` | Anything that came from the coach: target chips, target values in set inputs, the coach avatar |
| **Done** | Green `#0B7A55` | `#3FCB93` | Logged sets and meals, saved, synced, sent |
| **Status** | Warn, danger, info, PR | Lighter values of the same hues | Tags and banners, always with an icon and a word |

**Rules**
- **The main button is the text colour inverted.** Navy with white text in light; off-white with dark text in dark. Coral is never a button.
- **Coral means today or due, and nothing else.** It is never an error, never a progress fill, and never small text. For coral text use `--coral-ink`.
- **Periwinkle means the coach.** It is never a button, a link or a status.
- **Green means done.** It is not used for "good" or "on track" figures.
- **Macro bars are three steps of ink**, not three hues. The labels say which is which.
- **Never rely on colour alone.** Day states stay filled dot, open ring and dash.

## 2. Tokens

Light values go on `:root`. Dark values go on `body.dark`. One stylesheet serves both themes.

### 2.1 Light

```css
:root{
  /* text */
  --ink:#1A1248; --ink2:#46445F; --ink3:#66657C; --ink4:#A9ABBA;
  --line:rgba(26,18,72,.09); --line2:rgba(26,18,72,.16);
  /* surfaces */
  --bg:#F4F5F8; --bg-plain:#FFFFFF; --card:#FFFFFF; --fill:#ECEEF3; --fill2:#E3E5EC;
  /* primary = ink */
  --brand:#1A1248; --brand-ink:#1A1248; --brand-tint:#E9E8F3; --brand-tint2:#D9D7EA; --on-brand:#FFFFFF;
  /* coach */
  --coach:#5448C8; --coach-ink:#4A3FBF; --coach-tint:#ECEBFB; --ghost:#5448C8;
  /* today */
  --coral:#FF587D; --coral-strong:#EE456E; --coral-ink:#C72C55; --coral-tint:#FFE8EE;
  /* done and status */
  --done:#0B7A55; --done-tint:#E3F4EC; --done-row:#F1FAF5; --done-ink:#075F40;
  --warn:#A65400; --warn-tint:#FFF1DF; --warn-ink:#7A3F05;
  --crit:#B3261E; --crit-tint:#FDEBE9; --crit-ink:#8A231B;
  --info:#1F5FBF; --info-tint:#E7F0FF; --info-ink:#1C3F80;
  --pr:#8C5E00; --pr-tint:#FFF4D6;
  /* data */
  --protein:#1A1248; --carbs:#55508F; --fat:#7A76AC; --navy:#1A1248;
  /* component surfaces that were hard-coded in v2 */
  --row-cur:#F4F5F8; --row-skip:#FAFAFC; --sn-done:#DDF1E7;
  --kbd:#E6E8EE; --kbd-fn:#D3D6DE; --skel1:#E9EBF0; --skel2:#F2F3F7;
  --fade0:rgba(244,245,248,0); --fade1:rgba(244,245,248,.9);
  --glass:rgba(255,255,255,.9); --scrim:rgba(16,12,40,.40);
  --sh:26,18,72; --edge:rgba(26,18,72,.06);
}
```

### 2.2 Dark (charcoal)

```css
body.dark{
  --ink:#F2F2F6; --ink2:#B6B6C2; --ink3:#92929F; --ink4:#62626E;
  --line:rgba(255,255,255,.09); --line2:rgba(255,255,255,.17);
  --bg:#0F0F13; --bg-plain:#0F0F13; --card:#1A1A20; --fill:#26262E; --fill2:#33333C;
  --brand:#F2F2F6; --brand-ink:#F2F2F6; --brand-tint:#26262E; --brand-tint2:#33333C; --on-brand:#111116;
  --coach:#A9A3FF; --coach-ink:#B5B0FF; --coach-tint:#26243F; --ghost:#B5B0FF;
  --coral:#FF587D; --coral-strong:#FF587D; --coral-ink:#FF8FA8; --coral-tint:#3A1E28;
  --done:#3FCB93; --done-tint:#15302A; --done-row:#11211C; --done-ink:#8DE6C3;
  --warn:#F0B463; --warn-tint:#33281A; --warn-ink:#F5CB8E;
  --crit:#FF8A80; --crit-tint:#3A1F20; --crit-ink:#FFB4AC;
  --info:#8AB4FF; --info-tint:#1B2A44; --info-ink:#B9D2FF;
  --pr:#EBC057; --pr-tint:#332C18;
  --protein:#F2F2F6; --carbs:#B6B6C2; --fat:#868694; --navy:#33333C;
  --row-cur:#26262E; --row-skip:#1A1A20; --sn-done:#1D3B30;
  --kbd:#1A1A20; --kbd-fn:#33333C; --skel1:#1A1A20; --skel2:#26262E;
  --fade0:rgba(15,15,19,0); --fade1:rgba(15,15,19,.9);
  --glass:rgba(26,26,32,.94); --scrim:rgba(0,0,0,.6);
  --sh:0,0,0; --edge:rgba(255,255,255,.08);
}
```

### 2.3 Measured contrast (WCAG 2.x)

Text needs 4.5:1. Graphics and large text need 3:1.

| Pair | Light | Dark |
|---|---|---|
| `--ink` on `--bg` | 15.74 | 17.13 |
| `--ink` on `--card` | 17.16 | 15.51 |
| `--ink2` on `--card` | 9.32 | 8.63 |
| `--ink2` on `--fill` | 8.03 | 7.48 |
| `--ink3` on `--bg` | 5.18 | 6.22 |
| `--ink3` on `--card` | 5.65 | 5.64 |
| `--ink3` on `--fill` | 4.87 | 4.88 |
| `--on-brand` on `--brand` | 17.16 | 16.86 |
| `--coach-ink` on `--card` | 7.62 | 8.76 |
| `--coach-ink` on `--coach-tint` | 6.48 | 7.55 |
| `--coral-strong` on `--card` (graphic) | 3.68 | 5.73 |
| `--coral-strong` on `--bg` (graphic) | 3.37 | 6.32 |
| `--coral-ink` on `--card` | 5.36 | 8.04 |
| `--coral-ink` on `--coral-tint` | 4.60 | 6.98 |
| Navy numeral on a coral badge | 4.67 | 5.67 |
| `--done` on `--card` | 5.34 | 8.39 |
| `--done` on `--done-tint` | 4.69 | 6.84 |
| Tick on a `--done` button | 5.34 | 9.12 |
| `--ink3` on `--done-row` | 5.31 | 5.43 |
| `--warn` on `--warn-tint` | 4.86 | 7.82 |
| `--crit` on `--crit-tint` | 5.68 | 6.59 |
| `--info` on `--info-tint` | 5.31 | 6.88 |
| `--pr` on `--pr-tint` | 5.16 | 8.06 |
| `--carbs` bar on its track (graphic) | 5.69 | 6.23 |
| `--fat` bar on its track (graphic) | 3.33 | 3.48 |

`--ink4` is for disabled content only and is exempt.

**Coral limits.** Logo coral `#FF587D` is 3.02:1 on white, so on light surfaces graphics use `--coral-strong`. Raw `#FF587D` appears only in the logo and in the dark theme.

## 3. Logo

The logo is unchanged from v2. The Honest Week mark, the lockups and the 2×2 app icon stay exactly as they are in `docs/design/v2/assets/logo/`. A redrawn "staircase" icon was explored and rejected.

**Mark** (`honest-week-mark-colour.svg`)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512"><circle cx="14" cy="50" r="9" fill="#1A1248" stroke="#1A1248" stroke-width="3.6"/><circle cx="38" cy="50" r="9" fill="#1A1248" stroke="#1A1248" stroke-width="3.6"/><circle cx="62" cy="50" r="9" fill="#1A1248" stroke="#1A1248" stroke-width="3.6"/><circle cx="86" cy="50" r="9" fill="none" stroke="#FF587D" stroke-width="3.6"/></svg>
```

**App icon** (`honest-week-app-icon.svg`)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024"><rect width="100" height="100" fill="#1A1248"/><circle cx="30" cy="30" r="13" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="5"/><circle cx="70" cy="30" r="13" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="5"/><circle cx="30" cy="70" r="13" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="5"/><circle cx="70" cy="70" r="13" fill="none" stroke="#FF587D" stroke-width="5"/></svg>
```

**Usage**
- All v2 rules stand: three filled and one open, in that order; clear space of one dot; minimum mark width 40 px; never animate it as a loader.
- **On light surfaces:** the colour lockup (navy dots and wordmark, coral ring).
- **On dark surfaces:** the white lockup (white dots and wordmark, coral ring). The charcoal background passes for the coral ring at 6.32:1.
- **App icon:** the navy tile is the same in both themes. Do not make a charcoal version.
- **Notification icon:** the one-colour 2×2 glyph, ring as an outline (v2 proposal file).

## 4. Type, spacing, radii, elevation

Type, spacing and radii are unchanged from v2 (`DESIGN-SYSTEM.md` §4–5 and `typography.md`).

- **Type:** Inter for all UI, with equal-width digits on every number. Scale: large-title 30/36, title 20/25, headline 17/22, body 16/21, subhead 14/19, caption 12/16, label 11.5/15, tab 10.5/13; numbers n-xl 34, hero 25, lg 22, md 17, sm 14.
- **Spacing:** 4 pt base (4, 8, 12, 16, 20, 24, 32). 16 is the screen margin and card padding.
- **Radii:** card 18, group and meal 16, button 14 (small 12), input 12, tag 6, chips and pills fully round, tab capsule 31.
- **Tap targets:** 44×44 minimum.

**Elevation changes in v3**

| Level | Light | Dark |
|---|---|---|
| 0 Background | none | none |
| 1 Card, group | `0 1px 2px rgba(var(--sh),.04), 0 0 0 .5px var(--edge)` | no shadow; `0 0 0 1px var(--edge)` |
| 2 Primary button | **no shadow** (the v2 coloured glow is removed) | no shadow |
| 3 Tab bar, minibar, rest bar | `0 8px 28px rgba(var(--sh),.14)` on `--glass` with blur | `--glass` with blur and a 1 px edge |
| 4 Sheet, dialog | shadow over `--scrim` | 1 px edge over `--scrim` |

In dark, depth comes from surface lightness (`--bg` → `--card` → `--fill` → `--fill2`), not from shadows.

## 5. Components

Sizes and structure are as v2. This section records the colour of each part.

**Buttons**
- **Primary:** `--brand` fill, `--on-brand` label. No shadow.
- **Secondary:** `--fill` fill, `--ink` label.
- **Tint:** `--brand-tint` fill, `--brand-ink` label.
- **Outline:** `--card` fill, 1 px `--line2` edge, `--ink` label.
- **Danger:** `--crit` fill, `--on-brand` label. Quiet danger: `--crit-tint` fill, `--crit` label.
- **Disabled:** `--fill2` fill, `--ink4` label.

**Chips and pills**
- Default chip: `--card` with a `--line2` edge. Selected: `--ink` fill, `--on-brand` label.
- Workout chip: `--fill`. **Coach target chip:** `--coach-tint` fill, `--coach-ink` label.

**List rows and cards**
- Card and group: `--card` on `--bg`. Dividers: `--line`. Chevrons: `--ink4`. Row icon tile: `--fill` with an `--ink2` icon.

**Sheets, dialogs, toasts**
- Sheet and dialog: `--card` over `--scrim`, with the live screen visible behind.
- Toast: `--navy` fill with white text and a white-tint action. In dark `--navy` is `#33333C`.

**Tab bar**
- `--glass` capsule. Active tab: `--brand-tint` pill, `--brand` icon and label. Inactive: `--ink2`.
- Badge and dot: `--coral-strong` with a navy numeral and a 2 px `--card` ring.

**Rings and bars**
- Calorie ring and progress bars: `--brand` on a `--fill2` track.
- Macro bars: `--protein`, `--carbs`, `--fat`.
- Workout progress line: `--brand`. Rest-bar progress line: `--coral`.

**Week strip**
- Today: a 2.5 px `--coral-strong` ring around the date. Selected (not today): a 1.5 px `--brand` ring.
- Done day: a `--done` dot under the date.

**Diet**
- Logged meal: `--done` tick. **Due meal:** 1.5 px `--coral-strong` outline, "Due now" label, primary and secondary pills.

**Workout log**
- Done row: `--done-row` band, `--sn-done` set chip, `--done` tick button.
- Current row: `--row-cur` band, inputs on `--card`; the focused input has a 2 px `--brand` edge.
- **Coach targets in inputs:** `--ghost`. Coach cue avatar: `--coach`.
- PR tag: `--pr` on `--pr-tint`. Trainee-added set: `--brand`, semibold.

**Keypad**
- Sheet `--kbd`; keys `--card`; function keys `--kbd-fn`; primary key `--brand` with `--on-brand`.

**Banners**
- Info, warn, danger and done use their `-tint` fill and `-ink` text. Neutral uses `--fill` and `--ink2`.

**Empty, error and offline states**
- Icon tile: `--brand-tint` with a `--brand` icon. Skeletons: `--skel1` to `--skel2`.
- Offline uses the neutral banner. Errors reassure first and use the quiet danger style, never a full red screen.

**Trainer**
- Client avatars keep six soft colour pairs, each with a dark-theme pair (see §9).
- Severity chips keep their v2 hues with the v3 values of `--crit`, `--warn`, `--info` and `--done`.

## 6. Iconography and illustration

- Lucide icons, 1.75–2 px stroke, 20–24 pt, as v2. One family only. Icons take `currentColor`.
- Do not copy icons, illustrations, fonts or logos from any other app.
- **Still open from v2:** exercise pictures, photo placeholders and empty-state illustrations are placeholders. v3 only neutralises the placeholder colours. FitBud needs its own exercise image set (commissioned, licensed, or the coach's own stills).

## 7. Motion and haptics

Names and intent only. Figma specifies the detail later.

| Name | Intent |
|---|---|
| `set-done` | The row band and tick confirm a logged set. Light impact. |
| `meal-confirm` | The meal tick confirms "Eaten as planned". Light impact. |
| `rest-end` | The rest bar finishes. Success notification haptic. |
| `sheet-in` / `sheet-out` | Sheets rise over the dimmed live screen and leave the same way. |
| `swipe-reveal` | A set row reveals its actions without hiding the set number. |
| `theme-switch` | Light and dark cross-fade. No slide. |
| `logo-sting` | Three dots appear, then the ring draws. Never loops. |
| `keypad-tick` | Selection tick on keypad and stepper presses. |
| `destructive-confirm` | Warning haptic before a destructive confirm. |

No confetti, no bounce, no counting-up numbers. With Reduce Motion on, everything cross-fades.

## 8. Voice and tone

Unchanged from v2 §10: clear, encouraging, human, brief. Name the coach. No guilt after a miss. Errors reassure first. A nudge is always a FitBud push notification; WhatsApp is only a redirect.

One copy fix carried over from `NUDGE-AND-WHATSAPP.md`: the push preview title on TM-04b reads **"Rahul nudged you"**, not "Rahul · FitBud".

## 9. Per-area notes for the re-render

Colour only. No layout changes in any area.

| Area | Note |
|---|---|
| **Onboarding** | Buttons and focused fields are navy; the logo lockup is unchanged; the "coming soon" and helper text use `--ink3`. |
| **Today** | Today's date gets the coral ring; the workout hero card is navy in light and a raised `--fill` card with an off-white button in dark. |
| **Workout** | Targets and the target chip are periwinkle; done rows stay green; exercise names are navy; the rest-bar line is coral. |
| **Diet** | The due meal has the coral outline; macro bars are three steps of ink; logged ticks stay green. |
| **Check-in** | Selected rating boxes are `--ink` fill; photo placeholders become neutral grey. |
| **Progress** | The weight line and points are `--brand`; all other colours follow the tokens. |
| **Notifications** | Unread dots and badges are coral; a coach nudge row uses the coach avatar colour. |
| **More** | Row icon tiles are neutral; destructive rows use `--crit`; toggles stay green when on. |
| **Sync** | Sync chips keep their v2 status hues at v3 values; a conflict uses the warn banner. |
| **Trainer: Needs you** | Summary tiles and tags keep their status hues at v3 values; "Review" and "Reply" buttons are neutral `--fill`. |
| **Trainer: Clients and client** | Avatar pairs get dark values; the time-zone chip uses info. |
| **Trainer: Review and nudge** | The nudge preview title reads "Rahul nudged you"; the selected template chip is `--ink` fill. |
| **Trainer: Check-ins** | Week-on-week deltas keep their v2 hues at v3 values; photo placeholders are neutral. |

**Colours written inside the screen scripts.** v2 has hex values in the Python scripts as well as the stylesheet. For v3 these move to tokens so both themes work.

| v2 value in scripts | v3 |
|---|---|
| `#4527C6`, `#3A1FB0`, `#16123A`, `#1B1546` | `var(--brand)` or `var(--ink)` |
| `#EEEAFF`, `#DCD4FF` | `var(--brand-tint)`, `var(--brand-tint2)` |
| `#9C8CEB`, `#2B1F70`, `#6b4fd6` | `var(--ghost)` or `var(--coach)` |
| `#8F8BA6`, `#5A5672` | `var(--ink3)`, `var(--ink2)` |
| `#F7F5FF`, `#F1EFF6`, `#E9E7F1` | `var(--row-cur)`, `var(--fill)`, `var(--fill2)` |
| `#0B0A12` (status bar and home indicator) | `var(--ink)` |
| Workout hero gradient `#2A1C7A → #1B1546` | New token pair: navy `#2E2370 → #1A1248` in light, flat `#26262E` in dark; its button is `#FFFFFF` on navy in light and `--brand` in dark |
| Avatar pairs such as `#FDE7E4` / `#B0322A` | Six `--av-N-bg` / `--av-N-fg` token pairs. Dark rule: background is a dark tint of the hue near `#3A1F20`, text is a light tint at 4.5:1 or better |
| Photo placeholder gradients `#cfc8e8 → #9d93c4` | Neutral: `--fill2 → --ink4` |

The lock-screen wallpaper gradients (TR-15c, TM-13a) are not app UI and stay as they are.

## 10. Changelog from v2

**Colour**
- Primary changed from indigo `#4527C6` to navy `#1A1248`, the logo's own colour.
- Added the coral tokens. Coral now marks today and due.
- Added the coach tokens. Periwinkle now marks anything from the coach; `--ghost` moved from `#9C8CEB` (2.85:1) to `#5448C8` (6.69:1).
- Neutrals lost their purple cast: `--bg` `#F4F3F8` → `#F4F5F8`, `--fill` `#EFEEF5` → `#ECEEF3`, `--fill2` `#E7E5F0` → `#E3E5EC`.
- Contrast fixes: `--ink3` `#8F8BA6` → `#66657C`, `--done` `#0A8A5C` → `#0B7A55`, `--warn` `#B25E09` → `#A65400`, `--crit` `#C9372C` → `#B3261E`, `--info` `#2457B8` → `#1F5FBF`, `--pr` `#A9780A` → `#8C5E00`.
- Macro bars changed from navy, violet and teal to three steps of ink.
- Primary button glow shadow removed.
- Badges and notification dots changed from red to coral with a navy numeral.

**Theme**
- New dark theme on `body.dark`, charcoal `#0F0F13` with `#1A1A20` cards. A navy dark theme and a true-black one were tried and rejected.
- The hard-coded colours in `kit.css` (34 uses of `#fff` and about 20 other fixed values) became tokens.
- New component tokens: `--on-brand`, `--bg-plain`, `--row-cur`, `--row-skip`, `--sn-done`, `--kbd`, `--kbd-fn`, `--skel1`, `--skel2`, `--fade0`, `--fade1`, `--glass`, `--scrim`, `--sh`, `--edge`, and the `-ink` status tokens.

**Unchanged**
- Logo, app icon, Inter, type scale, spacing, radii, icons, layouts, flows, screen IDs, copy (apart from the one nudge title).

## 11. Open items

- **Trainer status tags.** A proposal to keep only red and amber and make the other tags neutral was not decided. v3 keeps all v2 tag hues.
- **Exercise pictures and illustrations.** Still placeholders; needs a sourcing decision.
- **Android frame.** v2 and v3 mocks use the iOS frame only. The tokens are platform-neutral.
- **Copy.** TM-01a reads "1 mentions pain"; TR-01b offers a WhatsApp sign-in code marked "coming soon", which conflicts with the WhatsApp rule. Neither is changed in v3.
- **Device check.** The dark theme was judged on rendered mocks, not on a phone build.
