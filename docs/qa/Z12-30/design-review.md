# Design review: Z12-30

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

**ImageMagick not available.** Pixel scores and side-by-side images were skipped; pairing and text checks still ran.

Screens: 2 compared or paired, 0 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| BP1-delete-account-web-1440x900.png | `BP1-delete-account-web.png` | ImageMagick not available | none | none |
| BP1-reactivate-account-web-1440x900.png | `BP1-reactivate-account-web.png` | ImageMagick not available | none | none |

## Eye check (ImageMagick unavailable)

- **Delete:** copy, mailto, typed `DELETE`, Cancel / Delete account match BP1. Capture is the confirm-ready state (DELETE typed); the frame shows the active-clients blocked state — that path is covered by `DeleteAccount.test.tsx`. Settings chrome differs from the older frame (current app nav) outside this task's files.
- **Reactivate:** Welcome back, purge date "Mon 3 May 2027", trainer note, Sign out / Reactivate, "Signing out keeps it archived." match. Footer shows signed-in email; frame's "archived Tue 3 Nov" is omitted (not in shared copy, D-W12C-20).

