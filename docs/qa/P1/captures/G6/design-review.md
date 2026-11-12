# Design review: G6

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 8 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 172-trainer-web-library-foods-web--drawer-1440x900.png | `172-trainer-web-library-foods-web.png` | 64.7% (likely gap), paired by number prefix | `docs/qa/G6/design-review/172-trainer-web-library-foods-web--drawer-1440x900.png` | none |
| 172-trainer-web-library-foods-web-1440x900.png | `172-trainer-web-library-foods-web.png` | 64.7% (likely gap) | `docs/qa/G6/design-review/172-trainer-web-library-foods-web-1440x900.png` | none |
| 173-trainer-web-library-exercises-web-1440x900.png | `173-trainer-web-library-exercises-web.png` | 24.0% (likely gap) | `docs/qa/G6/design-review/173-trainer-web-library-exercises-web-1440x900.png` | none |
| 174-trainer-web-template-use-web-1440x900.png | `174-trainer-web-template-use-web.png` | 22.0% (likely gap) | `docs/qa/G6/design-review/174-trainer-web-template-use-web-1440x900.png` | none |
| 175-trainer-web-template-fork-web-1440x900.png | `175-trainer-web-template-fork-web.png` | 14.3% (likely gap) | `docs/qa/G6/design-review/175-trainer-web-template-fork-web-1440x900.png` | none |
| 168-trainer-web-templates-web-1440x900.png | `168-trainer-web-templates-web.png` | 10.8% (check by eye) | `docs/qa/G6/design-review/168-trainer-web-templates-web-1440x900.png` | none |
| 169-trainer-web-templates-mine-empty-web-1440x900.png | `169-trainer-web-templates-mine-empty-web.png` | 9.4% (check by eye) | `docs/qa/G6/design-review/169-trainer-web-templates-mine-empty-web-1440x900.png` | none |
| 170-trainer-web-intake-form-builder-web-1440x900.png | `170-trainer-web-intake-form-builder-web.png` | 8.4% (check by eye) | `docs/qa/G6/design-review/170-trainer-web-intake-form-builder-web-1440x900.png` | none |

## Warnings

- no spec docs/specs/G6.md: frames chosen from the whole frame folder by name prefix

