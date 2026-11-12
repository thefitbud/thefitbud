# Design review: Z9-5

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 3 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 07-trainee-diet-ios-393x852.png | `07-trainee-diet-ios.png` | 17.2% (likely gap) | `docs/qa/Z9-5/design-review/07-trainee-diet-ios-393x852.png` | no text captured |
| 86-after-sync-ios-393x852.png | `86-trainee-diet-offline-ios.png` | 15.8% (likely gap), paired by number prefix | `docs/qa/Z9-5/design-review/86-after-sync-ios-393x852.png` | no text captured |
| 86-trainee-diet-offline-ios-393x852.png | `86-trainee-diet-offline-ios.png` | 13.5% (likely gap) | `docs/qa/Z9-5/design-review/86-trainee-diet-offline-ios-393x852.png` | no text captured |

