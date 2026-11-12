# P1 audit · redesign: Redesign frames W7–W10 (v3, DS1–DS8, IP) and the other built frames

Audited on `main` at 3ba526c (captures) and 21d76f8 (frames 51, 59, ds5-ios-trainer-more-legal recaptured after #420; `file:line` references are on 21d76f8). Local demo seed, Expo web for mobile (fallback fonts, no status bar), Chromium at the frame viewport, deviceScaleFactor 1.

Verdicts are by eye from the frame and the capture side by side; the diff score from `scripts/qa/visual/diff.mjs` is advisory (frames use sample data, so most scores are high). MATCH = layout, copy and state match apart from data; CLOSE = same structure with small differences listed in the note; GAP = a frame detail is missing or wrong (bullets below); NOT AUDITED = not reached, with the reason.

Captures: `docs/qa/P1/captures/redesign/`. Design review: [`captures/redesign/design-review.md`](captures/redesign/design-review.md). The side-by-side images are not committed; regenerate them with `node scripts/qa/visual/diff.mjs --task redesign --qa-dir docs/qa/P1/captures`.

| Frame | Verdict | Capture | Diff (design review) | Target | Note |
|---|---|---|---|---|---|
| `02-trainer-web-home-panel-v3-web.png` | **CLOSE** | `02-trainer-web-home-panel-v3-web-1440x900.png` | 25.6% (likely gap) | Z7-2/Z7-5 | Home is the approved DS1 layout. Panel lacks "1 of 3" pager/progress and the "Also open" list; Nudge copy says push (frame WhatsApp). |
| `02-trainer-web-home-panel-v3-resolve-web.png` | **CLOSE** | `02-trainer-web-home-panel-v3-resolve-web-1440x900.png` | 25.8% (likely gap) | Z7-6 | Outcome chips + private note match; no pager. |
| `02-trainer-web-home-panel-v3-resolved-web.png` | **NOT AUDITED** | — | — | Z7-5 | Needs a completed Resolve with Undo window; skipped to keep the seed's open items for other captures. |
| `131-trainer-web-home-panel-v3-nudge-limited-web.png` | **NOT AUDITED** | — | — | Z7-6 | No client at the nudge limit on the seed. |
| `132-trainer-web-home-panel-v3-resolved-readonly-web.png` | **NOT AUDITED** | `132-trainer-web-home-panel-v3-resolved-readonly-web--reviewed-1440x900.png` | 24.9% (likely gap), paired by number prefix | Z7-7 | The Reviewed row's button opens Resolve; the read-only panel was not opened. |
| `133-trainer-web-home-panel-v3-not-found-web.png` | **CLOSE** | `133-trainer-web-home-panel-v3-not-found-web-1440x900.png` | 23.6% (likely gap) | Z7-7 | "This item no longer exists" state present; header shows a "C Client" placeholder and only Close. |
| `135-trainer-web-home-all-clear-web.png` | **MATCH** | `135-trainer-web-home-all-clear-web-1440x900.png` | 3.1% (check by eye) | Z7-1 |  |
| `199-trainer-web-exception-quiet-hours-web.png` | **NOT AUDITED** | — | — | Z7-6 | No open item for a client inside quiet hours at capture time. |
| `193-ipad-exception-drawer-ipad-portrait.png` | **GAP** | `193-ipad-exception-drawer-ipad-portrait-768x1024.png` | 20.9% (likely gap) | new |  |
| `191-ipad-home-ipad.png` | **CLOSE** | `191-ipad-home-ipad-1024x768.png` | 19.9% (likely gap) | Z7-2 | Row descriptions wrap to two lines at 1024; rail has no count badges. |
| `DS1-home-attention-web.png` | **CLOSE** | `DS1-home-attention-web-1440x900.png` | 22.7% (likely gap) | Z7-2 | Top-bar crumb reads "FitBud" (frame "Home"). |
| `DS1-home-attention-empty-web.png` | **MATCH** | `DS1-home-attention-empty-web-1440x900.png` | 3.3% (check by eye) | Z7-2 |  |
| `DS1-home-renewals-web.png` | **CLOSE** | `DS1-home-renewals-web-1440x900.png` | 22.1% (likely gap) | Z7-2 | No "Later" chip; rows show plan + frequency instead of "Monthly · ₹6,000". |
| `DS1-home-renewals-empty-web.png` | **MATCH** | `DS1-home-renewals-empty-web-1440x900.png` | 3.3% (check by eye) | Z7-2 | Copy says next 7 days (frame 30). |
| `DS1-home-asks-web.png` | **CLOSE** | `DS1-home-asks-web-1440x900.png` | 6.4% (check by eye) | Z7-2 | No Open / Answered this week tabs; rows show "asked about X" instead of the question quote. |
| `DS1-home-asks-empty-web.png` | **MATCH** | `DS1-home-asks-empty-web-1440x900.png` | 3.3% (check by eye) | Z7-2 |  |
| `DS2-bulk-select-web.png` | **NOT AUDITED** | `DS2-bulk-select-web-1440x900.png` | 26.7% (likely gap) | Z7-8 | "Resolve several…" lives in the drawer ⋯ menu (ExceptionDrawer.tsx:1810); the script could not open that menu, capture shows the single-item panel. |
| `DS2-bulk-confirm-web.png` | **NOT AUDITED** | — | — | Z7-8 | As DS2 select. |
| `DS2-bulk-partial-web.png` | **NOT AUDITED** | — | — | Z7-8 | Needs a partial bulk failure. |
| `DS2-bulk-undo-web.png` | **NOT AUDITED** | — | — | Z7-8 | As DS2 select. |
| `DS4-home-row-card-web.png` | **CLOSE** | `DS4-home-row-card-web-1440x900.png` | 24.6% (likely gap) | Z7-2 | Summary cards and rows present; hover state not exercised. |
| `DS4-home-row-card-ipad.png` | **CLOSE** | `DS4-home-row-card-ipad-1024x768.png` | 18.4% (likely gap) | Z7-2 | As 191. |
| `123-notif-bell-web.png` | **CLOSE** | `123-notif-bell-web-1440x900.png` | 27.0% (likely gap) | new | Bell popover rows are plain text: no icons, times, unread dots, Mark all read or quiet-hours footer. |
| `136-trainer-web-clients-web.png` | **CLOSE** | `136-trainer-web-clients-web-1440x900.png` | 25.7% (likely gap) | Z7-16 | Sorted A–Z; Plan column lacks version; renewal pill without date. |
| `140-trainer-web-clients-ended-web.png` | **CLOSE** | `140-trainer-web-clients-ended-web-1440x900.png` | 5.0% (check by eye) | Z9-16 | Last plan lacks version. |
| `03c-trainer-web-client-overview-reminders-v3-web.png` | **CLOSE** | `03c-trainer-web-client-overview-reminders-v3-web-1440x900.png` | 23.4% (likely gap) | Z8-11 | Reminders card present; Progress card date "6 Nov, 2:50 am" has no weekday. |
| `181-trainer-web-reminders-panel-v3-web.png` | **CLOSE** | `181-trainer-web-reminders-panel-v3-web-1440x900.png` | 24.8% (likely gap) | Z7-15 | Rohan's push is off, so only the "Notifications off" summary shows; breakdown tables not shown for this state. |
| `208-trainer-web-client-menu-v3-web.png` | **CLOSE** | `208-trainer-web-client-menu-v3-web-1440x900.png` | 24.8% (likely gap) | Z8-1 | Menu has no "Add note" item. |
| `208b-ipad-client-menu-v3-ipad.png` | **CLOSE** | `208b-ipad-client-menu-v3-ipad-1024x768.png` | 19.3% (likely gap) | Z8-1 | As 208; header wraps. |
| `209-trainer-web-client-settings-v3-web.png` | **CLOSE** | `209-trainer-web-client-settings-v3-web-1440x900.png` | 23.9% (likely gap) | Z8-2 | Basic details hide Email/DOB/Height/City (no seed data). |
| `209b-ipad-client-settings-v3-ipad.png` | **CLOSE** | `209b-ipad-client-settings-v3-ipad-1024x768.png` | 10.4% (check by eye) | Z8-2 | As 209. |
| `210-trainer-web-client-basic-edit-v3-web.png` | **GAP** | `210-trainer-web-client-basic-edit-v3-web-1440x900.png` | 20.6% (likely gap) | new |  |
| `211-trainer-web-client-subscription-edit-v3-web.png` | **CLOSE** | `211-trainer-web-client-subscription-edit-v3-web-1440x900.png` | 23.6% (likely gap) | Z8-3 | Rohan is online-only, so no package block; footnote "Tracking only." per D-W9-7. |
| `211b-trainer-web-client-subscription-error-v3-web.png` | **NOT AUDITED** | — | — | Z8-3 | Second Edit button not found on the retry run. |
| `212-trainer-web-client-settings-ended-v3-web.png` | **CLOSE** | `212-trainer-web-client-settings-ended-v3-web-1440x900.png` | 9.5% (check by eye) | Z8-3 | Read-only; fewer basic-detail rows (seed). |
| `IP-08-trainer-web-client-settings-package-v3-web.png` | **CLOSE** | `IP-08-trainer-web-client-settings-package-v3-web-1440x900.png` | 24.5% (likely gap) | Z8-4 | Neha (hybrid): package card, sessions bar, payment records match. |
| `179-trainer-web-client-ended-web.png` | **MATCH** | `179-trainer-web-client-ended-web-1440x900.png` | 5.1% (check by eye) | Z9-17 |  |
| `178-trainer-web-end-coaching-web.png` | **CLOSE** | `178-trainer-web-end-coaching-web-1440x900.png` | 29.0% (likely gap) | new | Adds a type-the-name confirm; reason default differs. |
| `180-trainer-web-reactivate-web.png` | **GAP** | `180-trainer-web-reactivate-web-1440x900.png` | 29.9% (likely gap) | new |  |
| `148-trainer-web-configure-v3-web.png` | **CLOSE** | `148-trainer-web-configure-v3-web-1440x900.png` | 23.8% (likely gap) | Z8-5 | Extra Coaching mode section (IP-07); Starting point collapsed. |
| `149-trainer-web-configure-active-v3-web.png` | **CLOSE** | `149-trainer-web-configure-active-v3-web--expectations-1440x900.png` | 9.2% (check by eye), paired by number prefix, 2 candidate frames | Z8-6 | Expectations table matches; extra "Version 1 is active" banner and log-window inputs. |
| `IP-07-trainer-web-coaching-setup-mode-v3-web.png` | **CLOSE** | `IP-07-trainer-web-coaching-setup-mode-v3-web-1440x900.png` | 24.3% (likely gap) | Z8-7 | Three mode cards; Rohan is not hybrid, so no place/slot fields. |
| `DS3-activate-dialog-web.png` | **CLOSE** | `DS3-activate-dialog-web-1440x900.png` | 70.5% (likely gap) | Z8-5 | Start shown as "Today · Thu 12 Nov" without a date field. |
| `DS3-save-version-dialog-web.png` | **NOT AUDITED** | — | — | Z8-6 | Needs an edited active configuration; not captured. |
| `DS7-readonly-fields-web.png` | **CLOSE** | `DS7-readonly-fields-web-1440x900.png` | 7.9% (check by eye) | Z7-11 | Read-only label/value summary for the ended client. |
| `DS7-readonly-fields-ipad.png` | **NOT AUDITED** | — | — | Z7-11 | Web capture covers the component; iPad not captured. |
| `150-trainer-web-plan-v3-web.png` | **CLOSE** | `150-trainer-web-plan-v3-web-1440x900.png` | 25.9% (likely gap) | Z8-8 | Extra "Plan and configuration differ" card (seed data); no scheduled-version pill. |
| `160-trainer-web-progress-v3-web.png` | **CLOSE** | `160-trainer-web-progress-v3-web-1440x900.png` | 23.7% (likely gap) | Z8-12 | Structure matches; seed has no 1–5 ratings, hip, chest or arm. |
| `160b-trainer-web-progress-checkin-answers-v3-web.png` | **NOT AUDITED** | — | — | Z8-12 | No 1–5 rating answers on the seed. |
| `160c-trainer-web-progress-measurements-v3-web.png` | **CLOSE** | `160c-trainer-web-progress-measurements-v3-web-1440x900.png` | 23.4% (likely gap) | Z8-12 | Only Waist has data. |
| `160d-trainer-web-progress-compare-v3-web.png` | **CLOSE** | `160d-trainer-web-progress-compare-v3-web-1440x900.png` | 24.8% (likely gap) | Z8-13 | Compare menu lists only Waist (no ratings on the seed). |
| `160e-trainer-web-progress-workouts-v3-web.png` | **CLOSE** | `160e-trainer-web-progress-workouts-v3-web-1440x900.png` | 27.8% (likely gap) | Z8-13 | Matches. |
| `160f-trainer-web-progress-photos-v3-web.png` | **NOT AUDITED** | `160f-trainer-web-progress-photos-v3-web-1440x900.png` | 33.3% (likely gap) | Z8-14 | No progress photos on the seed ("No entries"). |
| `160g-trainer-web-progress-sparse-v3-web.png` | **NOT AUDITED** | `160g-trainer-web-progress-sparse-v3-web-1440x900.png` | 8.3% (check by eye) | Z8-14 | No client with exactly two weigh-ins. |
| `160h-trainer-web-progress-ended-v3-web.png` | **CLOSE** | `160h-trainer-web-progress-ended-v3-web-1440x900.png` | 8.6% (check by eye) | Z8-14 | Matches layout. |
| `160i-trainer-web-progress-loading-v3-web.png` | **MATCH** | `160i-trainer-web-progress-loading-v3-web-1440x900.png` | 5.3% (check by eye) | Z8-14 |  |
| `161-trainer-web-progress-empty-v3-web.png` | **CLOSE** | `161-trainer-web-progress-empty-v3-web-1440x900.png` | 8.6% (check by eye) | Z8-14 | One action instead of two. |
| `162-trainer-web-client-checkins-v3-web.png` | **CLOSE** | `162-trainer-web-client-checkins-v3-web-1440x900.png` | 10.5% (check by eye) | Z8-9 | No Check-in call card (Phase 10 parked); reviewed rows lack the weight summary. |
| `162b-trainer-web-client-checkins-empty-v3-web.png` | **CLOSE** | `162b-trainer-web-client-checkins-empty-v3-web-1440x900.png` | 7.1% (check by eye) | Z8-9 |  |
| `162c-trainer-web-client-checkins-ended-v3-web.png` | **CLOSE** | `162c-trainer-web-client-checkins-ended-v3-web-1440x900.png` | 8.4% (check by eye) | Z8-9 |  |
| `192b-ipad-client-checkins-v3-ipad.png` | **CLOSE** | `192b-ipad-client-checkins-v3-ipad-1024x768.png` | 12.9% (likely gap) | Z8-9 | Header meta wraps. |
| `166-trainer-web-checkins-inbox-web.png` | **CLOSE** | `166-trainer-web-checkins-inbox-web-1440x900.png` | 21.5% (likely gap) | Z7-3 | Extra Form column and Due tab; filled per-row Review buttons (frame tinted). |
| `167-trainer-web-checkins-inbox-empty-web.png` | **CLOSE** | `167-trainer-web-checkins-inbox-empty-web-1440x900.png` | 2.9% (matches) | Z7-3 | No "Next due" helper. |
| `171-trainer-web-checkin-form-builder-v3-web.png` | **GAP** | `171-trainer-web-checkin-form-builder-v3-web-1440x900.png` | 14.2% (likely gap) | new | Opened "Monthly maintenance review". |
| `171b-trainer-web-checkin-form-measure-picker-v3-web.png` | **GAP** | `171b-trainer-web-checkin-form-measure-picker-v3-web-1440x900.png` | 14.8% (likely gap) | new |  |
| `ds5-web-signin-footer.png` | **MATCH** | `ds5-web-signin-footer-1440x900.png` | 42.8% (likely gap) | BT3f |  |
| `ds5-web-privacy.png` | **MATCH** | `ds5-web-privacy-1440x900.png` | 6.5% (check by eye) | BT3 |  |
| `ds5-web-terms.png` | **MATCH** | `ds5-web-terms-1440x900.png` | 6.1% (check by eye) | BT3 |  |
| `ds5-web-credits.png` | **CLOSE** | `ds5-web-credits-1440x900.png` | 5.8% (check by eye) | BT3 | Adds food data and exercise text sections. |
| `04-trainee-today-ios-v3-partial.png` | **CLOSE** | `04-trainee-today-ios-v3-partial-393x852.png` | 30.4% (likely gap) | Z9-1 | Week strip is a separate card plus a "‹ Thu 12 Nov ›" row; in-app banner (29) over the top. |
| `04-trainee-today-ios-v3-done.png` | **CLOSE** | `04-trainee-today-ios-v3-done-393x852.png` | 39.3% (likely gap) | Z9-2 | Done card matches; same strip difference. |
| `04-trainee-today-ios-v3-empty.png` | **NOT AUDITED** | — | — | Z9-1 | Frame is a trainee with a plan and nothing logged yet; the only capture taken (Harpreet) has no plan, which is a different state. The no-plan finding is filed below as a separate row. |
| (no frame) trainee Today, coaching ready with no plan | **GAP** | `04-trainee-today-ios-v3-empty-393x852.png` | 27.4% (likely gap) | new | Not a frame: a new finding on Harpreet's Today (capture kept under the 04-empty name). |
| `04-trainee-today-ios-v3-past.png` | **NOT AUDITED** | — | — | Z9-3 | The previous-day tap landed on Diet; past-day Today not shown (the leftover capture shows Diet, a different state). |
| `04-trainee-today-ios-v3-rest.png` | **NOT AUDITED** | — | — | Z9-2 | Rest card seen in the 115 capture (Farhan), but no persona has a full rest day today. |
| `04-trainee-today-android-v3-partial.png` | **CLOSE** | `04-trainee-today-android-v3-partial-412x915.png` | 36.5% (likely gap) | Z9-1 | As iOS. |
| `04-trainee-today-android-v3-done.png` | **CLOSE** | `04-trainee-today-android-v3-done-412x915.png` | 36.5% (likely gap) | Z9-2 | As iOS. |
| `04-trainee-today-android-v3-empty.png` | **NOT AUDITED** | — | — | Z9-1 | As iOS empty: the capture (Harpreet, no plan) shows a different state; same no-plan finding as the iOS row. |
| `04-trainee-today-android-v3-past.png` | **NOT AUDITED** | — | — | Z9-3 | As iOS past (the leftover capture shows Today for the current day, a different state). |
| `04-trainee-today-android-v3-rest.png` | **NOT AUDITED** | — | — | Z9-2 | Farhan has a workout today; the leftover capture shows a training day, not rest. |
| `104-trainee-today-offline-v3-android.png` | **CLOSE** | `104-trainee-today-offline-v3-android-412x915.png` | 33.6% (likely gap) | Z9-3 | Only a "Saved on phone · showing last sync" caption; no offline banner or "Waiting to send" pill. |
| `96-trainee-today-loading-v3-ios.png` | **MATCH** | `96-trainee-today-loading-v3-ios-393x852.png` | 9.3% (check by eye) | Z9-3 |  |
| `29-trainee-inapp-meal-v3-ios.png` | **CLOSE** | `29-trainee-inapp-meal-v3-ios-393x852.png` | 41.3% (likely gap) | Z9-4 | Banner matches. |
| `29b-trainee-inapp-note-v3-ios.png` | **NOT AUDITED** | — | — | Z9-4 | Needs a fresh coach note push. |
| `113-notif-checkin-reviewed-banner-v3-ios.png` | **CLOSE** | `113-notif-checkin-reviewed-banner-v3-ios-393x852.png` | 39.8% (likely gap) | Z9-4 | Banner present; Today underneath differs (seed). |
| `115-notif-paused-today-v3-ios.png` | **CLOSE** | `115-notif-paused-today-v3-ios-393x852.png` | 34.0% (likely gap) | Z9-4 | Paused card present below the workout card. |
| `101-trainee-checkin-reviewed-ios.png` | **GAP** | `101-trainee-checkin-reviewed-ios-393x852.png` | 13.2% (likely gap) | new |  |
| `07-trainee-diet-ios.png` | **CLOSE** | `07-trainee-diet-ios-393x852.png` | 20.9% (likely gap) | Z9-5 | PR Z9-5 (Diet buttons) in flight; meal rows match the Z11-3 fix. |
| `86-trainee-diet-offline-ios.png` | **CLOSE** | `86-trainee-diet-offline-ios-393x852.png` | 15.8% (likely gap) | Z9-5 | PR Z9-5 in flight. Only "Saved on phone · Not sent yet" caption; no offline banner, header pill or per-meal pills. |
| `10-trainee-workout-overview-ios.png` | **CLOSE** | `10-trainee-workout-overview-ios-393x852.png` | 35.5% (likely gap) | Z9-6 | Selected day is a past session; missed-workouts card absent. |
| `11-trainee-active-workout-v3-ios.png` | **CLOSE** | `11-trainee-active-workout-v3-ios-393x852.png` | 24.2% (likely gap) | Z9-7 | Seed's first exercise is bodyweight; kg keypad not opened. |
| `11b-trainee-active-workout-rest-v3-ios.png` | **CLOSE** | `11b-trainee-active-workout-rest-v3-ios-393x852.png` | 28.0% (likely gap) | Z9-7 | Rest card matches; no Finish in the header. |
| `11c-trainee-active-workout-bodyweight-v3-ios.png` | **CLOSE** | `11c-trainee-active-workout-bodyweight-v3-ios-393x852.png` | 25.6% (likely gap) | Z9-7 | Rows match; reps keypad opens on tap only. |
| `14-trainee-check-in-v3-ios.png` | **CLOSE** | `14-trainee-check-in-v3-ios-393x852.png` | 21.1% (likely gap) | Z9-8 | Only Waist picked (seed). |
| `14c-trainee-check-in-measure-entry-v3-ios.png` | **GAP** | `14c-trainee-check-in-measure-entry-v3-ios-393x852.png` | 24.0% (likely gap) | new |  |
| `93-trainee-steps-setup-ios.png` | **NOT AUDITED** | `93-trainee-steps-setup-ios-393x852.png` | 12.6% (likely gap) | Z9-10 | Native only: web shows "Steps aren't available here". |
| `95-trainee-steps-health-connect-android.png` | **NOT AUDITED** | — | — | Z9-10 | Native only (Health Connect). |
| `ds5-ios-signin-footer.png` | **CLOSE** | `ds5-ios-signin-footer-393x852.png` | 39.6% (likely gap) | BT3f | Footer present; sign-in gaps as 06. Design review flags `3ba526ca`: the dev-only bundle commit badge. |
| `ds5-ios-more-legal.png` | **MATCH** | `ds5-ios-more-legal-393x852.png` | 12.6% (likely gap) | BT3d |  |
| `05-trainer-mobile-needs-you-v3-ios.png` | **CLOSE** | `05-trainer-mobile-needs-you-v3-ios-393x852.png` | 15.1% (likely gap) | Z10-1 | Segments are separate pills; no Sessions tab (Phase 10 parked); no search/bell. |
| `05-trainer-mobile-needs-you-v3-swipe-ios.png` | **NOT AUDITED** | — | — | Z10-1 | RN swipe gesture is not driven by a mouse drag on Expo web. |
| `05-trainer-mobile-needs-you-v3-reviewed-toast-ios.png` | **NOT AUDITED** | — | — | Z10-1 | Follows the swipe. |
| `31-trainer-mobile-review-sheet-v3-ios.png` | **MATCH** | `31-trainer-mobile-review-sheet-v3-ios-393x852.png` | 48.7% (likely gap) | Z10-1 | Opened from the Needs you row. |
| `31-trainer-mobile-review-sheet-v3-item2-ios.png` | **MATCH** | `31-trainer-mobile-review-sheet-v3-item2-ios-393x852.png` | 50.6% (likely gap) | Z10-1 |  |
| `31-trainer-mobile-review-sheet-v3-resolved-ios.png` | **GAP** | — | — | new |  |
| `31-trainer-mobile-review-sheet-v3-all-resolved-ios.png` | **GAP** | — | — | new |  |
| `33-trainer-mobile-exception-resolve-sheet-ios.png` | **GAP** | — | — | new |  |
| `34-trainer-mobile-exception-nudge-sheet-ios.png` | **GAP** | — | — | new |  |
| `35-trainer-mobile-exception-more-sheet-ios.png` | **GAP** | — | — | new |  |
| `36-trainer-mobile-note-composer-sheet-ios.png` | **GAP** | — | — | new |  |
| `37-trainer-mobile-exception-resolved-ios.png` | **NOT AUDITED** | — | — | Z10-6 | Needs a resolved item opened by link. |
| `38-trainer-mobile-exception-loading-ios.png` | **NOT AUDITED** | — | — | Z10-6 | Not captured. |
| `39-trainer-mobile-exception-not-found-ios.png` | **NOT AUDITED** | — | — | Z10-6 | Cold /go/exception link not routed on Expo web. |
| `40-trainer-mobile-exception-offline-ios.png` | **CLOSE** | `40-trainer-mobile-exception-offline-ios-393x852.png` | 53.7% (likely gap) | Z10-6 | Sheet stayed enabled with no banner within 2.5 s of going offline on Expo web; re-check on device. |
| `41-trainer-mobile-exception-ended-ios.png` | **NOT AUDITED** | — | — | Z10-6 | No open item for an ended client. |
| `43-trainer-mobile-attention-empty-ios.png` | **MATCH** | `43-trainer-mobile-attention-empty-ios-393x852.png` | 8.2% (check by eye) | Z10-2 |  |
| `44-trainer-mobile-attention-offline-ios.png` | **CLOSE** | `44-trainer-mobile-attention-offline-ios-393x852.png` | 20.6% (likely gap) | Z10-2 | Offline banner (AttentionTab.tsx:616) did not show on Expo web within 2.5 s; re-check on device. |
| `45-trainer-mobile-attention-error-ios.png` | **MATCH** | `45-trainer-mobile-attention-error-ios-393x852.png` | 8.2% (check by eye) | Z10-2 | Retry button added. |
| `46-trainer-mobile-checkins-to-review-ios.png` | **CLOSE** | `46-trainer-mobile-checkins-to-review-ios-393x852.png` | 11.6% (check by eye) | Z10-11 | No "Pull down" footer. |
| `47-trainer-mobile-checkins-overdue-ios.png` | **CLOSE** | `47-trainer-mobile-checkins-overdue-ios-393x852.png` | 9.1% (check by eye) | Z10-11 |  |
| `48-trainer-mobile-checkins-empty-ios.png` | **CLOSE** | `48-trainer-mobile-checkins-empty-ios-393x852.png` | 6.9% (check by eye) | Z10-11 | No "Next due" line. |
| `49-trainer-mobile-checkins-loading-ios.png` | **MATCH** | `49-trainer-mobile-checkins-loading-ios-393x852.png` | 5.3% (check by eye) | Z10-11 |  |
| `50-trainer-mobile-checkins-android.png` | **CLOSE** | `50-trainer-mobile-checkins-android-412x915.png` | 10.3% (check by eye) | Z10-11 |  |
| `17-trainer-mobile-clients-ios.png` | **CLOSE** | `17-trainer-mobile-clients-ios-393x852.png` | 18.0% (likely gap) | Z10-8 | Rows show week only. |
| `18-trainer-mobile-client-status-ios.png` | **CLOSE** | `18-trainer-mobile-client-status-ios--rohan-393x852.png` | 14.6% (likely gap), paired by number prefix | Z10-9 | Six actions in two rows (adds Log workout/Edit/Log meal/Log measurement). |
| `19-trainer-mobile-check-in-review-ios.png` | **CLOSE** | `19-trainer-mobile-check-in-review-ios-393x852.png` | 12.5% (likely gap) | Z10-10 | Seed answers only Wellbeing; summary line Title-cases nouns ("Workouts · Meals logged"). |
| `73-trainer-mobile-clients-ended-ios.png` | **NOT AUDITED** | — | — | Z10-8 | Ended filter chip not found by the script. |
| `74-trainer-mobile-client-ended-ios.png` | **NOT AUDITED** | — | — | Z10-9 | Follows 73. |
| `75-trainer-mobile-checkin-review-saved-ios.png` | **NOT AUDITED** | — | — | Z10-10 | Rohan's latest check-in is Scheduled, not reviewed. |
| `51-trainer-mobile-more-ios.png` | **CLOSE** | `51-trainer-mobile-more-ios-393x852.png` | 12.9% (likely gap) | Z10-12/Z11-14 | Recaptured after #420. Steps row absent; web shows push off. |
| `52-trainer-mobile-notification-settings-ios.png` | **CLOSE** | `52-trainer-mobile-notification-settings-ios-393x852.png` | 16.3% (likely gap) | Z10-12 | Web shows the push-off card above categories. |
| `53-trainer-mobile-more-permission-off-ios.png` | **CLOSE** | `51-trainer-mobile-more-ios-393x852.png` | 12.9% (likely gap) | Z10-12 | Shown in the 51 capture (web has no push permission). |
| `54-trainer-mobile-permission-prompt-android.png` | **NOT AUDITED** | — | — | Z10-12 | OS dialog. |
| `55-trainer-mobile-profile-ios.png` | **CLOSE** | `55-trainer-mobile-profile-ios-393x852.png` | 8.2% (check by eye) | Z10-13 | WhatsApp shown as raw "+919000000001". |
| `56-trainer-mobile-help-sheet-ios.png` | **NOT AUDITED** | — | — | Z10-13 | Help sheet did not open on Expo web. |
| `57-trainer-mobile-signout-confirm-ios.png` | **NOT AUDITED** | — | — | Z10-13 | Sign out row not tapped by the script. |
| `58-trainer-mobile-more-offline-ios.png` | **CLOSE** | `58-trainer-mobile-more-offline-ios-393x852.png` | 21.9% (likely gap) | Z10-12 | Banner + "Couldn't save. Try again." match. |
| `59-trainer-mobile-role-select-ios.png` | **MATCH** | `59-trainer-mobile-role-select-ios-393x852.png` | 11.9% (check by eye) | Z10-14/Z11-14 | Recaptured after #420. |
| `60-trainer-mobile-unsupported-role-ios.png` | **NOT AUDITED** | — | — | Z10-14 | No seed account with an unsupported role. |
| `61-trainer-mobile-switch-role-sheet-ios.png` | **NOT AUDITED** | — | — | Z10-14/Z11-14 | After #420: a cold /go/checkin link in client view showed the role select again on Expo web. |
| `ds5-ios-trainer-more-legal.png` | **CLOSE** | `ds5-ios-trainer-more-legal-393x852.png` | 13.6% (likely gap) | BT3d |  |
| `DS8-d2-log-form-date-limit-ios.png` | **CLOSE** | `DS8-d2-log-form-date-limit-ios-393x852.png` | 7.1% (check by eye) | Z10-16 | "Nothing planned · Choose a workout" (also the a2 state per Z10-16); no 7-day info strip. |
| `DS8-a1-start-pick-mode-ios.png` | **NOT AUDITED** | — | — | Z10-16 | Used without mode choice (Z10-16); Choose a workout list not opened. |
| `DS8-a2-start-empty-ios.png` | **CLOSE** | `DS8-d2-log-form-date-limit-ios-393x852.png` | 7.1% (check by eye) | Z10-16 | See d2. |
| `DS8-d1-log-form-ios.png` | **NOT AUDITED** | — | — | Z10-16 | Today was a rest day for Rohan; prefilled form not shown. |
| `DS8-d3-log-form-saving-ios.png` | **NOT AUDITED** | — | — | Z10-16 | Transient. |
| `DS8-d4-log-form-not-saved-ios.png` | **NOT AUDITED** | — | — | Z10-16 | Needs a failed save. |
| `DS8-d5-log-form-ended-ios.png` | **NOT AUDITED** | — | — | Z10-16 | Ended client path not opened. |
| `DS8-w9-trainee-coach-logged-ios.png` | **NOT AUDITED** | — | — | Z9-11 | No coach-logged workout visible for the persona tried. |
| `ds5-ios-privacy.png` | **NOT AUDITED** | — | — | BT3d | Opens the system browser. |
| `ds5-ios-terms.png` | **NOT AUDITED** | — | — | BT3d | Opens the system browser. |
| `ds5-ios-credits.png` | **NOT AUDITED** | — | — | BT3d | Opens the system browser. |

Totals (frames only): 17 MATCH, 75 CLOSE, 13 GAP, 46 not audited. The "(no frame)" row is a finding outside the frame set and is not counted.

## Gaps (file:line on main 21d76f8)

- `193-ipad-exception-drawer-ipad-portrait.png` → new: At 768 the shell keeps the icon rail (frame hamburger top bar); drawer has no "1 of 11" pager with up/down arrows. `apps/trainer-web/src/layout/AppShell.tsx:339`
- `210-trainer-web-client-basic-edit-v3-web.png` → new: Edit basic details has only Name and Phone · WhatsApp; frame also has Email, Date of birth, Sex, Height, City and Time zone. `apps/trainer-web/src/pages/client-settings/EditBasicsDrawer.tsx:217`
- `180-trainer-web-reactivate-web.png` → new: Dialog sends a reactivation request with an "update her intake" checkbox; frame offers "Start from her last plan (as a new draft)" or "Start fresh (pick a template)" + Reactivate. `apps/trainer-web/src/components/coaching/CoachingLifecycleModals.tsx:165`
- `171-trainer-web-checkin-form-builder-v3-web.png` → new: No standard-questions block with Charted chips and no middle editor panel; inline editors per question. Seed scale label "100 %" shows in the preview (percentage, apps/api/src/seed/demo/generator/templates/forms.ts:100). `apps/trainer-web/src/pages/templates/CheckinTemplateBuilderPage.tsx:869`
- `171b-trainer-web-checkin-form-measure-picker-v3-web.png` → new: No measurements picker (checkbox list with One/Left & right); measurements are own-question rows. `apps/trainer-web/src/pages/templates/CheckinTemplateBuilderPage.tsx:873`
- `(no frame) trainee Today, coaching ready with no plan` → new: The check-in card on Today catches the ensureDueCheckin failure and shows the API text "An active coaching configuration is required to schedule check-ins." in a red ErrorBanner (design review: banned string `active coaching`). TodayCheckinCard is rendered at apps/mobile/src/trainee/TodayTab.tsx:1114; the catch is at CheckinScreen.tsx:1270 and the banner at :1304. `apps/mobile/src/trainee/CheckinScreen.tsx:1304`
- `101-trainee-checkin-reviewed-ios.png` → new: Reviewed check-in shows an "Acknowledged" card, note and "What you sent"; no green "Rahul reviewed your check-in · date" banner or "From Rahul" note card with avatar. `apps/mobile/src/trainee/CheckinScreen.tsx:92`
- `14c-trainee-check-in-measure-entry-v3-ios.png` → new: Measurement entry is an inline text field; frame has the custom keypad sheet with ‹ › Done bar and four rows with "Last:" hints. `apps/mobile/src/trainee/checkin/MeasureRow.tsx:114`
- `31-trainer-mobile-review-sheet-v3-resolved-ios.png` → new: Resolved/Undo state cannot be reached: the sheet's "Resolve…" calls `onResolve`, which AttentionTab never passes. `apps/mobile/src/trainer/ReviewSheet.tsx:382`
- `31-trainer-mobile-review-sheet-v3-all-resolved-ios.png` → new: Same cause as the resolved state (no Resolve wiring in AttentionTab's ReviewSheet). `apps/mobile/src/trainer/AttentionTab.tsx:792`
- `33-trainer-mobile-exception-resolve-sheet-ios.png` → new: Tapping "Resolve…" on the v3 review sheet does nothing (no onResolve), so the resolve sheet with outcome chips never opens from Needs you. `apps/mobile/src/trainer/AttentionTab.tsx:792`
- `34-trainer-mobile-exception-nudge-sheet-ios.png` → new: "Nudge…" opens WhatsApp directly with "Hi Rohan, " and a toast; no nudge sheet with the message preview. `apps/mobile/src/trainer/AttentionTab.tsx:485`
- `35-trainer-mobile-exception-more-sheet-ios.png` → new: The v3 review sheet has no ⋯ (Add note, Message on WhatsApp); ⋯ exists only on the legacy exception screen. `apps/mobile/src/trainer/ExceptionReviewScreen.tsx:277`
- `36-trainer-mobile-note-composer-sheet-ios.png` → new: Follows 35: no way to open the note sheet from the v3 review sheet. `apps/mobile/src/trainer/ReviewSheet.tsx:379`

## Not built or not app screens (not audited)

| Frames | Reason |
|---|---|
| 27-trainee-lock-live-activity-ios.png, 27b-…, 27c-…, 27-android-trainee-workout-notif.png, 27-android-rest.png | Live Activity / ongoing notification: native surfaces, not on Expo web. |
| 28-trainee-lock-meal-push-ios.png, 30-trainee-lock-coach-ios.png, 105–112, 116–122, 124 (notif-*) | OS lock screen, shade and banner renderings of pushes; not app screens. |
| 200-trainer-web-calendar-v3-web.png, 201–207, 203, 204, IP-05, IP-09, IP-11–IP-14, IP-16, DS6-*, DS8-b*, DS8-c* | Phase 10 sessions/calendar and live logging: parked (W14, PLAN-v2 D-P2-21). |
| IP-03, IP-04, IP-06, IP-10, 149-trainer-web-configure-active-ref-web.png | Reference frames, out of MVP scope. |
