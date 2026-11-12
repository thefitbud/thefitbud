# Design review: Z11-14

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 9 compared or paired, 0 with design-guide findings, 2 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| 61-after-cancel-trainee-today-ios-393x852.png | `61-trainer-mobile-switch-role-sheet-ios.png` | 88.3% (likely gap), paired by number prefix | `docs/qa/Z11-14/design-review/61-after-cancel-trainee-today-ios-393x852.png` | no text captured |
| 61-after-switch-client-ios-393x852.png | `61-trainer-mobile-switch-role-sheet-ios.png` | 87.1% (likely gap), paired by number prefix | `docs/qa/Z11-14/design-review/61-after-switch-client-ios-393x852.png` | no text captured |
| 61-switch-role-sheet-ios-393x852.png | `61-trainer-mobile-switch-role-sheet-ios.png` | 27.9% (likely gap), paired by number prefix | `docs/qa/Z11-14/design-review/61-switch-role-sheet-ios-393x852.png` | no text captured |
| 51-more-ios-393x852.png | `51-trainer-mobile-more-ios.png` | 12.2% (likely gap), paired by number prefix | `docs/qa/Z11-14/design-review/51-more-ios-393x852.png` | no text captured |
| 51-more-switch-role-row-ios-393x852.png | `51-trainer-mobile-more-ios.png` | 12.2% (likely gap), paired by number prefix | `docs/qa/Z11-14/design-review/51-more-switch-role-row-ios-393x852.png` | no text captured |
| 59-from-more-ios-393x852.png | `59-trainer-mobile-role-select-ios.png` | 10.3% (check by eye), paired by number prefix | `docs/qa/Z11-14/design-review/59-from-more-ios-393x852.png` | no text captured |
| 59-role-select-ticked-ios-393x852.png | `59-trainer-mobile-role-select-ios.png` | 10.3% (check by eye), paired by number prefix | `docs/qa/Z11-14/design-review/59-role-select-ticked-ios-393x852.png` | no text captured |
| 59-relaunch-after-unticked-ios-393x852.png | `59-trainer-mobile-role-select-ios.png` | 10.2% (check by eye), paired by number prefix | `docs/qa/Z11-14/design-review/59-relaunch-after-unticked-ios-393x852.png` | no text captured |
| 59-role-select-unticked-ios-393x852.png | `59-trainer-mobile-role-select-ios.png` | 10.1% (check by eye), paired by number prefix | `docs/qa/Z11-14/design-review/59-role-select-unticked-ios-393x852.png` | no text captured |

## Unmapped screenshots

No frame was found for these. They are listed, not failed. Add a line to `scripts/qa/visual/frame-map.json` (artifact mode) or name the capture after its frame (task mode).

- `trainee-link-in-trainer-mode-no-prompt-ios-393x852.png`: no spec frame or frame-folder file shares its name or number prefix
- `trainee-today-after-unticked-ios-393x852.png`: no spec frame or frame-folder file shares its name or number prefix

