# QA-BT3f · Web sign-in legal links below the help line (D-W3-15)

## Verdict
**PASS** on web. iOS unchanged and not re-captured (see below).

## Frames
- `ds5-web-signin-footer.png` (1440x900) — governing for web.
- `ds5-ios-signin-footer.png` (393x852) — iOS already matched before this task; no mobile code changed.

## Screenshots
| Shot | Viewport | Against |
|---|---|---|
| `web-signin-footer-1440x900.png` | 1440x900 | `ds5-web-signin-footer.png` |
| `web-signin-footer-1024x768.png` | 1024x768 | same frame, second required viewport |
| `web-signin-footer-393x852.png` | 393x852 | narrow reflow check |

Captured with Playwright against the trainer web app on a seeded local API
(`db:reset` demo seed). Real renders, no stubbing.

## Measured, not eyeballed
Geometry read from the live DOM at each viewport:

| Viewport | `.auth-help` bottom | `nav.auth-legal-links` top | Min link height | Links |
|---|---|---|---|---|
| 1440x900 | 780 | 784 | 44px | 4 |
| 1024x768 | 648 | 652 | 44px | 4 |
| 393x852 | 732 | 736 | 44px | 4 |

- **Order:** the help line's bottom is above the nav's top at every width, so the
  legal links sit **below** "Trouble signing in? Need help?", as D-W3-15 requires.
- **44pt rule:** the smallest of the four tap targets (Need help?, Privacy,
  Terms, Credits and licences) is exactly 44px at every width. This is the rule
  the old absolute positioning was protecting, and it still holds.

## Automated checks
`apps/trainer-web/e2e/bt3f-signin-footer.spec.ts` — **4 passed**. At 375, 1024
and 1440 it asserts the links are below the card and below `.auth-help`, that
every target is at least 44px tall, that no two targets intersect, and that tab
order runs Need help? -> Privacy -> Terms -> Credits and licences.

## Comparison with the frame
Order, copy and the middle-dot separators match. The frame shows a filled email
and password; these captures show the empty form. That is form state, not
layout, and the frame's own purpose here is the footer's position.

## Not captured
iOS. D-W3-15 says iOS already matches and only web moves; no mobile file is in
this diff, so there is nothing new to show. The iOS frame is listed above for
reference only.
