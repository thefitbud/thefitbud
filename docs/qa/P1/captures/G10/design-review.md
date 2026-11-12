# Design review: G10

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 5 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 13-trainee-progress-ios-393x852.png | `13-trainee-progress-ios.png` | 17.7% (likely gap) | `docs/qa/G10/design-review/13-trainee-progress-ios-393x852.png` | none |
| 10b-trainee-workout-day-ios-393x852.png | `10b-trainee-workout-day-ios.png` | 15.4% (likely gap) | `docs/qa/G10/design-review/10b-trainee-workout-day-ios-393x852.png` | none |
| 12-trainee-workout-summary-ios-393x852.png | `12-trainee-workout-summary-ios.png` | 14.6% (likely gap) | `docs/qa/G10/design-review/12-trainee-workout-summary-ios-393x852.png` | none |
| 15-trainee-notifications-ios-393x852.png | `15-trainee-notifications-ios.png` | 14.0% (likely gap) | `docs/qa/G10/design-review/15-trainee-notifications-ios-393x852.png` | none |
| 98-trainee-notifications-empty-ios-393x852.png | `98-trainee-notifications-empty-ios.png` | 5.2% (check by eye) | `docs/qa/G10/design-review/98-trainee-notifications-empty-ios-393x852.png` | none |

## Warnings

- no spec docs/specs/G10.md: frames chosen from the whole frame folder by name prefix

