# Design review: G1

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 6 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 01-trainer-web-signin-1440x900.png | `01-trainer-web-signin.png` | 42.7% (likely gap) | `docs/qa/G1/design-review/01-trainer-web-signin-1440x900.png` | none |
| 128-trainer-web-onboarding-done-web-1440x900.png | `128-trainer-web-onboarding-done-web.png` | 22.9% (likely gap) | `docs/qa/G1/design-review/128-trainer-web-onboarding-done-web-1440x900.png` | none |
| 127-trainer-web-onboarding-invite-web-1440x900.png | `127-trainer-web-onboarding-invite-web.png` | 22.5% (likely gap) | `docs/qa/G1/design-review/127-trainer-web-onboarding-invite-web-1440x900.png` | none |
| 125-trainer-web-onboarding-profile-web-1440x900.png | `125-trainer-web-onboarding-profile-web.png` | 21.1% (likely gap) | `docs/qa/G1/design-review/125-trainer-web-onboarding-profile-web-1440x900.png` | none |
| 126-trainer-web-onboarding-templates-web-1440x900.png | `126-trainer-web-onboarding-templates-web.png` | 20.9% (likely gap) | `docs/qa/G1/design-review/126-trainer-web-onboarding-templates-web-1440x900.png` | none |
| 197-ipad-signin-ipad-portrait-768x1024.png | `197-ipad-signin-ipad-portrait.png` | 7.5% (check by eye) | `docs/qa/G1/design-review/197-ipad-signin-ipad-portrait-768x1024.png` | none |

## Warnings

- no spec docs/specs/G1.md: frames chosen from the whole frame folder by name prefix

