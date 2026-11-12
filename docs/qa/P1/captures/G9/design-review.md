# Design review: G9

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 15 compared or paired, 2 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 06-trainee-signin-ios-393x852.png | `06-trainee-signin-ios.png` | 41.4% (likely gap) | `docs/qa/G9/design-review/06-trainee-signin-ios-393x852.png` | Banned string (hex8-fragment): `3ba526ca` |
| 103-trainee-signin-error-ios-393x852.png | `103-trainee-signin-error-ios.png` | 40.7% (likely gap) | `docs/qa/G9/design-review/103-trainee-signin-error-ios-393x852.png` | Banned string (hex8-fragment): `3ba526ca` |
| 06b-trainee-signin-code-ios-393x852.png | `06b-trainee-signin-code-ios.png` | 38.1% (likely gap) | `docs/qa/G9/design-review/06b-trainee-signin-code-ios-393x852.png` | none |
| 20-trainee-invite-ios-393x852.png | `20-trainee-invite-ios.png` | 28.7% (likely gap) | `docs/qa/G9/design-review/20-trainee-invite-ios-393x852.png` | none |
| 08-trainee-something-different-ios-393x852.png | `08-trainee-something-different-ios.png` | 23.9% (likely gap) | `docs/qa/G9/design-review/08-trainee-something-different-ios-393x852.png` | none |
| 25-trainee-ask-coach-ios-393x852.png | `25-trainee-ask-coach-ios.png` | 22.1% (likely gap) | `docs/qa/G9/design-review/25-trainee-ask-coach-ios-393x852.png` | none |
| 08b-trainee-portion-change-ios-393x852.png | `08b-trainee-portion-change-ios.png` | 20.1% (likely gap) | `docs/qa/G9/design-review/08b-trainee-portion-change-ios-393x852.png` | none |
| 21-trainee-intake-ios-393x852.png | `21-trainee-intake-ios.png` | 19.8% (likely gap) | `docs/qa/G9/design-review/21-trainee-intake-ios-393x852.png` | none |
| 08c-trainee-ate-out-ios-393x852.png | `08c-trainee-ate-out-ios.png` | 18.1% (likely gap) | `docs/qa/G9/design-review/08c-trainee-ate-out-ios-393x852.png` | none |
| 23-trainee-reminder-setup-ios-393x852.png | `23-trainee-reminder-setup-ios.png` | 16.2% (likely gap) | `docs/qa/G9/design-review/23-trainee-reminder-setup-ios-393x852.png` | none |
| 09-trainee-food-search-ios-393x852.png | `09-trainee-food-search-ios.png` | 16.1% (likely gap) | `docs/qa/G9/design-review/09-trainee-food-search-ios-393x852.png` | none |
| 26-trainee-item-unavailable-ios-393x852.png | `26-trainee-item-unavailable-ios.png` | 15.2% (likely gap) | `docs/qa/G9/design-review/26-trainee-item-unavailable-ios-393x852.png` | none |
| 24-trainee-meal-plan-ios-393x852.png | `24-trainee-meal-plan-ios.png` | 14.2% (likely gap) | `docs/qa/G9/design-review/24-trainee-meal-plan-ios-393x852.png` | none |
| 22-trainee-waiting-ios-393x852.png | `22-trainee-waiting-ios.png` | 13.1% (likely gap) | `docs/qa/G9/design-review/22-trainee-waiting-ios-393x852.png` | none |
| 102-trainee-diet-error-ios-393x852.png | `102-trainee-diet-error-ios.png` | 7.8% (check by eye) | `docs/qa/G9/design-review/102-trainee-diet-error-ios-393x852.png` | none |

## Warnings

- no spec docs/specs/G9.md: frames chosen from the whole frame folder by name prefix

