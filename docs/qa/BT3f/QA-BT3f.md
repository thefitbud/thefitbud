# QA-BT3f · Web sign-in legal links below the help line (D-W3-15)

## Verdict
**PASS with one declared deviation** on web (the inter-line gap, below). iOS
unchanged and not re-captured.

An earlier version of this note claimed a clean match and dismissed a vertical
displacement as "form state, not layout". That was wrong: the footer sat 55-77px
higher than the frame, which is layout, and it was this task that moved it. The
review caught it. The numbers below are the corrected ones, measured after the fix.

## Frames
- `ds5-web-signin-footer.png` (1440x900) — governing for web.
- `ds5-ios-signin-footer.png` (393x852) — iOS already matched; no mobile code changed.

## Screenshots
| Shot | Viewport |
|---|---|
| `web-signin-footer-1440x900.png` | 1440x900 (governing) |
| `web-signin-footer-1024x768.png` | 1024x768 (second required viewport) |
| `web-signin-footer-393x852.png` | 393x852 (narrow reflow) |

Playwright against the trainer web app on a seeded local API (`db:reset` demo
seed). Real renders, no stubbing.

## Measured from the live DOM
| Viewport | `.auth-help` bottom | nav top | nav bottom | Nav box off bottom | Min target | Overlaps |
|---|---|---|---|---|---|---|
| 1440x900 | 835 | 839 | 883 | 17px | 44px | 0 |
| 1024x768 | 703 | 707 | 751 | 17px | 44px | 0 |
| 393x852 | 787 | 791 | 835 | 17px | 44px | 0 |

- **Order:** the help line's bottom is above the nav's top at every width, so the
  legal links sit **below** "Trouble signing in? Need help?" as D-W3-15 requires.
- **44pt rule:** the smallest of the four targets is exactly 44px at every width,
  with zero pairwise overlaps. This is the rule the old absolute positioning was
  protecting; it still holds. (On `main`, 320 and 360 had a **real overlap** and
  at >=1024 the help link was only 17px tall, so both are improvements.)
- **Vertical position:** the legal text now lands ~34px off the bottom, against
  the frame's ~34px. Before the fix it was 89px, because `.auth-formside` has
  `padding-bottom: 4.5rem` which the absolutely positioned help line used to
  bypass and the in-flow stack is subject to.

## Declared deviation: the inter-line gap
The frame's two footer lines are **27px** centre to centre. Here they are **48px**.

This is forced by D-W3-15 itself: two stacked 44px tap targets cannot sit closer
than 44px centre to centre, so 48px is only 4px above the floor. Matching the
frame's 27px would mean a sub-44pt target, which AGENTS.md forbids. Reported as a
deviation rather than resolved — the 44pt rule wins over the frame here, and the
frame predates the rule being applied to this block.

## Automated checks
`apps/trainer-web/e2e/bt3f-signin-footer.spec.ts` — **4 passed**. At 375, 1024 and
1440 it asserts the links are below the card and below `.auth-help`, that every
target is at least 44px tall, that no two targets intersect, and that tab order
runs Need help? -> Privacy -> Terms -> Credits and licences.

Known limits of that spec, so nobody over-reads it: it asserts height but not
width (actual minimum is 53px everywhere), and its overlap predicate allows 1px
of tolerance, so a genuine 1px overlap would pass.

## Comparison with the frame
Order, copy, separators and vertical position match. The frame shows a filled
email and password; these captures show the empty form — that difference is form
state. The inter-line gap is the one genuine deviation, declared above.

## Not captured
iOS. D-W3-15 says it already matches and only web moves; no mobile file is in
this diff.

## Pre-existing, not introduced here
At 320px wide the page has a horizontal scrollbar (`scrollWidth` 330). `main` is
also 330. Below the 375px the spec asks for, but real and unowned.
