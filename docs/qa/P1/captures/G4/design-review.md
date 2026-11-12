# Design review: G4

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 11 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 155-trainer-web-assign-plan-web-1440x900.png | `155-trainer-web-assign-plan-web.png` | 57.3% (likely gap) | `docs/qa/G4/design-review/155-trainer-web-assign-plan-web-1440x900.png` | none |
| 153-trainer-web-workout-builder-conflict-web-1440x900.png | `153-trainer-web-workout-builder-conflict-web.png` | 27.2% (likely gap) | `docs/qa/G4/design-review/153-trainer-web-workout-builder-conflict-web-1440x900.png` | none |
| 152-trainer-web-workout-builder-web--draft-1440x900.png | `152-trainer-web-workout-builder-web.png` | 26.1% (likely gap), paired by number prefix | `docs/qa/G4/design-review/152-trainer-web-workout-builder-web--draft-1440x900.png` | none |
| 154-trainer-web-nutrition-builder-web--draft-1440x900.png | `154-trainer-web-nutrition-builder-web.png` | 25.0% (likely gap), paired by number prefix | `docs/qa/G4/design-review/154-trainer-web-nutrition-builder-web--draft-1440x900.png` | none |
| 195-ipad-builder-readonly-ipad-portrait-768x1024.png | `195-ipad-builder-readonly-ipad-portrait.png` | 15.2% (likely gap) | `docs/qa/G4/design-review/195-ipad-builder-readonly-ipad-portrait-768x1024.png` | none |
| 194-ipad-builder-ipad--draft-1024x768.png | `194-ipad-builder-ipad.png` | 11.3% (check by eye), paired by number prefix | `docs/qa/G4/design-review/194-ipad-builder-ipad--draft-1024x768.png` | none |
| 194-ipad-builder-ipad-1024x768.png | `194-ipad-builder-ipad.png` | 10.6% (check by eye) | `docs/qa/G4/design-review/194-ipad-builder-ipad-1024x768.png` | none |
| 154-trainer-web-nutrition-builder-web-1440x900.png | `154-trainer-web-nutrition-builder-web.png` | 8.3% (check by eye) | `docs/qa/G4/design-review/154-trainer-web-nutrition-builder-web-1440x900.png` | none |
| 152-trainer-web-workout-builder-web-1440x900.png | `152-trainer-web-workout-builder-web.png` | 7.8% (check by eye) | `docs/qa/G4/design-review/152-trainer-web-workout-builder-web-1440x900.png` | none |
| 200-trainer-web-plan-filtered-web-1440x900.png | `200-trainer-web-plan-filtered-web.png` | 7.3% (check by eye) | `docs/qa/G4/design-review/200-trainer-web-plan-filtered-web-1440x900.png` | none |
| 151-trainer-web-plan-empty-web-1440x900.png | `151-trainer-web-plan-empty-web.png` | 6.4% (check by eye) | `docs/qa/G4/design-review/151-trainer-web-plan-empty-web-1440x900.png` | none |

## Warnings

- no spec docs/specs/G4.md: frames chosen from the whole frame folder by name prefix

