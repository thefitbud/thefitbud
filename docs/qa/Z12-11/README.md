# Z12-11 · Workout / nutrition builders + conflict

Captures at **1440×900**, demo trainer `rahul.coach@demo.fitbud.test`, client Rohan (Adjust plan draft).

| Frame | Capture | Grade | Notes |
|---|---|---|---|
| `152-trainer-web-workout-builder-web.png` | `152-…-1440x900.png` | **CLOSE** | Library left, day tabs, exercise cards, properties (Sets/Reps/Weight/Rest/Coach cue), Draft pill, Preview, **Publish & schedule**. Library rows still use search-pane “Add to session” chrome (outside `files_owned`). |
| `153-trainer-web-workout-builder-conflict-web.png` | `153-…-1440x900.png` | **MATCH** | Red banner “Couldn't save… another device…”, **Compare versions** + **Keep mine** (ink primary). |
| `154-trainer-web-nutrition-builder-web.png` | `154-…-1440x900.png` | **CLOSE** | Foods left, macro tiles, meal cards, meal properties with **Swaps allowed**. Plan total from meal snapshots (no separate kcal target in contracts — follow-up). |

**design-review tool:** not on main yet (Z11-1). Visual check is frame ↔ capture side by side.

**Tap-through:** `node docs/qa/Z12-11/tapthrough.mjs` — Publish/Preview/day tab/exercise card/Sets focus rings pass; Tab from Preview → Publish & schedule.

**Scripts:** `capture.mjs`, `tapthrough.mjs` (TRAINER_WEB_URL default `http://127.0.0.1:5174`).
