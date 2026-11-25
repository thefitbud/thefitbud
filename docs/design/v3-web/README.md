# v3-web: trainer web redesign pack (W13)

Design pack for the trainer web v3 redesign (W13-1 … W13-12). Copied from FitBud UI's working folder on 25 Nov 2026 so a session with no access to that box can build W13-3 … W13-11. The plan and decisions are in [`docs/specs/batches/W13.md`](../../specs/batches/W13.md) ("W13 web redesign (as run)"); the per-task specs are [`docs/specs/W13-3.md` … `W13-11.md`](../../specs/).

## What is here
| File | What it is |
|---|---|
| `W13-WEB-PLAN.md` | The original task table (18–20 Nov 2026). Some paths and words are stale; the W13 batch file and the specs say what changed (W14 reconciliation). |
| `DESIGN-SYSTEM-v3-web.md` | Colour roles, the 8-step type scale, spacing, shell and scroll model, components, decisions D-WEB-1 … D-WEB-5, and §5.10 (keep the live exception resolver). |
| `kit-v3-web.css` | The CSS the mocks were drawn with. Reference for numbers (sizes, radii, gaps). W13-1 already ported it into `apps/trainer-web/src/styles/*` and `components/ui/*`: build with those, not with this file. |
| `png/` | 46 target frames at 2x: 1440×900 desktop, 1180×820 iPad landscape, 1024-wide iPad. Re-compressed (palette PNG, 85–98 quality) to fit the repo; layout, colour and text are unchanged. Frame IDs `W-<n>` are the ones the specs cite. |
| `live-resolver/FLOW.md` + 51 PNGs | What each control of the live exception resolver does, with the screenshots it cites (halved to 1x, palette-reduced). W13-6 and W13-11 restyle this flow. The words in it are older than W14; see the note at its top. |
| `check-web.mjs` | The mock checker (text under 12 px, clipped text, broken images) as it ran on the mock HTML. The HTML sources are not in the repo, so use the same checks on the live page: copy `textProblems()` from `apps/trainer-web/e2e/w13-2-shell.spec.ts` into your task's capture spec. |

## Not in the repo (kept on FitBud UI's box)
- `html/` (2.3 MB, the mock sources) and the build scripts (`build.mjs`, `render.mjs`, `lib.mjs`, `s-*.mjs`, `sheets.py`, `see.sh`, `package*.json`), because they only rebuild the PNGs.
- `sheets/` (18 MB): the before/after sheets `BA-1 … BA-9`. Where a plan row says "(BA-n)", the "before" is the current build on `main`; capture it yourself.
- `live-resolver/` raw logs and scripts (36 MB in all): `walk-*.log`, `run*.out`, `s0–s4.mjs`, `lib.mjs`, and the 2x originals.
- Exercise and food detail frames (X-08/09/10, M-05…M-08) are deferred until after launch (Firoz, 20 Nov 2026) and were never in the pack.

## Words in these frames are older than W14
Many frames print "Nudge", "Mark reviewed", "Marked reviewed" and "Reviewed, still open", and W-160 prints "71%". On `main` these are now **Remind**, **Noted, keep open**, **Noted by you**, **Noted, still open**, and no percentages. The banned-strings check fails the build on the old words. Use the frames for layout, spacing, colour and hierarchy; use the W14 words (see D-W13-5 in the W13 batch file).
