# Mock kit and build scripts

The mocks are HTML built by Python and rendered to PNG with Playwright and Chrome.

- `kit.css`: tokens (colours, type scale, radii, shadows) and component styles. **This is the token source of truth for v2.**
- `kit.py`: shared components (status bar, nav, tab bar, buttons, list rows, sheets, dialogs, toasts, banners, week strip, ring, macro bars, meal rows, set rows, keypad, rest bar, …), `screen()` and `overlay()`.
- `kit_trainer.py`: trainer components (client avatar, severity chips, Needs-you cards, group headers, summary tiles, client header, week dots, WhatsApp bubble) and the demo roster.
- `a_*.py` trainee screens, `b_*.py` trainer screens, `c_*.py` Phase C gap screens.
- `render.mjs` renders HTML → PNG and runs the overflow checks (CLIP, OFFSCREEN, WRAP, OVERLAP).
- `sheets.py` builds contact sheets; `taps.py` → `tapmap.py` → `flows.py` (with `flows_def.py`) → `locate.mjs` → `flowsheet.py` → `gendocs.py` is the tap-coverage and flow-sheet pipeline.
- `icons.json`: Lucide icon paths (ISC licence). `addicons.py` and `icons.mjs` add more from the repo's `lucide-react`.

**To run on another machine:** the scripts use absolute paths from the original box (`/workspace/...`, `/usr/bin/google-chrome`, a system Inter font). Edit the import of `playwright-core` and the Chrome path in `render.mjs` and `locate.mjs`, and the font path in `sheets.py` and `flowsheet.py`. Output goes to `../html/<side>/` and `../png/<side>/`; `_work/` (registry, tap map) is regenerated. Inter must be installed (SIL OFL). Run from `src/`, for example `python3 a_today.py && node render.mjs TR-06`; use `SIDE=trainer` for trainer scripts.
