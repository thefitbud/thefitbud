# Z12-4 QA

Frames: 141–143 (1440×900), 196 (768×1024).

## Captures

| Frame | Viewport | File |
|---|---|---|
| 141 add client form | 1440×900 | `141-trainer-web-add-client-web-1440x900.png` |
| 142 success | 1440×900 | `142-trainer-web-add-client-success-web-1440x900.png` |
| 143 reactivate | 1440×900 | `143-trainer-web-add-client-reactivate-web-1440x900.png` |
| 196 iPad clients | 768×1024 | `196-ipad-clients-ipad-portrait-768x1024.png` |

```bash
# Spare ports; API must be seeded.
FITBUD_API_PORT=8788 FITBUD_WEB_PORT=5174 pnpm --filter @fitbud/trainer-web exec -- \
  env TRAINER_WEB_URL=http://127.0.0.1:5174 node ../../docs/qa/Z12-4/capture.mjs
node scripts/qa/visual/diff.mjs --task Z12-4
node docs/qa/Z12-4/tapthrough.mjs
```

Design-review: see `design-review.md`. Grades are by eye against the locked frames in `docs/design/mockups/png/`.
