# Z14-43: five flaky render tests made deterministic

No visual check (test-only change). Each test failed once on 25 Nov 2026, then passed on a re-run. None reproduced locally (about 10 loaded runs each before the fix); each fix removes a race that is visible in the code. Only test files changed; no product file was touched.

| Test | Failed run | Symptom | Cause and fix |
|---|---|---|---|
| `ClientLogMeal.test.tsx` "coach Something different reuses the entry key after a 5xx" | 45535882284 | `onSaved` not called with "Logged by you" | The retry press could land while the save button was still busy and was dropped. The test now waits for the button to leave its busy state, then presses, and the waits have a bounded 4 s cap. |
| `AttentionTab.review.render.test.tsx` "keeps the same resolve key on a retry..." | 45536057845 | `resolveException` called 1 time, expected 2 | Same dropped press on a busy Resolve button. Wait for the button to leave busy, then press; count assertion is in a `waitFor`. |
| `TodayTab.offlineFirst.render.test.tsx` "with nothing cached..." | 45480773153 | `onFirstPaint` called 0 times, expected 1 | `onFirstPaint` fires from an effect after the skeleton leaves. The week release is now inside `act`, and the call assertion is in a `waitFor`. |
| `TraineeShell.keptTabsLeave.render.test.tsx` "a sheet open on a tab is gone..." | 45547489518 | sheet assertion read before the UI settled | Sheet presence uses `findByRole`; the "gone" assertions are in a `waitFor`. `TraineeShell.tsx` is untouched. |
| `ConfigureCoachingPage.test.tsx` "an active version: changing the target saves it at once..." | 45534624211 | select showed `8000`, expected `10000` | The page re-reads the target when the configuration arrives; a late read of a fixed 8000 overwrote the saved 10000. The `getClientSteps` mock now answers with the last saved target, as the API does, and the final value check is in a `waitFor`. |

The assertions each test makes are unchanged (same entry key reused, same resolve key and no second note, skeleton until day, plan and week answer, sheet gone after the tab switch, no new version on an active target save).
