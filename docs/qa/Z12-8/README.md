# Z12-8 · Activity + check-in review

Captures: Playwright Chromium, demo seed (`rahul.coach@demo.fitbud.test`), API `:8787` / web `:5173` (or `:8788` / `:5174`).

**design-review tool:** not on main yet (Z11-1). Grades are by eye vs locked frames.

| Frame | Viewport | Grade | Notes |
|---|---|---|---|
| `158-trainer-web-activity-web.png` | 1440×900 | **CLOSE** | Segments styled; `Meals · this week` card; semantic chips. Seed this-week mix differs from frame Sat/Fri history. Type filter stays Workouts/Meals/Check-ins per TW-17. |
| `159-trainer-web-activity-meal-panel-web.png` | 1440×900 | **PASS** | Opens **Changed** lunch (Tue 17 Nov): Planned vs Logged compare, reason, logged-at. Seed has no itemised logged items / photo (frame shows both) — kcal compare + Changed pill match. |
| `163-trainer-web-checkin-review-web.png` | 1440×900 | **PASS** | **Your review** first in the right column; Save review + Message on WhatsApp in the first viewport. Context below (not burying actions). |
| `164-trainer-web-checkin-reviewed-web.png` | 1440×900 | **PASS** | Reviewed card first; **Reviewed** pill + Edit review in the first viewport. Context under review. |
| `198-ipad-checkin-review-ipad.png` | 1024×768 | **PASS** | Stacks at 1024×768: answers then Your review (then Context). |

## Tap-through
1. Clients → Rohan → Activity → Meals → **Changed** → View on the Changed lunch (drawer planned vs logged).
2. Check-ins inbox or Deepak → submitted check-in → Your review → Save / WhatsApp.
3. Rohan reviewed check-in → Reviewed pill → Edit review.

## Re-run
```bash
FITBUD_API_PORT=8788 pnpm db:reset
# API :8788 + web :5174 with FITBUD_API_PORT=8788
TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-8/capture.mjs
```

## Follow-ups
- WorkspaceHeader layout (out of files_owned; D-W12b-3).
- Activity type chips All/Weight if product adds those filters later (API is one type at a time).
- Meal panel WhatsApp draft could mention the meal; Add note deep-link is overview `?note=1` (composer ownership elsewhere).
