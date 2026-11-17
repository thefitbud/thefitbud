# Z12-5 QA

Frames: 144–145 (1440×900).

## Captures

| Frame | Viewport | File | Grade |
|---|---|---|---|
| 144 invite detail | 1440×900 | `144-trainer-web-invite-detail-web-1440x900.png` | **CLOSE** |
| 145 revoke modal | 1440×900 | `145-trainer-web-invite-revoke-web-1440x900.png` | **CLOSE** |

```bash
# Spare ports; API must be seeded.
FITBUD_API_PORT=8788 FITBUD_WEB_PORT=5174 pnpm --filter @fitbud/trainer-web exec -- \
  env TRAINER_WEB_URL=http://127.0.0.1:5174 node ../../docs/qa/Z12-5/capture.mjs
node scripts/qa/visual/diff.mjs --task Z12-5
```

Design-review: see `design-review.md`. Grades are by eye against the locked frames in `docs/design/mockups/png/` (ImageMagick unavailable here).

## Gap check vs main (at `d6a949b3`, Z12-4 merged)

| P1 / W12b gap | Status |
|---|---|
| Client header (avatar, Invited pill, meta, ⋯) | Done |
| Invite tab | Done |
| 4-step stepper + side cards | Done |
| Formatted WhatsApp (not raw E.164) | Done (`+91 98765 01111`) |
| Invite-link row + helper | Done |
| Revoke **modal** | Done |

## Departures / follow-ups

- Timeline shows Invited only. Frame’s “Reminder sent on WhatsApp” needs a backend event (D-W12b-1: no API/contracts in W12b) — follow-up.
- “What happens next” / revoke body use name-based / gender-neutral copy (`Anita's`, “invite again”) vs frame “her”.
- Seed demo values (email, phone, civil dates, form `v1`) differ from frame sample copy (`anita.desai@gmail.com`, `+91 98700 55120`, Oct dates, `v3`).
- Stepper step-2 outline is neutral grey (frame sample leans periwinkle).
