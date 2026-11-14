# FitBud mobile design v2: handoff for visual refinement

**What this is.** A complete, structure-first set of mobile mocks for FitBud: 180 screens (103 trainee, 77 trainer), 27 end-to-end flows, and a tap-coverage audit. Every tappable element on every mock leads to a screen, a state, back, an external app or a marked Later item. Prepared 14 Nov 2026 (IST) for a visual refinement pass by Claude (Fable 5.2 as design refiner).

**What it is not.** It isn't final visual design. The structure, coverage and copy are settled; the look is "okayish". Read `WHY-NOT-SATISFIED.md` before you touch anything.

Drop this folder into the repo at `docs/design/v2/`. All links are relative.

## How to read it

1. `screen-profile.md` lists every screen ID with its PNG, purpose and the flows that use it, plus totals, open decisions and the deferred list. **Start here.**
2. `flows/flows.md` covers user goals → flows → steps. `flows/index.md` gives each flow's screens and tap-coverage result. Then look at the sheets in `png/flows/`.
3. `WHY-NOT-SATISFIED.md`: what's wrong with the design so far and what v2 still lacks.
4. `NUDGE-AND-WHATSAPP.md`: the product rule and how the current code differs from it.
5. `DESIGN-SYSTEM.md` (and `DESIGN-SYSTEM.pdf`): logo (Honest Week: the v1 R2-B four-dot mark, Navy dots and a Coral open ring), colour derived from Navy + Coral (provisional), type, spacing and components.
6. `union-map.md` and `typography.md`: the v1 rules that still apply (which screens are shared by trainee and trainer, and the Inter type scale). They are copied unchanged from v1, so their references to v1 images and reference-app captures point to files that are not in this package.
7. `gap-audit.md`: history of the gaps found and fixed (Phases A–C).
8. `CLAUDE-PROMPT.md`: the brief for the refinement session.

## Folder map

| Path | Contents |
|---|---|
| `png/trainee/` | 103 trainee screens, 393×852 pt @3x (1179×2556 px), named `<ID>-<slug>.png` |
| `png/trainer/` | 77 trainer screens, same size |
| `png/flows/` | 27 flow sheets (`F01`…`F28`): thumbnails in order, arrows, red numbered tap rings |
| `png/sheets/` | contact sheets per area (`trainee-<area>.png`, `trainer-<area>.png`) |
| `flows/` | `flows.md`, `index.md` |
| `assets/logo/` | Honest Week four-dot mark and lockup (colour, white, mono), 2×2 app icon (1024/180/48), proposals (larger-dot icon, notification icon); `not-chosen-v2-strip/` holds the rejected v2 strip wordmark for reference only |
| `assets/ds/` | images used in DESIGN-SYSTEM (logo board, icons, clear space, palette, colour proposals, type) |
| `src/` | the mock kit and build scripts (see `src/README.md`) |
| `screen-profile.md`, `gap-audit.md`, `typography.md`, `union-map.md` | reference docs |

## Conventions

- Screen IDs: `TR-xx` trainee, `W-xx` trainee workout, `TM-xx` trainer mobile. `TW-xx` (trainer web) is referenced but not mocked here. Letter suffixes are states of the same screen.
- Demo data: trainee **Aarav Sharma**, coach **Rahul Verma**, dual-role **Karan Malhotra**; date Sat 14 Nov 2026. The trainer roster is listed in `screen-profile.md`.
- PNGs were quantised with no visible quality loss (pngquant 82–98 + oxipng) to keep the package small. Re-render from `src/` for pixel-exact masters.
- Light mode, iOS frame only.
