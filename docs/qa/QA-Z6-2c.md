# QA-Z6-2c: check-in screens send and show only real answers

Task: `docs/specs/Z6-2c.md` (batch W6). Branch `claude/Z6-2c-checkin-screens`. Screenshots are in `docs/qa/Z6-2c/`.

## How the data and screenshots were made

- Local API on the demo seed (`pnpm db:reset`, `pnpm api`), trainer web on Vite (`:5173`), mobile through the Expo web build (`expo start --web`, Metro's `/__fitbud_api` proxy) in Playwright Chromium, as `docs/qa/QT9/README.md` did. Mobile at 393×852 (iOS) and 412×915 (Android) at 2x; web at 1440×900. Expo web is DOM-shaped, not device-shaped: it proves copy, structure and values, not native layout or the safe areas.
- **v2-shaped form:** a trainer-owned template "Z6-2c v2-shaped QA form" was created as `rahul.coach@demo.fitbud.test` through `POST /checkins/form-templates` with weight, waist, hips, chest, arm and thigh (arm and thigh `other`, unit cm), front/side/back photos, energy, sleep quality, stress, hunger (1 to 5), notes, and one custom unkeyed question "Any aches or pains?". It was assigned to Meera Iyer through `PUT /checkins/relationships/:id/preferred-form`. Her check-in for Sat 7 Nov already existed (pinned to v1 when it was scheduled), so the **three demo check-ins used (Meera, Farhan, Pooja) were re-pinned to the new version with a local-only SQL `update checkins set checkin_form_version_id`** against the local D1. The seed files were not changed and nothing was run against a remote.
- Trainee screens (Meera on iOS size, Farhan on Android size) were driven through the real UI: untouched form, then a confirmed/changed weight, one photo, energy 4, stress 2, notes, the custom answer, review, Send. The `/sync/push` bodies were recorded: the first draft was `answers: {}`, and later drafts and the submit carried only `fieldAnswers` for answered questions (plus legacy `notes` for the question with id `notes`). No `wellbeing`, no `"OK"`, no `null`, no waist/hips/chest/arm/thigh (left untouched), and the untouched last-weight hint was not sent until the trainee changed it.
- Pooja's check-in was submitted through the API (`POST /checkins/:id/submit`) with a v2-shaped body and no `wellbeing`; the server answered 200. It was then opened in mobile trainer review.
- Reviews were recorded through `POST /checkins/:id/review` (needs follow-up) for Meera and Farhan so the reviewed states exist.

## Results per frame

PASS means the answers shown are the real ones from the pinned form, in form order. Layout differences from a frame that the spec does not ask for are listed, not hidden.

| Frame | Viewport | Screenshot | Result |
|---|---|---|---|
| `100-trainee-checkin-sent-ios.png` | 393×852 | `trainee-sent-100-393x852.png` | **PARTIAL.** Answers: PASS (weight 62.5 kg and 1 photo come from what was sent, never from `wellbeing`). Frame gaps left as is: the "Sent to Rahul" headline and paragraph (the screen keeps today's "Sent. Rahul will review this." copy), the paper-plane icon, the "−0.5 since Fri 9 Oct" delta (no data source on this screen, per spec), the "Next check-in" tile (no cadence data on this screen), and the single joined tile strip layout (two separate tiles here). |
| `100-…` | 412×915 | `trainee-sent-100-android-412x915.png` | Same as above (Farhan, 78.2 kg, 1 photo). |
| `101-trainee-checkin-reviewed-ios.png` | 393×852 | `trainee-reviewed-101-393x852.png` | **PARTIAL.** "What you sent" lists the real answers in form order (Weight 62.5 kg, Front Photo noted, Energy 4 of 5, Stress 2 of 5, Notes, Any aches or pains?), unanswered questions skipped: PASS. Frame gap (known, spec): the frame's rows ("What was hard?", "Anything for Rahul?", "Waist 94 cm") are fixed v1-style labels and values; this screen shows the pinned form's own labels. Also not built: the frame's "‹ Progress" header, the green "reviewed your check-in" banner and the avatar note card (the screen keeps today's reviewed layout and copy). |
| `101-…` | 412×915 | `trainee-reviewed-101-android-412x915.png` | Same as above (Farhan). |
| `75-trainer-mobile-checkin-review-saved-ios.png` | 393×852 | `trainer-review-75-393x852.png` | **PARTIAL.** Rating tiles come from the form's answered 1 to 5 questions (Energy, Sleep quality, Stress, Hunger; four tiles wrap), text rows are Notes and the custom question, measure tiles show Weight 71.2 kg (+0.6 since Tue 20 Oct), Waist 82 cm (−11.6 since Sun 18 Oct), Hips, Arm, Thigh with value and unit and no delta: PASS for content and order. The screenshot is the open, not yet saved review (saving returns to the list, so the "Review saved" toast and the reviewed footer of the frame are not reachable in a still): not captured. The frame's photo tiles and "Compare" were not changed by this task. |
| `75-…` | 412×915 | `trainer-review-75-android-412x915.png` | Same as above. |
| `163-trainer-web-checkin-review-web.png` | 1440×900 | `web-163-checkin-review-1440x900.png` | **PARTIAL.** The Answers list shows only answered questions in form order with their units (Weight 62.5 kg, Front Photo noted, Energy 4, Stress 2, Notes, …), no `wellbeing` row and no "—" rows: PASS. The rest of the page (context card, review panel, header) is the existing page, which differs from the frame in ways this task does not touch. cm and `other` units are proved by the unit tests, not by this screenshot (the sample answers had only a weight). |
| `164-trainer-web-checkin-reviewed-web.png` | 1440×900 | `web-164-checkin-reviewed-1440x900.png` | **PARTIAL.** Same answers list as 163 in the reviewed state ("Reviewed · Needs follow-up"); the surrounding page is unchanged and differs from the frame. |
| `148-trainer-web-configure-v3-web.png` | 1440×900 | `web-148-configure-draft-before-pick-1440x900.png`, `…-global-picked-…`, `…-saved-…` | **PARTIAL.** The Check-ins accordion's form select lists the global form with the base template's pinned version id; picking it and saving a draft sends `GLOBAL_CHECKIN_FORM_VERSION_ID` (unit test). The page layout is the existing Configure page, not the frame's Plan › Coaching setup layout (Coaching setup is not rebuilt, per spec). The "global template has a newer version" case cannot be shown on this seed (it has no newer global version until Z6-2); it is proved by the unit tests. |
| `149-trainer-web-configure-active-v3-web.png` | 1440×900 | `web-149-configure-active-1440x900.png` | **PARTIAL.** Active configuration with the check-in form select locked and the summary naming the pinned form. Same layout note as 148. |

Not captured: nothing in the spec's list was skipped except the saved-state toast of frame 75 (see above). Android renders of the trainee form steps are included for the iOS and Android sizes.

## Fix round

After review: the 75 shots (393×852 and 412×915) and `trainee-form-1-measurements-untouched-393x852.png` were re-captured on a fresh local seed (same v2-shaped form built the same way, Pooja's check-in submitted through the API, Meera's re-pinned with the local SQL update). Rating tiles now wrap at three per row at their normal size (Hunger no longer stretches full width) and the "Last: …" weight hint shows as an underlined indigo link while the weight is unanswered. The other Android trainee shots were not re-captured; they predate the hint styling and the 75 tile change does not touch them.

## Other screenshots

`trainee-form-*` show the form: all 15 questions of the pinned form in order across the three steps (untouched weight shows "—" with the last weight as a "Last: Sat 31 Oct · 62.4 kg" hint; the steppers show "—" until the trainee presses them), and `trainee-review-before-send-*` shows only the answered questions with units.

## Frame gaps (summary)

- 100: headline/paragraph/icon, delta since the last weight, "Next check-in" tile, tile layout.
- 101: fixed v1 labels and values, header, banner and note card layout.
- 75: saved-state toast and reviewed footer; photo tiles.
- 148, 149: Plan › Coaching setup layout; the "newer global version" case on this seed.

## Checks

See the PR description for the commands run and their results.
