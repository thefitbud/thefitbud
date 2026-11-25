# QA · Z14-32 workout note on the summary, the Change sheet and the trainer card (Expo web, 2x)

Captured with `docs/qa/Z14-32/capture.mjs` against the local demo seed (API on a spare port, Expo web proxied through Metro), account `rohan.slipping@demo.fitbud.test`, light and dark, 393x852 and 360x800. Expo web proves copy, states and values; native layout, the native sheet and the keyboard are the device run's.

| Frame | Files | Grade | Notes |
|---|---|---|---|
| W-17a2 summary + rating + note | `W-17a2-summary-rpe-note-393x852-light-web.png` | CLOSE | Grid, anchors, "Note for Rahul" and the multiline field match. Placeholder reads "Anything Rahul should know?" (frame: "Anything he should know?", D-W14-37, a recorded deviation). No record card and no stat tiles (as in Z14-12). Only captured in light at 393: the demo seed has one workout left to finish, consumed by the first pass. |
| W-17b shared | `W-17b-summary-shared-393x852-light-web.png` | MATCH | Reached by one "Save and share", which sent rating and note together. |
| W-17c read-only | `W-17c-summary-readonly-*` (393 and 360, light and dark) | CLOSE | "YOUR RATING AND NOTE" with one Change, the rating row, the note row ("Note for Rahul" and the text), hint "You can change this until ...", Done. |
| W-17c2 edit sheet | `W-17c2-summary-edit-rating-note-*` | CLOSE | Title "Your rating and note", subtitle "... Rahul sees the change", grid, note field, Save / Cancel. `...-after-change-*` (W-17c-summary-readonly-after-change) shows the saved values. |
| W-17c3 old | `W-17c3-summary-readonly-old-*` | MATCH | No Change; "Ratings and notes can be changed for 48 hours after a workout." |
| W-17a3 required | not captured | n/a | The demo plan does not require a rating; covered by `WorkoutSummaryScreen.v3.test.tsx`. |
| W-17a4 offline | not captured | n/a | Expo web's offline switch does not flip the tab's offline state; the held and queued messages (with a note) are covered by tests. Device run. |
| Trainer "Note from {First}" card | not captured | n/a | Covered by `SessionDetail.test.tsx` and `model.test.ts` (card shown with text, hidden when empty). A capture needs the trainer's navigation to the session; follow-up for the device run. |
| W-17a2 at 360x800 and dark | not captured | n/a | See the first row. The sheet and read-only states are captured at 360x800 in light and dark. |
