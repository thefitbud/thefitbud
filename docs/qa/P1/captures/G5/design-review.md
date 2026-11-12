# Design review: G5

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 5 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 159-trainer-web-activity-meal-panel-web-1440x900.png | `159-trainer-web-activity-meal-panel-web.png` | 77.5% (likely gap) | `docs/qa/G5/design-review/159-trainer-web-activity-meal-panel-web-1440x900.png` | none |
| 163-trainer-web-checkin-review-web-1440x900.png | `163-trainer-web-checkin-review-web.png` | 29.2% (likely gap) | `docs/qa/G5/design-review/163-trainer-web-checkin-review-web-1440x900.png` | none |
| 164-trainer-web-checkin-reviewed-web-1440x900.png | `164-trainer-web-checkin-reviewed-web.png` | 28.3% (likely gap) | `docs/qa/G5/design-review/164-trainer-web-checkin-reviewed-web-1440x900.png` | none |
| 158-trainer-web-activity-web-1440x900.png | `158-trainer-web-activity-web.png` | 22.4% (likely gap) | `docs/qa/G5/design-review/158-trainer-web-activity-web-1440x900.png` | none |
| 198-ipad-checkin-review-ipad-1024x768.png | `198-ipad-checkin-review-ipad.png` | 9.1% (check by eye) | `docs/qa/G5/design-review/198-ipad-checkin-review-ipad-1024x768.png` | none |

## Warnings

- no spec docs/specs/G5.md: frames chosen from the whole frame folder by name prefix

