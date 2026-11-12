# Design review: G3

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 7 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 189-trainer-web-note-delete-web-1440x900.png | `189-trainer-web-note-delete-web.png` | 47.5% (likely gap) | `docs/qa/G3/design-review/189-trainer-web-note-delete-web-1440x900.png` | none |
| 03-trainer-web-client-rohan-1440x900.png | `03-trainer-web-client-rohan.png` | 24.9% (likely gap) | `docs/qa/G3/design-review/03-trainer-web-client-rohan-1440x900.png` | none |
| 03-trainer-web-client-rohan-full-1440x900.png | `03-trainer-web-client-rohan-full.png` | 24.5% (likely gap), capture taller than frame: top part compared | `docs/qa/G3/design-review/03-trainer-web-client-rohan-full-1440x900.png` | no text captured |
| 192-ipad-client-ipad-1024x768.png | `192-ipad-client-ipad.png` | 16.5% (likely gap) | `docs/qa/G3/design-review/192-ipad-client-ipad-1024x768.png` | none |
| 146-trainer-web-intake-review-web-1440x900.png | `146-trainer-web-intake-review-web.png` | 10.7% (check by eye) | `docs/qa/G3/design-review/146-trainer-web-intake-review-web-1440x900.png` | none |
| 188-trainer-web-note-composer-web-1440x900.png | `188-trainer-web-note-composer-web.png` | 9.1% (check by eye) | `docs/qa/G3/design-review/188-trainer-web-note-composer-web-1440x900.png` | none |
| 147-trainer-web-intake-not-submitted-web-1440x900.png | `147-trainer-web-intake-not-submitted-web.png` | 5.1% (check by eye) | `docs/qa/G3/design-review/147-trainer-web-intake-not-submitted-web-1440x900.png` | none |

## Warnings

- no spec docs/specs/G3.md: frames chosen from the whole frame folder by name prefix

