# Z12-51 QA: trainer exception review and the Needs you review sheet

- **Expo-web check** (before the device runs, D-W12-34): `web/`, made by `web-capture.mjs` (Playwright Chromium, 393×852 at 2×, `colorScheme` light and dark, local seeded API on a spare port, signed in as `rahul.coach@demo.fitbud.test`). TM-04a, d, e, f, j, k from the real API; TM-04g (404), TM-04h (aborted request) and TM-04i (workspace header with an end date) from Playwright routes. Expo web proves copy, structure and values, not native layout.
- **Device gate, run 44252360312** (`flows=launch,z12-51`; job log `app: 80632d84d83940bde112158362a09ea90e089ceb`, the branch head).
  - iOS: **PASS**, 3 of 3 flows in light and in dark, device log clean.
  - Android: F21 **passed** in light and dark; launch passed in dark; the light trainee launch flow failed on the known emulator keystroke drop (the email read `arav.ontrack@…`, "That mobile number or email and password don't match"). Device log clean.
  - Screenshots `<screen ID>-<theme>-<platform>.png` from this run; review-sheet evidence in `flows/` (`review-sheet-*`, `review-sheet-nudge-*`, `review-sheet-resolved-*`).
- **Review fixes, device runs on `4a16ed70`** (job logs `app: 4a16ed7040837fa87473ef8b5a4400c9928a5430`). No screen changed, so the shots above stand.
  - Run 44296736155 (`launch,z12-51,z12-50`): **F21 passed on iOS and Android, light and dark** (four of four). The run's failures were F20 (Z12-50) only: the second theme of the job nudged Rohan after F21 had resolved his items in the same local DB ("Activity not found." in the sheet, screenshot `step-058-…-dark-ios.png`), and iOS light did not find the Rohan row once. Flows that share a job share one DB.
  - Runs 44348662429 and 44356335872 (`launch,z12-50`, F21 left out): **Android PASS** both times; **iOS dark PASS** both times, including F20 and the changed `nudge-client.yaml`. iOS light failed only "Launch smoke, trainer Attention loads" (`"Loading" is not visible`) both times, with F20 passing in the second run. That is the first flow after a cold start; follow-up, not a Z12-51 change.
- **Earlier run 44223024287** (`flows=launch,z12-51,device/z12-36/4-trainer-needs-you-nudge.yaml`, app `87764cd`, same app code). Android light: 4 of 4 PASS (F21 end to end, and the z12-36 nudge flow through the new review's Nudge). Android dark F21 failed on the flow, not the app: tapping the "Attention" tab label hit a client row's "Attention" severity chip. Fixed in `80632d8` (relaunch to Needs you). iOS: the z12-36 flow's gallery deep link left the system "Open in FitBud Staging?" alert up (known harness flake), which blocked every later flow; the exception review and nudge sheet were on screen under it. The second run dropped that flow.
- **Parity:** this task's rows (TM-04a, d–l) in `docs/qa/W12/parity.md`.

## Screen → control → result

| Screen | Control | Result |
|---|---|---|
| TM-04a | ‹ back | Back to where the review was opened (device, both platforms) |
| TM-04a | ⋯ | Opens TM-04j (device) |
| TM-04a | Mark reviewed | Acknowledges; lands on TM-04e with the reviewed banner (device) |
| TM-04a | Nudge | FitBud nudge sheet TM-04b, never WhatsApp (device, run 44223024287 z12-36 flow; render test). Hidden for logged meals and skips (render test) |
| TM-04e | Nudge / Resolve | Resolve opens TM-04d (device); Nudge as above |
| TM-04d | Outcome chips | Select and deselect; "Talked to {First}" sent as `talked` (device, render test) |
| TM-04d | Note (only you) | Sent as the resolve note (render test) |
| TM-04d | ✕ / Resolve | Close; Resolve resolves and lands on TM-04f (device); a curated API error stays in the sheet (render test) |
| TM-04f | (read only) | No footer, no ⋯; banner with the chosen outcome (device) |
| TM-04j | Add note | Closes the menu, opens TM-04k (device) |
| TM-04j | Message on WhatsApp | wa.me chat with no template (render test; WhatsApp is not opened on the simulator) |
| TM-04j | Open {First}'s profile | Client screen (render test) |
| TM-04j | Cancel / scrim | Closes (render test) |
| TM-04k | Cancel / Save / Show on Today | Save sends the note as `client` (on) or `private` (off); empty note is not saved (device save, render tests) |
| TM-04g | Back to Needs you | Back (Expo web, render test) |
| TM-04h | Try again | Reloads; Mark reviewed and Nudge disabled while offline (Expo web, render test) |
| TM-04i | (read only) | No footer, no ⋯, Ended chip (Expo web, render test) |
| Review sheet (Needs you) | Nudge… | FitBud nudge sheet over the review sheet (device, light; the dark run's item was a skip, so Nudge… was rightly absent) |
| Review sheet | Resolve… | Resolve sheet over the review sheet; open items are marked reviewed then resolved with the outcome; item stays as "Resolved by you · just now" with Next item (device, both themes) |
| Review sheet | ⋯ | TM-04j over the sheet (render test; device asserts it is there) |
| Asked | Mark answered (second client) | New toast with Undo even after the first toast left early (render test, mutation-checked) |

## For the device checklist (Z12-58, only a real phone can prove)

- TM-04h on a phone with airplane mode on the exception review.
- Message on WhatsApp from the ⋯ menu opens WhatsApp with the client's chat and no prefilled text.
- ⋯ → Add note on iOS: the note composer opens after the menu leaves (the menu waits for the Modal's dismiss).
