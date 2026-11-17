# Design review: Z12-1

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

**ImageMagick not available.** Pixel scores and side-by-side images were skipped; pairing and text checks still ran.

Screens: 2 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 01-trainer-web-signin-1440x900.png | `01-trainer-web-signin.png` | ImageMagick not available | none | no text captured |
| 197-ipad-signin-ipad-portrait-768x1024.png | `197-ipad-signin-ipad-portrait.png` | ImageMagick not available | none | no text captured |

