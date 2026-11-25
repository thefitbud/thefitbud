# F20 walk-through (Z14-29)

Flow: `apps/mobile/.maestro/flows/v3/F20-triage-nudge.yaml`, read against `main` at `9f39a55`.
Every selector below was checked in app source; none relies on a removed id or the word "Nudge".

| Step | Selector | App source |
|---|---|---|
| Sign in, wait for Needs you | shared `sign-in-password.yaml`, `wait-attention-loaded.yaml` | unchanged |
| `nudge-client.yaml`: Clients tab | id `tab-clients` | `trainer/TrainerShell.tsx:625` (`tab-${item.id}`) |
| Find and open the client row | id `client-row-rohan-mehta` | `trainer/ClientsTab.tsx:698-709` (`rowId`) |
| Client page loaded (optional wait) | id `client-nudge` | `trainer/ClientStatusScreen.tsx:885` ("Remind…" button) |
| If a row tap opened the review panel: `exception-review` visible, tap client link | ids `exception-review`, `client-name-link` | `trainer/ExceptionReviewScreen.tsx:588`, `trainer/ClientAvatar.tsx:121` (used at `ExceptionReviewScreen.tsx:808`). Replaces the removed `exception-more` then `more-profile` path. |
| Tap Remind… | id `client-nudge` | `ClientStatusScreen.tsx:885` |
| `open-sheet.yaml`: picker (TM-03j) | text `Remind .* about…`, then `Next` | `trainer/sheets/NudgePickSheet.tsx:40` (`Remind ${first} about…`), `:69` (`Next`) |
| Reminder sheet preview | text `PREVIEW · TAP TO EDIT` | `trainer/sheets/NudgeSheet.tsx:264` |
| TM-04b screenshot | n/a | n/a |
| Quiet hours banner (TM-04c, optional) | text `It's .* inside their quiet hours.*` | `trainer/sheets/nudgeContent.ts:199` |
| Send | text `Send reminder` | `NudgeSheet.tsx:343` |
| Sent toast (TM-04m) | text `Reminder sent.*` | `nudgeContent.ts:242-257` |
| Repeat state (TM-04n) | text `You reminded .* again tomorrow.*` | `nudgeContent.ts:216` ("You reminded {first} about this at {when}. You can remind again tomorrow.") |
| Close the sheet | text `Close` (accessibility label) | `NudgeSheet.tsx:242` |
| Second client (TM-04o) | text `.*has turned off FitBud notifications.*` | `nudgeContent.ts:204` |

Changes in this task: `open-sheet.yaml` (picker text), `nudge-client.yaml` (fallback), plus comments in
`to-nudge.yaml`. `F20-triage-nudge.yaml` itself needed no selector change.

Other flows fixed: `flows/trainer/attention.yaml` (`exception-more` wait becomes `exception-resolve`;
the "Mark reviewed" step becomes an optional `exception-noted` tap, then `exception-resolve` and
`resolve-confirm`), `device/z12-36/4-trainer-needs-you-nudge.yaml` (`exception-nudge` becomes
`exception-remind`), `flows/v3/F25-clients-activity.yaml` (`Send nudge` becomes `Send reminder`),
`flows/v3/F21-review-resolve-notes.yaml` (negative `exception-more` check becomes a positive
`exception-remind` check).
