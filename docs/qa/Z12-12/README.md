# Z12-12 · iPad builder only

Captures at **1024×768** (194) and **768×1024** (195). Demo trainer `rahul.coach@demo.fitbud.test`, client Rohan (Adjust plan draft).

| Frame | Viewport | Capture | Grade | Notes |
|---|---|---|---|---|
| `194-ipad-builder-ipad.png` | 1024×768 | `194-…-1024x768.png` | **CLOSE** | Day tabs + exercise cards + properties on the right; Library icon toggle opens the drawer. Sample plan/data differs from frame (Rohan / Fat loss vs Vikram / Marathon). Workout/Nutrition + Undo remain (desktop path); frame omits them. No invented “about N min”. |
| `195-ipad-builder-readonly-ipad-portrait.png` | 768×1024 | `195-…-768x1024.png` | **CLOSE** | Banner copy matches. Week card with title · client, Draft pill, Mon–Sun incl. Rest. Portrait is fully non-editing: title input disabled, draft autosave off, Publish disabled (e2e). Builder topbar still shows back / title / Publish; frame has AppShell-only chrome + notice + card. No duration / “12 km easy” invention. Shell hamburger/breadcrumbs owned elsewhere. |

**design-review tool:** not on main yet (Z11-1). Visual check is frame ↔ capture side by side.

**Script:** `node docs/qa/Z12-12/capture.mjs` (`TRAINER_WEB_URL` default `http://127.0.0.1:5174`).

## Gaps re-checked vs `main` (after Z12-11 #471)

| P1 / batch gap | Status |
|---|---|
| 194: day tabs strip + properties at 1024 | Done — narrow = center + properties right; library drawer |
| 195: portrait read-only polish | Done — frame copy + week card; title + autosave gated like readOnly |
| Frame 200 | Out of scope (D-W12b-4 → Z12-10) |
| Inter / pure token colour | Dropped (D-W12b-7 / Z12-37) |
