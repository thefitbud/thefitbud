# Z12-1 · Web and iPad sign in

Captures at frame viewports (deviceScaleFactor 1), demo API on spare ports. Graded by eye against locked frames in `docs/design/mockups/png/`.

| Frame | Viewport | Capture | Grade | Notes |
|---|---|---|---|---|
| `01-trainer-web-signin.png` | 1440×900 | `01-trainer-web-signin-1440x900.png` | **CLOSE** | Hero glimpse chips now have icons (Critical / Attention / To review). Ink primary. DS5 legal footer kept (not in frame 01; intentional). |
| `197-ipad-signin-ipad-portrait.png` | 768×1024 | `197-ipad-signin-ipad-portrait-768x1024.png` | **CLOSE** | Form-only column spacing polished. Ink primary (v3 / W12b; locked PNG still shows pre-v3 periwinkle). DS5 legal footer kept. No device chrome (frame shows iPad status bar). |

Tap-through: `tap-through.json`. Design-review advisory: run `node scripts/qa/visual/diff.mjs --task Z12-1` when comparing.
