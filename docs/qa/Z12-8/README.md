# Z12-8 · Activity + check-in review

Captures: Playwright Chromium, demo seed (`rahul.coach@demo.fitbud.test`), API `:8788` / web `:5174`.

**design-review tool:** not on main yet (Z11-1). Grades are by eye vs locked frames.

| Frame | Viewport | Grade | Notes |
|---|---|---|---|
| `158-trainer-web-activity-web.png` | 1440×900 | **CLOSE** | Segments styled; `Meals · this week` card; semantic chips (As planned / Changed / Not logged yet). Seed this-week meals are all pending (frame shows mixed Sat/Fri history). Type filter stays Workouts/Meals/Check-ins per TW-17 (frame shows All/Meals/Workouts/Weight). State pills kept (TW-17). |
| `159-trainer-web-activity-meal-panel-web.png` | 1440×900 | **CLOSE** | Planned vs Logged compare cards with kcal; WhatsApp + Add note. Seed opened a pending meal (Not logged yet) rather than a Changed lunch with photo/reason. |
| `163-trainer-web-checkin-review-web.png` | 1440×900 | **CLOSE** | Right **Your review** card (outcome segment, Note to Deepak, Save review, Message on WhatsApp). **Context · last 7 days** kv layout. No `Form v1 (pinned)`. Deepak seed answers are sparse vs Rohan frame copy. |
| `164-trainer-web-checkin-reviewed-web.png` | 1440×900 | **CLOSE** | Reviewed right card with **Reviewed** pill + Edit review (not footer strip). Context kv. Seed has many open exceptions (capped to 3 + more). |
| `198-ipad-checkin-review-ipad.png` | 1024×768 | **CLOSE** | Same review card at iPad width; stacks Context then Your review under answers. |

## Tap-through
1. Clients → Rohan → Activity → Meals / This week → open View on a meal (drawer planned vs logged).
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
