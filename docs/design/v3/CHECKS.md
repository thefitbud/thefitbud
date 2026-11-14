# v3 check results (14 Nov 2026, IST)

| Check | Light | Dark |
|---|---|---|
| Screens rendered (trainee + trainer) | 108 + 77 = 185 | 108 + 77 = 185 |
| Overflow (`render.mjs`: CLIP, OFFSCREEN, WRAP, OVERLAP) | 0 issues | 0 issues |
| Contact sheets | 16 | 16 |
| Text contrast on the live DOM (`textcheck.mjs`, every text leaf vs its background, < 3:1 flagged, `--ink4` exempt) | 0 | 0 |
| Layout vs v2 (`layoutdiff.mjs`, every element box) | 170 of 180 identical (5 new screens have no v2) | 170 of 180 identical |
| Leftover v2 indigo (`scan.py`) | 0 screens (the TR-15c, TR-15d and TM-13a wallpapers are skipped, kept by spec) | 0 screens |

- **Layout differences** are only the copy fixes: TR-01b (WhatsApp option removed); TM-04b, TM-04c, TM-04n, TM-04o (one box each: the nudge title text width); TR-26d (Create and Ate out buttons, W12); TM-01a2, TM-02a, TM-02f, TM-13b (one box each: "Priya Nair" text width).
- **Tap coverage** (light; taps are theme-independent): 185 screens, 1,584 tappables, 0 unresolved (TAP GAP 0); 28 flows, 202 steps, no problems; `locate.mjs` 0 unlocated of 100.
- **W12 re-run (14 Nov, after the 5 new screens and the Priya Nair rename):** overflow 0 in both themes; textcheck 0 for trainee and trainer in both themes (TR-15d's wallpaper text is skipped like TR-15c; the two hits were white lock-screen text measured against the page, not the wallpaper); 16 contact sheets and 16 before/after sheets per theme regenerated; changed PNGs compressed with pngquant + oxipng.
- **Anchor screens** (TR-06a, W-03, TR-07a, TM-01a, TM-04b) were rendered first in both themes and compared against Firoz's approved renders. The main surface colours match: light `#F4F5F8` / `#FFFFFF`; dark `#0F0F13` / `#1A1A20` / `#26262E`; done row `#11211C` / `#F1FAF5`.

## Contrast (`python3 src/contrast.py`)

| Pair | Need | Light | Dark |
|---|---|---|---|
| **spec §2.3** | | | |
| `--ink` on `--bg` | 4.5 | 15.74 | 17.13 |
| `--ink` on `--card` | 4.5 | 17.16 | 15.51 |
| `--ink2` on `--card` | 4.5 | 9.32 | 8.63 |
| `--ink2` on `--fill` | 4.5 | 8.03 | 7.48 |
| `--ink3` on `--bg` | 4.5 | 5.18 | 6.22 |
| `--ink3` on `--card` | 4.5 | 5.65 | 5.64 |
| `--ink3` on `--fill` | 4.5 | 4.87 | 4.88 |
| `--on-brand` on `--brand` | 4.5 | 17.16 | 16.86 |
| `--coach-ink` on `--card` | 4.5 | 7.62 | 8.76 |
| `--coach-ink` on `--coach-tint` | 4.5 | 6.48 | 7.55 |
| `--coral-strong` on `--card` | 3.0 | 3.68 | 5.73 |
| `--coral-strong` on `--bg` | 3.0 | 3.37 | 6.32 |
| `--coral-ink` on `--card` | 4.5 | 5.36 | 8.04 |
| `--coral-ink` on `--coral-tint` | 4.5 | 4.60 | 6.98 |
| `#1A1248` on `--coral-strong` | 4.5 | 4.67 | 5.67 |
| `--done` on `--card` | 4.5 | 5.34 | 8.39 |
| `--done` on `--done-tint` | 4.5 | 4.69 | 6.84 |
| `--on-brand` on `--done` | 4.5 | 5.34 | 9.12 |
| `--ink3` on `--done-row` | 4.5 | 5.31 | 5.43 |
| `--warn` on `--warn-tint` | 4.5 | 4.86 | 7.82 |
| `--crit` on `--crit-tint` | 4.5 | 5.68 | 6.59 |
| `--info` on `--info-tint` | 4.5 | 5.31 | 6.88 |
| `--pr` on `--pr-tint` | 4.5 | 5.16 | 8.06 |
| `--carbs` on `--fill2` | 3.0 | 5.69 | 6.23 |
| `--fat` on `--fill2` | 3.0 | 3.33 | 3.48 |
| **v3 re-render additions** | | | |
| `--hero-fg` on `--hero-b` | 4.5 | 17.16 | 13.44 |
| `--hero-fg` on `--hero-a` | 4.5 | 13.20 | 13.44 |
| `--hero-btn-fg` on `--hero-btn` | 4.5 | 17.16 | 16.86 |
| `--hero-btn` on `--hero-b` | 3.0 | 17.16 | 13.44 |
| `--white` on `--icon-tile` | 4.5 | 17.16 | 17.16 |
| `--toast-ok` on `--navy` | 3.0 | 10.80 | 7.87 |
| `--white` on `--navy` | 4.5 | 17.16 | 12.50 |
| `--pr-ink` on `--pr-tint` | 4.5 | 8.67 | 9.91 |
| `--pr-ink2` on `--pr-tint2` | 4.5 | 5.24 | 7.35 |
| `--wa-ink` on `--wa-bubble` | 4.5 | 4.59 | 8.04 |
| `--on-coach` on `--coach` | 4.5 | 6.69 | 8.40 |
| `--ghost` on `--row-cur` | 4.5 | 6.14 | 7.59 |
| `--on-brand` on `--crit` | 4.5 | 6.54 | 8.25 |
| `--on-brand` on `--ink3` | 4.5 | 5.65 | 6.13 |
| `--on-brand` on `--ink2` | 4.5 | 9.32 | 9.38 |
| `--done` on `--on-brand` | 3.0 | 5.34 | 9.12 |
| `--av1-fg` on `--av1-bg` | 4.5 | 5.31 | 8.86 |
| `--av2-fg` on `--av2-bg` | 4.5 | 4.70 | 9.57 |
| `--av3-fg` on `--av3-bg` | 4.5 | 5.59 | 9.47 |
| `--av4-fg` on `--av4-bg` | 4.5 | 6.16 | 9.39 |
| `--av5-fg` on `--av5-bg` | 4.5 | 6.54 | 9.17 |
| `--av6-fg` on `--av6-bg` | 4.5 | 5.12 | 8.84 |

47 pairs x 2 themes, 0 below threshold
