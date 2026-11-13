# Design review: Z11b-6

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 1 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 13-trainee-progress-ios-393x852.png | `13-trainee-progress-ios.png` | 15.4% (likely gap) | `docs/qa/Z11b-6/design-review/13-trainee-progress-ios-393x852.png` | no text captured |

## Warnings

- no spec docs/specs/Z11b-6.md: frames chosen from the whole frame folder by name prefix

