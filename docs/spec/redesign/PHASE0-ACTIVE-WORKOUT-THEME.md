# Phase 0: Active workout (TR-11) theme check
Method: opened each file, plus mean luminance of the middle 80% of the frame (0 = black, 255 = white).

| File | Theme | Mean |
|---|---|---|
| docs/spec/mockups/png/11-trainee-active-workout-ios.png | **Light** (white/lavender page, navy done-checks) | 232 |
| docs/spec/mockups/png/11b-trainee-active-workout-rest-ios.png | **Light** (light page, one navy rest-timer banner at top) | 206 |
| docs/spec/mockups-v2/png/11-trainee-active-workout-ios.png | **Light** (identical to v1) | 232 |
| docs/spec/mockups-v2/png/11b-trainee-active-workout-rest-ios.png | **Light**, with navy rest banner | 206 |
| docs/spec/mockups-v2/compare/TR-11-active-workout.png | **Light** (spec vs mockup compare) | 225 |
| docs/spec/mockups-v2/html/active-workout-ios.html, active-workout-rest-ios.html | Light sources | n/a |

The dark screens near this flow are the **lock screen / Live Activity / Android notification** mockups (27-*, 27b, 27c, 27-android). They're OS surfaces, not TR-11.

**Conclusion:** every TR-11 mockup in v1 and v2 is light. The "dark immersive" claim comes from stale text in docs/spec/mockups/DESIGN-NOTES.md (decision 7) and was repeated in the Confluence notes. It matches Confluence UX §16 ("light-theme trainee screens are the preferred reference"). Recommend fixing DESIGN-NOTES decision 7 to say "light, immersive (tab bar hidden)". It isn't edited here, because the original docs stay intact.
