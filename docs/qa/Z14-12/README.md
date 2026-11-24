# QA · Z14-12 workout summary with RPE, read-only View summary (Expo web, 2x)

Captured with `docs/qa/Z14-12/capture.mjs` on the local demo seed (API on 8791, Expo web on 8081), account `rohan.slipping@demo.fitbud.test`, light and dark. Expo web proves copy, states and values; native layout, safe areas and the native sheet are the device run's. **Workout note not built: needs a migration (open item for Firoz).** The frames' "Note for Rahul" field and note line are therefore absent, and the group reads "YOUR RATING", not "YOUR RATING AND NOTE".

| Frame | Files | Grade | Notes |
|---|---|---|---|
| W-17a2 summary + RPE | `W-17a2-summary-rpe-393x852-{light,dark}-web.png` | CLOSE | Picker, anchors and "8 of 10" match. Differences from the frame: no record card (nothing computes records), no note field (see above), no stat tiles (the existing summary's figures row, unchanged). |
| W-17b shared | `W-17b-summary-shared-393x852-{light,dark}-web.png` | MATCH | Unchanged screen. |
| W-17c read-only | `W-17c-summary-readonly-*` | CLOSE | Back, "Sent to Rahul" chip, figures, plan group, "YOUR RATING" with Change, hint "You can change this until Fri 27 Nov, 12:37 am.", Done. No note row. A seeded in-app banner sits on top in the light 393 shot. `...-after-change-*` shows the new value after Save. |
| W-17c2 edit sheet | `W-17c2-summary-edit-rating-*` | CLOSE | Title "Your rating", subtitle with "Rahul sees the change", grid, Save / Cancel. No note field. |
| W-17c3 old | `W-17c3-summary-readonly-old-*` | MATCH | No Change; "Ratings can be changed for 48 hours after a workout." |
| W-17a3 required | not captured | — | The demo plan does not require a rating; covered by `WorkoutSummaryScreen.v3.test.tsx` (Save and share disabled with "Pick how hard it was to save."). |
| W-17a4 offline | not captured | — | Expo web's offline switch does not flip the tab's offline state; the neutral banner text is covered by a test. Device run. |
| 360x800 W-17a2 / W-17b | not captured | — | The seed's one missed workout was consumed by the 393 passes; only the view states were captured at 360x800. |

Found while capturing: a rating picked within about a second of the finish was refused by the API (HTTP 422), because the API stamps `completedAt` with its own arrival time and refuses a rating whose device time is earlier. See the PR's open items.
