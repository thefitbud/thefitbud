# Z12-17 · System states (error, not found, offline, forbidden)

Captures at 1440×900 against locked frames in `docs/design/mockups/png/`.
Demo: `rahul.coach@demo.fitbud.test` / `FitBud-demo-2026`.
Re-run: `TRAINER_WEB_URL=http://127.0.0.1:5173 node docs/qa/Z12-17/capture.mjs` (then offline-only follow-up if home needs a longer settle).

| Frame | Built | Grade | Notes |
|---|---|---|---|
| `184-trainer-web-error-web.png` | `184-trainer-web-error-web-1440x900.png` | **MATCH** | Centred card, icon, Retry, Email support, Details. Stubbed workspace 500. |
| `185-trainer-web-not-found-web.png` | `185-trainer-web-not-found-web-1440x900.png` (+ `--client`) | **MATCH** | In-shell card + Go to Clients (unknown route and unknown client id). |
| `186-trainer-web-offline-web.png` | `186-trainer-web-offline-web-1440x900.png` | **MATCH** | Wifi-off icon + “Showing what was loaded at …”. Clock is live capture time, not the frame’s sample 9:38 am. |
| `187-trainer-web-forbidden-web.png` | `187-trainer-web-forbidden-web-1440x900.png` | **MATCH** | Lock card via stubbed 403. Live API returns 404 for another coach’s client (see PR follow-up). |

design-review tool not on main yet (spec note).
