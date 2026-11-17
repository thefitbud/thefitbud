# Z12-15 · Settings profile + notifications

Captures at 1440×900 against locked frames in `docs/design/mockups/png/`.
Demo: `rahul.coach@demo.fitbud.test` / `FitBud-demo-2026`.
Re-run: `TRAINER_WEB_URL=http://127.0.0.1:5173 node docs/qa/Z12-15/capture.mjs`.

| Frame | Viewport | Capture | Grade | Notes |
|---|---|---|---|---|
| `176-trainer-web-settings-profile-web.png` | 1440×900 | `176-trainer-web-settings-profile-web-1440x900.png` | **CLOSE** | Avatar + Change photo, +91 WhatsApp, India (IST) select, ink Save changes, subnav icons, quiet Sign out. Extra Change password card below (not in frame; kept for product). Subnav keeps live routes (Ended clients / Units / Privacy) instead of frame-only WhatsApp / Account. Seed WhatsApp digits differ from frame sample. |
| `177-trainer-web-settings-notifications-web.png` | 1440×900 | `177-trainer-web-settings-notifications-web-1440x900.png` | **CLOSE** | Toggle rows + single quiet-hours row match frame copy/layout. Subnav route set same as profile (not frame’s WhatsApp / Account). Hidden API categories (`askCoach`, `mealTimesChanged`) stay at server values with no web row (D-W12b-1). |

design-review tool ran (`docs/qa/Z12-15/design-review.md`); ImageMagick not available for pixel scores — graded by eye.
