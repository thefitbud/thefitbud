# Decisions taken during the v3 re-render

Work done on the box by FitBud UI (Grok Bot), 14 Nov 2026 (IST). Model: Grok Bot for every step (planning, conversion, rendering, review); no model switches.

1. **Theme applied at render time.** One HTML set; `render.mjs` adds `body.dark` for `THEME=dark`. `screen()` also honours `THEME`. Reason: `overlay()` screens copy their base HTML, so one HTML set keeps both themes identical in structure.
2. **Light status bar is now `--ink` (#1A1248), not #0B0A12.** Reason: brief and spec §9 say status bar and home indicator use `--ink`.
3. **`kit-v3.css` token values untouched; additions appended in a separate block.** Reason: the spec forbids hand-editing spec values; the additions are easy to diff.
4. **Six avatar pairs (rose, green, amber, blue, plum, teal).** v2 had nine hues; Ishita shares rose with Rohan, Neha shares green with Meera, Priya shares amber with Sneha; Farhan and ended/invited clients use neutral `--fill`. Reason: the spec asks for six pairs.
5. **Avatar violet became plum (`#F3E8FB`/`#7A2E9E`).** Reason: the v2 indigo pair would read as leftover indigo next to periwinkle coach colour.
6. **Amber and teal avatar text darkened slightly (`#8F5205`, `#0F7078`).** Reason: the v2 values passed only narrowly (4.91 and 4.60); they now measure 5.59 and 5.12.
7. **Dark avatar pairs:** dark hue tints near `#3A1F20` with light text at 8.8–9.6:1. Reason: spec §9 rule.
8. **Workout hero:** light `#2E2370 → #1A1248`, dark flat `#26262E`; button white on navy in light, `--brand` off-white with dark text in dark. The exercise video placeholder (W-27) uses the same pair. Reason: spec §9.
9. **App icon tiles in push previews and on lock screens use `--icon-tile` (navy in both themes).** Reason: spec §3, the app icon never goes charcoal.
10. **Lock screens (TR-15c, TM-13a): wallpaper kept; notification glass follows the theme** (white glass in light, dark glass in dark). Reason: wallpapers are not app UI (spec §9), but white glass on a dark-theme phone would be wrong, and `--ink` text would be unreadable on it.
11. **TM-06f photo viewer stays black in both themes (`--media-bg`).** Reason: a media viewer, not app chrome; the selected chip is white with navy text (`--white`, `--fixed-navy`).
12. **Rest-ended bar (W-05b) uses `--done` with `--on-brand` text.** Reason: white text on dark-theme green `#3FCB93` would be about 2:1.
13. **Trainer week dots: "today" is a 2.5 px coral ring.** Reason: spec §1, coral means today, matching the trainee week strip.
14. **Needs-you card buttons ("Review", "Reply") are `secondary` (`--fill`).** Reason: spec §9 "neutral `--fill`".
15. **Notifications inbox: unread dot coral; coach-sent rows use coach tint/ink.** Reason: spec §9 Notifications.
16. **"Due now" label on the due meal uses `--coral-ink`.** Reason: spec §1, coral text must use `--coral-ink`; matches Firoz's reference render.
17. **TM-01a copy is "1 with pain", not "1 client mentions pain".** Reason: the longer form wrapped to two lines (WRAP warning); "1 with pain" is grammatical and fits.
18. **TR-01b: removed the WhatsApp code option entirely** (switch, tag and helper line) and said "email" in the subtitle. Reason: WhatsApp is only a redirect. This is the only layout change in v3.
19. **Photo placeholders:** `--fill2 → --ink4` (spec), and a lighter `--fill → #C3C5D0` pair for the "older week" tone. Figure silhouettes kept as white at 33–40% opacity.
20. **PR banner (W-12) keeps its gradient** via `--pr-tint → --pr-tint2`, with `--pr-ink`/`--pr-ink2` text. Reason: no layout or style change, only colour.
21. **Contact-sheet and flow-sheet chrome** (sheet backgrounds, labels, red tap rings) keep fixed colours. Reason: not app UI (brief step 3).
22. **Text-contrast audit (`textcheck.mjs`) exempts `--ink4`.** Reason: spec §2.3 says `--ink4` is for disabled content only (zero tiles, the resend countdown, unfilled set placeholders).
23. **PNG compression:** pngquant `--quality=70-95 --speed 3` then oxipng level 2, the same tools as v2.

## Left for later
- Status-tag simplification (spec §11) is still undecided; v3 keeps every v2 tag hue.
- Exercise pictures and illustrations are still placeholders. The mocks use the iOS frame only, and the dark theme has not been checked on a phone.
