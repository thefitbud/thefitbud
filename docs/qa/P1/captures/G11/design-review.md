# Design review: G11

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 12 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 84-trainee-meal-times-saved-ios-393x852.png | `84-trainee-meal-times-saved-ios.png` | 25.6% (likely gap) | `docs/qa/G11/design-review/84-trainee-meal-times-saved-ios-393x852.png` | none |
| 90-trainee-reactivation-ios-393x852.png | `90-trainee-reactivation-ios.png` | 24.1% (likely gap) | `docs/qa/G11/design-review/90-trainee-reactivation-ios-393x852.png` | none |
| 78-trainee-reminder-settings-paused-ios-393x852.png | `78-trainee-reminder-settings-paused-ios.png` | 23.6% (likely gap) | `docs/qa/G11/design-review/78-trainee-reminder-settings-paused-ios-393x852.png` | none |
| 85-trainee-sync-status-ios-393x852.png | `85-trainee-sync-status-ios.png` | 21.8% (likely gap) | `docs/qa/G11/design-review/85-trainee-sync-status-ios-393x852.png` | none |
| 82-trainee-meal-times-ios-393x852.png | `82-trainee-meal-times-ios.png` | 20.6% (likely gap) | `docs/qa/G11/design-review/82-trainee-meal-times-ios-393x852.png` | none |
| 83-trainee-meal-times-error-ios-393x852.png | `83-trainee-meal-times-error-ios.png` | 20.5% (likely gap) | `docs/qa/G11/design-review/83-trainee-meal-times-error-ios-393x852.png` | none |
| 80-trainee-quiet-hours-ios-393x852.png | `80-trainee-quiet-hours-ios.png` | 19.7% (likely gap) | `docs/qa/G11/design-review/80-trainee-quiet-hours-ios-393x852.png` | none |
| 76-trainee-reminder-settings-ios-393x852.png | `76-trainee-reminder-settings-ios.png` | 16.8% (likely gap) | `docs/qa/G11/design-review/76-trainee-reminder-settings-ios-393x852.png` | none |
| BP1-delete-account-ios-393x852.png | `BP1-delete-account-ios.png` | 16.5% (likely gap) | `docs/qa/G11/design-review/BP1-delete-account-ios-393x852.png` | none |
| 89-trainee-ended-today-ios-393x852.png | `89-trainee-ended-today-ios.png` | 15.5% (likely gap) | `docs/qa/G11/design-review/89-trainee-ended-today-ios-393x852.png` | none |
| 79-trainee-reminder-settings-android-412x915.png | `79-trainee-reminder-settings-android.png` | 15.2% (likely gap) | `docs/qa/G11/design-review/79-trainee-reminder-settings-android-412x915.png` | none |
| 16-trainee-more-ios-393x852.png | `16-trainee-more-ios.png` | 13.5% (likely gap) | `docs/qa/G11/design-review/16-trainee-more-ios-393x852.png` | none |

## Warnings

- no spec docs/specs/G11.md: frames chosen from the whole frame folder by name prefix

