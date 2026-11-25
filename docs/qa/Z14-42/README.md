# Z14-42 QA notes

No UI change beyond one string, so no screenshots.

## Closed-window copy

Every path now says "Ratings and notes can be changed for 48 hours after a workout." (the API
`FEEDBACK_EDIT_WINDOW_CLOSED_MESSAGE`, the api-client `FEEDBACK_EDIT_WINDOW_CLOSED` entry, and the
mobile `RATING_NOTE_WINDOW_CLOSED_MESSAGE`, which is now the only mobile constant). The old
`RATING_WINDOW_CLOSED_MESSAGE` was removed. Matches frame W-17c3. Tests in
`workouts.feedback.test.ts` and `rpeRating.test.ts` pin the new sentence.

## F33 walk-through (`apps/mobile/.maestro/flows/v3/F33-workout-note.yaml`)

Not run here (no simulators in this session). For the device run:
`gh workflow run device.yml -f flows=launch,F33-workout-note.yaml`.

1. Sign in as the slipping trainee (Rohan Mehta).
2. If Today has no "View summary" yet, finish a session the way F06c's light path does.
3. Open "View summary", tap "Change your rating and note".
4. Type into `workout-note-input`, tap the sheet subtitle to drop the keyboard, tap `workout-note-save`.
5. Assert `workout-note-text` shows the note, with no "Couldn't send" and no bracketed code.

On a Rest day there is nothing to finish and the flow stops at "View summary" (seed/day mismatch).
Risk to check on the device: the keyboard covering Save; the flow taps inert sheet text first.

## scripts/qa

`node --test "scripts/qa/**/*.test.mjs"` was green after `pnpm install` (249 pass, 1 skipped). The one react-native package assertion in native-cache.test.mjs now only runs when node_modules has it, so Node-only runs do not fail on it.
The stale-id guard reads flows with a built-in block-YAML reader, so it runs (no skip) in `qa-scripts`.
