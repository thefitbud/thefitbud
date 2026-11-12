# Design review: G2

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 9 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 145-trainer-web-invite-revoke-web-1440x900.png | `145-trainer-web-invite-revoke-web.png` | 79.7% (likely gap) | `docs/qa/G2/design-review/145-trainer-web-invite-revoke-web-1440x900.png` | none |
| 196-ipad-clients-ipad-portrait-768x1024.png | `196-ipad-clients-ipad-portrait.png` | 18.6% (likely gap) | `docs/qa/G2/design-review/196-ipad-clients-ipad-portrait-768x1024.png` | none |
| 143-trainer-web-add-client-reactivate-web-1440x900.png | `143-trainer-web-add-client-reactivate-web.png` | 8.7% (check by eye) | `docs/qa/G2/design-review/143-trainer-web-add-client-reactivate-web-1440x900.png` | none |
| 144-trainer-web-invite-detail-web-1440x900.png | `144-trainer-web-invite-detail-web.png` | 8.4% (check by eye) | `docs/qa/G2/design-review/144-trainer-web-invite-detail-web-1440x900.png` | none |
| 141-trainer-web-add-client-web-1440x900.png | `141-trainer-web-add-client-web.png` | 7.9% (check by eye) | `docs/qa/G2/design-review/141-trainer-web-add-client-web-1440x900.png` | none |
| 142-trainer-web-add-client-success-web-1440x900.png | `142-trainer-web-add-client-success-web.png` | 7.7% (check by eye) | `docs/qa/G2/design-review/142-trainer-web-add-client-success-web-1440x900.png` | none |
| 137-trainer-web-clients-filtered-empty-web-1440x900.png | `137-trainer-web-clients-filtered-empty-web.png` | 4.9% (check by eye) | `docs/qa/G2/design-review/137-trainer-web-clients-filtered-empty-web-1440x900.png` | none |
| 139-trainer-web-clients-error-web-1440x900.png | `139-trainer-web-clients-error-web.png` | 4.9% (check by eye) | `docs/qa/G2/design-review/139-trainer-web-clients-error-web-1440x900.png` | none |
| 138-trainer-web-clients-empty-web-1440x900.png | `138-trainer-web-clients-empty-web.png` | 4.0% (check by eye) | `docs/qa/G2/design-review/138-trainer-web-clients-empty-web-1440x900.png` | none |

## Warnings

- no spec docs/specs/G2.md: frames chosen from the whole frame folder by name prefix

