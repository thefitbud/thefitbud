# Design review: G7

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 12 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| BP1-delete-account-web-1440x900.png | `BP1-delete-account-web.png` | 71.0% (likely gap) | `docs/qa/G7/design-review/BP1-delete-account-web-1440x900.png` | none |
| 183-trainer-web-asked-pain-web-1440x900.png | `183-trainer-web-asked-pain-web.png` | 36.1% (likely gap) | `docs/qa/G7/design-review/183-trainer-web-asked-pain-web-1440x900.png` | none |
| 182-trainer-web-asked-drawer-web-1440x900.png | `182-trainer-web-asked-drawer-web.png` | 36.0% (likely gap) | `docs/qa/G7/design-review/182-trainer-web-asked-drawer-web-1440x900.png` | none |
| 186-trainer-web-offline-web-1440x900.png | `186-trainer-web-offline-web.png` | 26.5% (likely gap) | `docs/qa/G7/design-review/186-trainer-web-offline-web-1440x900.png` | none |
| 190-trainer-web-search-web-1440x900.png | `190-trainer-web-search-web.png` | 26.2% (likely gap) | `docs/qa/G7/design-review/190-trainer-web-search-web-1440x900.png` | none |
| 185-trainer-web-not-found-web-1440x900.png | `185-trainer-web-not-found-web.png` | 18.4% (likely gap) | `docs/qa/G7/design-review/185-trainer-web-not-found-web-1440x900.png` | none |
| 177-trainer-web-settings-notifications-web-1440x900.png | `177-trainer-web-settings-notifications-web.png` | 8.1% (check by eye) | `docs/qa/G7/design-review/177-trainer-web-settings-notifications-web-1440x900.png` | none |
| 176-trainer-web-settings-profile-web-1440x900.png | `176-trainer-web-settings-profile-web.png` | 7.7% (check by eye) | `docs/qa/G7/design-review/176-trainer-web-settings-profile-web-1440x900.png` | none |
| 165-trainer-web-history-web-1440x900.png | `165-trainer-web-history-web.png` | 5.6% (check by eye) | `docs/qa/G7/design-review/165-trainer-web-history-web-1440x900.png` | none |
| 184-trainer-web-error-web-1440x900.png | `184-trainer-web-error-web.png` | 3.4% (check by eye) | `docs/qa/G7/design-review/184-trainer-web-error-web-1440x900.png` | none |
| 187-trainer-web-forbidden-web-1440x900.png | `187-trainer-web-forbidden-web.png` | 3.2% (check by eye) | `docs/qa/G7/design-review/187-trainer-web-forbidden-web-1440x900.png` | none |
| 185-trainer-web-not-found-web--client-1440x900.png | `185-trainer-web-not-found-web.png` | 3.2% (check by eye), paired by number prefix | `docs/qa/G7/design-review/185-trainer-web-not-found-web--client-1440x900.png` | none |

## Warnings

- no spec docs/specs/G7.md: frames chosen from the whole frame folder by name prefix

