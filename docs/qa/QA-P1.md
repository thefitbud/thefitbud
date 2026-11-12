# QA-P1 · Full UI audit on main (Z11-2)

**Task:** Z11-2 (P1, with P3, MBR and MCD folded in). **Batch:** W11 (D-W11-7: local run on the realistic demo seed).
**Audited:** `main` at 3ba526c (all captures) and 21d76f8 (frames 51, 59 and ds5-ios-trainer-more-legal recaptured after #420 merged; every `file:line` is on 21d76f8). Between the two, main took #420 (Z11-14 role screens), #422 (e2e locator), #418 (deps) and #423 (seed timestamps).
**How:** `pnpm db:reset` (realistic seed), API on 8802, trainer web (Vite) on 5102, mobile on Expo web on 19002 with the capture bridge. Chromium at the frame viewport (1440x900, 1024x768, 768x1024, 393x852, 412x915), deviceScaleFactor 1, timezone Asia/Kolkata. Each capture has a `.txt` of its visible text for the design-guide checks. `node scripts/qa/visual/diff.mjs --task <bucket> --qa-dir docs/qa/P1/captures` produced one design-review per bucket. Verdicts are by eye, frame and capture side by side; the pixel score is only a hint (frames carry sample data, so most scores read "likely gap").
**Limits:** Expo web is not the device: fonts fall back, no status bar, no OS permission prompts, no native modules (Live Activity, HealthKit/Health Connect), and some RN gestures (swipe) and deep links on a cold web load do not work. States that need a write the audit avoided, a server fault mid-flow, or data the seed does not have are marked NOT AUDITED with the reason. Pushes the API shows as in-app banners (frame 29) do appear on Expo web.

## Counts

| Bucket | File | MATCH | CLOSE | GAP | Not audited |
|---|---|---|---|---|---|
| G1 | [P1/G1.md](P1/G1.md) | 0 | 2 | 4 | 0 |
| G2 | [P1/G2.md](P1/G2.md) | 0 | 1 | 8 | 0 |
| G3 | [P1/G3.md](P1/G3.md) | 0 | 1 | 7 | 0 |
| G4 | [P1/G4.md](P1/G4.md) | 0 | 4 | 4 | 2 |
| G5 | [P1/G5.md](P1/G5.md) | 0 | 1 | 3 | 1 |
| G6 | [P1/G6.md](P1/G6.md) | 0 | 2 | 4 | 1 |
| G7 | [P1/G7.md](P1/G7.md) | 0 | 3 | 9 | 0 |
| G9 | [P1/G9.md](P1/G9.md) | 3 | 7 | 5 | 2 |
| G10 | [P1/G10.md](P1/G10.md) | 0 | 5 | 0 | 2 |
| G11 | [P1/G11.md](P1/G11.md) | 0 | 5 | 8 | 6 |
| redesign | [P1/redesign.md](P1/redesign.md) | 17 | 75 | 13 | 46 |
| **All** | | **20** | **106** | **65** | **60** |

G8 is in W7 (Z7-4, D-W12-3); its frames (135, 191 and the DS1 home views) are audited in `redesign.md`. No bucket has more than 40 GAP rows, so no file was split. Frames that are not app screens or are parked (Live Activity, OS notification renderings, Phase 10 sessions/calendar, reference frames) are listed at the end of `redesign.md`.

## Headline verdicts

- **Trainer web G-buckets (W12) are mostly GAP.** The structure of most W12 screens differs from the frames, not just details: first run renders inside the app shell (G1), invite detail/revoke and add-client success lack the frame's header, stepper and side cards (G2), Overview has no week navigation so frame 03b cannot be reached (G3), the builders are a different layout (G4), check-in review keeps its footer strip (G5), Templates is a card grid and Libraries a dense grid (G6), and every system state (error, not found, forbidden) is a bare page (G7).
- **Date rule breaks on web:** native date inputs show `mm/dd/yyyy` on History (165) and `11/12/2026` in Publish & schedule (155); raw IANA "Asia/Kolkata" shows in Profile (176) and first-run (125); raw E.164 WhatsApp numbers on Profile (176, mobile 55) and invite detail (144).
- **Unstyled controls on web:** `.segment-btn` is only styled under `.clients-page` and `.checkins-page` (`apps/trainer-web/src/styles/clients.css:185`), so the segments on Activity (158) and the Templates owner filter (168) render as native buttons.
- **Trainer mobile review sheet is half wired (new):** on the v3 sheet `Resolve…` does nothing (no `onResolve` from `AttentionTab.tsx:792`), `Nudge…` opens WhatsApp directly with no sheet (`AttentionTab.tsx:485`) and there is no ⋯ (Add note, WhatsApp). Frames 31-resolved, 31-all-resolved, 33, 34, 35, 36 are unreachable from Needs you.
- **Trainee Today with no plan shows an API error (new, not a frame state):** a coaching-ready trainee with no plan sees a red banner "An active coaching configuration is required to schedule check-ins." from the check-in card: TodayCheckinCard (rendered at `apps/mobile/src/trainee/TodayTab.tsx:1114`) catches the ensureDueCheckin failure at `CheckinScreen.tsx:1270` and renders an ErrorBanner at `CheckinScreen.tsx:1304`. The design review flags the banned string `active coaching`. Frame 04-empty (a planned trainee with nothing logged) is not audited: no capture of that state.
- **Mobile trainee W12 screens are close:** G9/G10 are mostly MATCH or CLOSE (onboarding, meal plan, ask coach, diet sheets, workout day/summary, progress, inbox). The real gaps are sign in (06, 06b, 103), the item-unavailable screen (26: production shows only "This meal isn't available anymore.", with no date or replacement and no backend source for them; the capture bridge hard-codes the frame copy), the diet error state (102), reminder and meal-time settings (76, 79, 82–84) and the ended trainee landing on an overlay instead of Today (89).
- **Redesign (W7–W10) holds up:** 17 MATCH and 75 CLOSE (13 GAP) of the audited frames; GAPs are the mobile review sheet wiring above, the trainee measurement keypad (14c), the reviewed check-in screen (101), the check-in form builder (171, 171b), the iPad 768 drawer (193), Edit basic details fields (210), and the Reactivate dialog (180).
- **Account deletion (BP1)** is not built on either platform (Z12-29, Z12-30), as expected.
- **Seed content:** the check-in scale label "100 %" (`apps/api/src/seed/demo/generator/templates/forms.ts:100`) shows in the form preview (171), a percentage on screen.
- **Known inputs from the spec:** after Z11-3 and Z5-3 the design review finds no ISO dates and no raw enum values in any captured mobile or web text; the Diet ring and meal rows agree on the captures (Z11-3). Frames 07 and 86 are left as CLOSE with "PR Z9-5 in flight" (Diet buttons); re-check them when Z9-5 merges.

## Fold-ins

### MCD: clock-dependent API date tests

Run under the heavy and d1 locks on 3ba526c (`apps/api/src/seed/demo/demo-seed.test.ts` is the determinism test the spec names):

| Command | Result |
|---|---|
| `TZ=Pacific/Kiritimati pnpm --filter @fitbud/api test` | 121 files, 1592 tests passed, exit 0 |
| `TZ=Pacific/Pago_Pago pnpm --filter @fitbud/api test` | 121 files, 1592 tests passed, exit 0 |

MCD is fixed: both extreme time zones (UTC+14 and UTC−11) pass.

### P3: MD1 narrow recheck (frames 17, 18, 19, 73, 74, 75, 10, 101, 07, 86)

| Frame | Verdict now | Still open |
|---|---|---|
| 17 | CLOSE | Rows show week only (frame goal · week). |
| 18 | CLOSE | Six actions in two rows; exception card lacks the detail sentence. |
| 19 | CLOSE | Summary line Title-cases nouns; seed has only Wellbeing answers. |
| 73 | NOT AUDITED | Not reached: Ended filter chip not found on Expo web. |
| 74 | NOT AUDITED | Not reached (follows 73). |
| 75 | NOT AUDITED | Not reached: Rohan's latest check-in is scheduled, no saved review on the seed. |
| 10 | CLOSE | Missed-workouts card absent; selected day was a past session. |
| 101 | GAP | Reviewed screen lacks the green reviewed banner and the From Rahul card. |
| 07 | CLOSE | PR Z9-5 in flight (Diet buttons). |
| 86 | CLOSE | No offline banner, header pill or per-meal pills (PR Z9-5 in flight). |

### MBR: MB fix2 recheck (claim: 1 MATCH / 21 CLOSE)

MB covered TR-10 to TR-15, TR-18 and TR-23. P1 verdicts for those frames:

| Frame | Verdict |
|---|---|
| 10 | CLOSE |
| 10b | CLOSE |
| 11 | CLOSE |
| 11b | CLOSE |
| 11c | CLOSE |
| 12 | CLOSE |
| 13 | CLOSE |
| 14 | CLOSE |
| 14c | GAP |
| 15 | CLOSE |
| 98 | CLOSE |
| 99 | NOT AUDITED |
| 100 | NOT AUDITED |
| 101 | GAP |
| 113 | CLOSE |
| 114 | NOT AUDITED |
| 25 | CLOSE |
| 26 | GAP |

Result: 12 CLOSE, 3 GAP, 3 NOT AUDITED. The claim does not quite hold: none of the reached frames is a MATCH (26 is a GAP once the capture bridge's hard-coded copy is set aside), most are CLOSE, and 14c, 101 and 26 are GAP; 99, 100 and 114 need seed states that do not exist.

## W12 tasks whose gap list changes

Every W12 spec defers its gap list to this audit. Where the audit found the work in a file the spec does not name, that is called out: the spec's `files_owned` needs a planner update before the task runs.

| Task | P1 result | Change to the gap list |
|---|---|---|
| Z12-1 | 01, 197 CLOSE | Small: hero bullet icons and spacing only. |
| Z12-2 | 125–128 GAP | First run renders inside the app shell: the fix needs `apps/trainer-web/src/App.tsx:58` (route placement), which the spec does not own. |
| Z12-3 | 137, 139 GAP; 138 CLOSE | Error card lives in `components/StatePanels.tsx` (owned by Z12-17); coordinate. |
| Z12-4 | 141–143, 196 GAP | The form and success card are in `components/invite/AddClientForm.tsx` and `components/invite/InviteShareCard.tsx`, not `AddClientPage.tsx`; 196 needs the 768 shell (`layout/AppShell.tsx`) and `ClientRow.tsx` (owned by Z12-3). |
| Z12-5 | 144, 145 GAP | Confirmed in `PendingInvitationPage.tsx`; add E.164 formatting. |
| Z12-6 | 03, 03-full, 03b, 192 GAP | Week navigation is the core gap (03b unreachable); header wrap is in `components/workspace/WorkspaceHeader.tsx` (not owned). |
| Z12-7 | 146, 147, 188 GAP; 189 CLOSE | Confirmed. |
| Z12-8 | 158, 163, 198 GAP; 164 CLOSE; 159 not audited | Segment styling is in `styles/clients.css:185` (not owned). |
| Z12-9 | 165, 190 GAP | Search palette is in `layout/AppShell.tsx:426`, not a page the spec names. |
| Z12-10 | 155 GAP; 151 CLOSE; 156, 157 not audited | Publish dialog is `components/plan/AssignPlanModal.tsx` (not owned); date input breaks the date rule. |
| Z12-11 | 152, 154 GAP; 153 CLOSE | Builder is `components/plan-composition/PlanCompositionEditor.tsx` and `components/builder/PlanBuilder.tsx`, not `PlanBuilderPage.tsx`. |
| Z12-12 | 200 GAP; 194, 195 CLOSE | 200 is in `ClientPlanPage.tsx:481`, owned by Z12-10: move 200 to Z12-10 or share. |
| Z12-13 | 168 GAP; 174, 175 CLOSE; 169 unreachable | Owner filter is `templates/TemplateScopeToolbar.tsx` (not owned); 169 needs a seed trainer with no diet templates of their own. |
| Z12-14 | 170, 172, 173 GAP | Confirmed. |
| Z12-15 | 176, 177 GAP | Confirmed; add timezone label and phone formatting. |
| Z12-16 | 182, 183 CLOSE | Shrinks to copy and the meal block. |
| Z12-17 | 184, 185, 187 GAP; 186 CLOSE | Client-level error/not-found/forbidden render from `pages/ClientWorkspaceLayout.tsx:153` and `:178` (not owned); `ForbiddenPage` is not used for another coach's client. |
| Z12-18 | 06, 06b, 103 GAP | The screens are `screens/auth/SignInScreen.tsx` and `CodeSignInScreen.tsx` (inside `screens/auth/**`); the wrong-password copy is in `lib/authErrors.ts`, which is outside files_owned. |
| Z12-19 | 21, 23 MATCH; 20, 22 CLOSE | Shrinks to polish. |
| Z12-20 | 26 GAP; 24, 25 CLOSE | 26 needs a backend source for the replacement meal and the update date (production shows only the reason line, `TraineeShell.tsx:294`); quantity/unit spacing on 24. |
| Z12-21 | 08c MATCH; 08, 08b CLOSE; 07b not audited | Shrinks; stepper label truncation. |
| Z12-22 | 102 GAP; 09 CLOSE; 100 not audited | 102 is in `DietTab.tsx:727`, owned by Z12-21: coordinate. |
| Z12-23 | 10b, 12 CLOSE; 99 not audited | Shrinks; 99 lives in `WorkoutTab.tsx` (not owned). |
| Z12-24 | 13, 15, 98 CLOSE; 114 not audited | Shrinks to polish. |
| Z12-25 | 76, 79 GAP; 16, 78 CLOSE | Confirmed in `ReminderSettingsScreen.tsx`. |
| Z12-26 | 82, 83, 84 GAP; 80 CLOSE | Confirmed in `MealTimesScreen.tsx`. |
| Z12-27 | 85 CLOSE; 87, 88 not audited | Needs a scripted conflict and unsent logs to verify. |
| Z12-28 | 89 GAP; 90 CLOSE | Ended landing is decided in `navigation/TraineeOverlay.tsx:332` (not owned). |
| Z12-29, Z12-30 | BP1 GAP (not built) | Confirmed. |

**No W12 task covers (new):** mobile review sheet Resolve/Nudge/⋯ wiring (frames 31 resolved, 33–36; the W10 exception-redesign follow-up that D-W11-F1 sends to W12); trainee Today check-in card error for a no-plan trainee (`CheckinScreen.tsx:1304`); trainee measurement keypad (14c); reviewed check-in screen (101); check-in form builder and measurement picker (171, 171b); Edit basic details fields (210); Reactivate dialog choices (180); 768 portrait shell (193, and 196); web bell popover (123); the seed's "100 %" scale label.

## Checks

- `pnpm lint` and `pnpm typecheck`: ran locally, pass.
- `pnpm test`: not run anywhere. Locally only the API suite ran (the two TZ runs above), and the `ci` workflow was path-skipped on this docs-only PR.
- `TZ=Pacific/Kiritimati` and `TZ=Pacific/Pago_Pago` `pnpm --filter @fitbud/api test`: pass (above).
- `node scripts/qa/visual/diff.mjs` per bucket: ran; the reports are committed under `P1/captures/<bucket>/design-review.md`. The side-by-side PNGs are not committed (repo weight). To regenerate them, run `node scripts/qa/visual/diff.mjs --task <bucket> --qa-dir docs/qa/P1/captures` for G1–G7, G9–G11 and `redesign`. Design-guide findings: `active coaching` on the no-plan trainee's Today (real), `100 %` in the check-in form preview (seed text), and `3ba526ca` on mobile sign in (the dev-only bundle commit badge, not shipped).
- The e2e banned-strings scan was not run: it boots the API through e2e global setup, which this task must not run.
- No app code changed.
