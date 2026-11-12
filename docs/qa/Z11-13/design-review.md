# Design review: Z11-13

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 1 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 179-client-ended-1440x900.png | `179-trainer-web-client-ended-web.png` | 5.3% (check by eye), paired by number prefix | `docs/qa/Z11-13/design-review/179-client-ended-1440x900.png` | no text captured |

