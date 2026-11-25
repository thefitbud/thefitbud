# Z14-37 · held rating and note, and sheet drafts, survive a restart or a cover

No new UI and no new copy, so there are no screenshots (spec: "Visual check: none"). Evidence is the tests below. These are the steps for the FitBud UI device run.

## What changed

- **Held rating and note** (`apps/mobile/src/trainee/workout/pendingFeedbackStore.ts`, `rpeRating.ts`): a Save made while the workout's finish is still in the outbox (or the server cannot be reached) is written to the device store the moment it is held (`fitbud.pendingFeedback.v1.<owner>.<executionId>`, with owner id, workout id, rating, note and time). When the Workout tab mounts after a restart, `resumeHeldWorkoutFeedback` sends it once the finish has synced, with the version read from the server (Z14-12), and then removes it. A value for another user is never read. A value older than 72 h is dropped without an error; a hold still waiting at 72 h gives up with the existing neutral closed-window line.
- **Sheet drafts** (`apps/mobile/src/trainee/workout/sheetDrafts.ts`): the rating and note typed on the after-finish summary (W-17a2) and in the "Your rating and note" sheet (W-17c2) are saved as a draft (`fitbud.workoutDrafts.v1.<owner>.workoutFeedback_<executionId>`), 500 ms after typing pauses, and at once if the screen unmounts. They come back when the summary remounts or the sheet reopens. Save, Cancel and explicit sign-out clear them. A draft older than 24 h is ignored.
- **Sign-out**: `endSession("drop")` and `clearSyncDataOnSignOut` remove both stores. A session the server ended keeps them for the same user. A different user's first write removes the previous user's records.

## Device run (FitBud UI)

1. Sign in as a trainee (`docs/LOCAL_TESTING.md`). Start and finish a workout with the phone in airplane mode.
2. On "Workout done", pick a rating, type a note, tap "Save and share". The line reads "Your rating and note will be saved when this workout is sent."
3. Force-quit the app. Turn airplane mode off. Reopen the app and open the Workout tab.
4. Expect: the finish syncs, then the rating and note reach the server (the coach's workout card shows them; View summary shows them).
5. Open View summary on a finished workout within 48 h, tap Change, pick a different number and type part of a note. Without saving, trigger a full-screen cover (tap a push notification, or open a deep link). Come back to Workout, open the summary, tap Change: the typed number and note are still there. No "restored" notice appears.
6. Repeat step 5 but force-quit instead of the cover: same result.
7. Tap Cancel, then Change again: the server's values show (draft cleared).
8. Type in the sheet again, then sign out from More (explicit sign-out). Sign in as a different trainee on the same phone and open the same screens: nothing from the first user appears, and nothing is sent for them.

## Tests

- `apps/mobile/src/trainee/workout/rpeRating.test.ts`, "held rating and note survive a restart (Z14-37)": written when held and removed once sent; survives a new store instance (restart) and is sent once after the finish syncs with the server's version; another owner never reads or sends it; the owner inside the record is checked, not only the key (mutation-checked: removing that check fails this test); dropped after 72 h; a hold still waiting at 72 h gives the neutral message; a failing store never blocks the send.
- `apps/mobile/src/trainee/workout/sheetDrafts.test.tsx`: save and read across a restart, owner isolation, 24 h expiry, clear and clearAll, store failure tolerated; the hook writes once per pause (debounced), keeps a stable handle (no render loop), writes at once on unmount, and clear drops a pending write; the W-17c2 sheet restores after an unmount, is cleared by Save and by Cancel, is not shown to another user; the W-17a2 summary restores its note after a remount and "Save and share" clears it; `clearSyncDataOnSignOut` removes drafts and held values, and nothing is removed without it.
