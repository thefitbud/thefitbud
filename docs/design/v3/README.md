# FitBud mobile design v3: colour system and dark theme (mocks)

v3 is a **colour and theme release** on top of the approved v2 layouts: the same 180 screens, IDs, flows and copy (apart from the copy fixes in `CHANGELOG.md`), plus **5 screens added for W12** on 14 Nov 2026 from Firoz's device findings (TR-26e, TR-26f, TR-07k, W-01e, TR-15d; see `CHANGELOG.md`). **185 screens: 108 trainee, 77 trainer.** Rendered 14 Nov 2026 (IST) at 393×852 pt @3x (1179×2556 px). This folder is the design source of truth for W12 (`docs/plan/w12/W12-PROMPT.md`).

- `DESIGN-SYSTEM-v3.md`: the approved spec (authority for colour). `kit-v3.css`: the stylesheet as delivered with the spec.
- `src/kit.css`: `kit-v3.css` unchanged, plus one appended "v3 additions" block (tokens for colours that were hard-coded in the scripts; see `DECISIONS.md`).
- `CHANGELOG.md`: what changed, by file. `DECISIONS.md`: decisions taken during the re-render. `CHECKS.md`: check results.

## Folder map

| Path | Contents |
|---|---|
| `png/trainee/`, `png/trainer/` | 185 light screens (`<ID>-<slug>.png`) |
| `png-dark/trainee/`, `png-dark/trainer/` | the same 185 screens in the dark (charcoal) theme |
| `png/sheets/`, `png-dark/sheets/` | 16 contact sheets per theme (`<side>-<area>.png`) |
| `png/flows/` | 28 flow sheets (light): F01–F17, F02b, F20–F29 with numbered tap rings |
| `before-after/` | one sheet per area: v2 · v3 light · v3 dark, side by side |
| `flows/` | `flows.md`, `index.md` (tap coverage per flow) |
| `screen-profile.md` | every screen ID with purpose and flows |
| `src/` | the build scripts (below) |

## Re-run

Needs Python 3 with Pillow and numpy, Node with `playwright-core`, Google Chrome, and the Inter font (SIL OFL). The scripts use box paths: edit the `playwright-core` import and Chrome path in `render.mjs`, `locate.mjs`, `textcheck.mjs`, `layoutdiff.mjs`, and the font path in `sheets.py`, `flowsheet.py`, `beforeafter.py`. Run everything from `src/`.

```bash
# 1. HTML (one set; the theme is applied at render time)
for s in a_onboarding a_today a_workout a_diet a_rest b_needsyou b_review b_clients b_client b_coachlog b_checkins b_more c_gaps_trainee c_gaps_trainer d_w12; do python3 $s.py; done
# 2. PNGs + overflow checks (CLIP, OFFSCREEN, WRAP, OVERLAP); FORCE=1 re-renders all, an optional prefix limits it
for t in light dark; do for side in trainee trainer; do SIDE=$side THEME=$t FORCE=1 node render.mjs; done; done
# 3. contact sheets per theme
for t in light dark; do for side in trainee trainer; do SIDE=$side THEME=$t python3 sheets.py; done; done
# 4. tap coverage + flow sheets (light) + docs
python3 taps.py && python3 tapmap.py && python3 flows.py && node locate.mjs && python3 flowsheet.py && python3 gendocs.py
# 5. checks
python3 contrast.py                                   # spec §2.3 pairs + added tokens, both themes
for t in light dark; do for side in trainee trainer; do SIDE=$side THEME=$t node textcheck.mjs; done; done   # DOM text contrast
node layoutdiff.mjs                                   # element boxes vs v2 (needs ../../v2/html)
python3 scan.py                                       # pixel scan: leftover v2 indigo (trainee and trainer screens)
# 6. before/after sheets, then compress
python3 beforeafter.py <area> ...   # areas from screen-profile.md; each run writes both sides, delete empty sheets
./compress.sh
```

**Theme switch.** `THEME=dark` makes `render.mjs` add `class="dark"` to `<body>` before the screenshot and write to `png-dark/`. `kit.py`'s `screen()` also honours `THEME=dark` if you want dark HTML files. The status bar and home indicator take `--ink` (`.hi.light` and `statusbar(dark=True)` stay white on wallpapers and the photo viewer).
