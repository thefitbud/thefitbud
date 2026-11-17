# Z12-3 · Clients filtered-empty, empty, error

Captures at 1440×900 against locked frames 137–139. Demo trainer
`rahul.coach@demo.fitbud.test`. States stubbed via Playwright route (seed has
clients).

| Frame | Capture | Grade | Notes |
|---|---|---|---|
| 137 filtered-empty | `137-trainer-web-clients-filtered-empty-web-1440x900.png` | **MATCH** | Centred icon tile + helper; tinted Adherence/Renewal chips; toolbar kept. FilterBar clear link still reads "Clear" (not "Clear filters") — owned by FilterBar, out of scope. |
| 138 empty | `138-trainer-web-clients-empty-web-1440x900.png` | **MATCH** | Filter/segment hidden; UserPlus icon tile; header subtitle "No clients yet"; ink Add client CTA. |
| 139 error | `139-trainer-web-clients-error-web-1440x900.png` | **CLOSE** | Uses Z12-17 `ErrorState` (centred card, Retry, Email support, Details). Title "Couldn't load your clients". Details line is `Request id: req-…` only — frame also shows `· Clients list · <civil datetime>`; that richer Details line lives in `StatePanels` (Z12-17), not edited here. |

## Checks

- Unit: `ClientsPage.test.tsx` (states + existing toolbar) pass
- `pnpm --filter @fitbud/trainer-web typecheck` pass
- Tap-through + focus rings: `tapthrough.mjs` ok (Clear filters, Retry, Email support, Add client)
- `node scripts/qa/visual/diff.mjs --task Z12-3` wrote this folder's `design-review.md` (ImageMagick unavailable in this environment — advisory scores missing; eye grades above)

## Scripts

```bash
TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-3/capture.mjs
TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-3/tapthrough.mjs
```
