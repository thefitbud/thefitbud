# Design review: redesign

Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. Under 3% normally matches; 3-12% check by eye; over 12% likely a gap. How to read it: docs/runbooks/design-review.md.

Screens: 115 compared or paired, 5 with design-guide findings, 0 unmapped.

| Screen | Frame | Diff | Side by side | Design-guide findings |
|---|---|---|---|---|
| DS3-activate-dialog-web-1440x900.png | `DS3-activate-dialog-web.png` | 70.5% (likely gap) | `docs/qa/redesign/design-review/DS3-activate-dialog-web-1440x900.png` | none |
| 40-trainer-mobile-exception-offline-ios-393x852.png | `40-trainer-mobile-exception-offline-ios.png` | 53.7% (likely gap) | `docs/qa/redesign/design-review/40-trainer-mobile-exception-offline-ios-393x852.png` | none |
| 31-trainer-mobile-review-sheet-v3-item2-ios-393x852.png | `31-trainer-mobile-review-sheet-v3-item2-ios.png` | 50.6% (likely gap) | `docs/qa/redesign/design-review/31-trainer-mobile-review-sheet-v3-item2-ios-393x852.png` | none |
| 31-trainer-mobile-review-sheet-v3-ios-393x852.png | `31-trainer-mobile-review-sheet-v3-ios.png` | 48.7% (likely gap) | `docs/qa/redesign/design-review/31-trainer-mobile-review-sheet-v3-ios-393x852.png` | none |
| ds5-web-signin-footer-1440x900.png | `ds5-web-signin-footer.png` | 42.8% (likely gap) | `docs/qa/redesign/design-review/ds5-web-signin-footer-1440x900.png` | none |
| 29-trainee-inapp-meal-v3-ios-393x852.png | `29-trainee-inapp-meal-v3-ios.png` | 41.3% (likely gap) | `docs/qa/redesign/design-review/29-trainee-inapp-meal-v3-ios-393x852.png` | none |
| 113-notif-checkin-reviewed-banner-v3-ios-393x852.png | `113-notif-checkin-reviewed-banner-v3-ios.png` | 39.8% (likely gap) | `docs/qa/redesign/design-review/113-notif-checkin-reviewed-banner-v3-ios-393x852.png` | none |
| ds5-ios-signin-footer-393x852.png | `ds5-ios-signin-footer.png` | 39.6% (likely gap) | `docs/qa/redesign/design-review/ds5-ios-signin-footer-393x852.png` | Banned string (hex8-fragment): `3ba526ca` |
| 04-trainee-today-ios-v3-done-393x852.png | `04-trainee-today-ios-v3-done.png` | 39.3% (likely gap) | `docs/qa/redesign/design-review/04-trainee-today-ios-v3-done-393x852.png` | none |
| 29-trainee-inapp-meal-v3-ios--android-412x915.png | `29-trainee-inapp-meal-v3-ios.png` | 37.0% (likely gap), paired by number prefix | `docs/qa/redesign/design-review/29-trainee-inapp-meal-v3-ios--android-412x915.png` | none |
| 04-trainee-today-android-v3-done-412x915.png | `04-trainee-today-android-v3-done.png` | 36.5% (likely gap) | `docs/qa/redesign/design-review/04-trainee-today-android-v3-done-412x915.png` | none |
| 04-trainee-today-android-v3-partial-412x915.png | `04-trainee-today-android-v3-partial.png` | 36.5% (likely gap) | `docs/qa/redesign/design-review/04-trainee-today-android-v3-partial-412x915.png` | none |
| 10-trainee-workout-overview-ios-393x852.png | `10-trainee-workout-overview-ios.png` | 35.5% (likely gap) | `docs/qa/redesign/design-review/10-trainee-workout-overview-ios-393x852.png` | none |
| 115-notif-paused-today-v3-ios-393x852.png | `115-notif-paused-today-v3-ios.png` | 34.0% (likely gap) | `docs/qa/redesign/design-review/115-notif-paused-today-v3-ios-393x852.png` | none |
| 104-trainee-today-offline-v3-android-412x915.png | `104-trainee-today-offline-v3-android.png` | 33.6% (likely gap) | `docs/qa/redesign/design-review/104-trainee-today-offline-v3-android-412x915.png` | none |
| 160f-trainer-web-progress-photos-v3-web-1440x900.png | `160f-trainer-web-progress-photos-v3-web.png` | 33.3% (likely gap) | `docs/qa/redesign/design-review/160f-trainer-web-progress-photos-v3-web-1440x900.png` | none |
| 04-trainee-today-ios-v3-partial-393x852.png | `04-trainee-today-ios-v3-partial.png` | 30.4% (likely gap) | `docs/qa/redesign/design-review/04-trainee-today-ios-v3-partial-393x852.png` | none |
| 180-trainer-web-reactivate-web-1440x900.png | `180-trainer-web-reactivate-web.png` | 29.9% (likely gap) | `docs/qa/redesign/design-review/180-trainer-web-reactivate-web-1440x900.png` | none |
| 04-trainee-today-android-v3-rest-412x915.png | `04-trainee-today-android-v3-rest.png` | 29.4% (likely gap) | `docs/qa/redesign/design-review/04-trainee-today-android-v3-rest-412x915.png` | none |
| 178-trainer-web-end-coaching-web-1440x900.png | `178-trainer-web-end-coaching-web.png` | 29.0% (likely gap) | `docs/qa/redesign/design-review/178-trainer-web-end-coaching-web-1440x900.png` | none |
| 11b-trainee-active-workout-rest-v3-ios-393x852.png | `11b-trainee-active-workout-rest-v3-ios.png` | 28.0% (likely gap) | `docs/qa/redesign/design-review/11b-trainee-active-workout-rest-v3-ios-393x852.png` | none |
| 160e-trainer-web-progress-workouts-v3-web-1440x900.png | `160e-trainer-web-progress-workouts-v3-web.png` | 27.8% (likely gap) | `docs/qa/redesign/design-review/160e-trainer-web-progress-workouts-v3-web-1440x900.png` | none |
| 04-trainee-today-ios-v3-empty-393x852.png | `04-trainee-today-ios-v3-empty.png` | 27.4% (likely gap) | `docs/qa/redesign/design-review/04-trainee-today-ios-v3-empty-393x852.png` | Banned string (active-coaching): `active coaching` |
| 123-notif-bell-web-1440x900.png | `123-notif-bell-web.png` | 27.0% (likely gap) | `docs/qa/redesign/design-review/123-notif-bell-web-1440x900.png` | none |
| DS2-bulk-select-web-1440x900.png | `DS2-bulk-select-web.png` | 26.7% (likely gap) | `docs/qa/redesign/design-review/DS2-bulk-select-web-1440x900.png` | none |
| 150-trainer-web-plan-v3-web-1440x900.png | `150-trainer-web-plan-v3-web.png` | 25.9% (likely gap) | `docs/qa/redesign/design-review/150-trainer-web-plan-v3-web-1440x900.png` | none |
| 04-trainee-today-android-v3-empty-412x915.png | `04-trainee-today-android-v3-empty.png` | 25.8% (likely gap) | `docs/qa/redesign/design-review/04-trainee-today-android-v3-empty-412x915.png` | Banned string (active-coaching): `active coaching` |
| 02-trainer-web-home-panel-v3-resolve-web-1440x900.png | `02-trainer-web-home-panel-v3-resolve-web.png` | 25.8% (likely gap) | `docs/qa/redesign/design-review/02-trainer-web-home-panel-v3-resolve-web-1440x900.png` | none |
| 136-trainer-web-clients-web-1440x900.png | `136-trainer-web-clients-web.png` | 25.7% (likely gap) | `docs/qa/redesign/design-review/136-trainer-web-clients-web-1440x900.png` | none |
| 02-trainer-web-home-panel-v3-web-1440x900.png | `02-trainer-web-home-panel-v3-web.png` | 25.6% (likely gap) | `docs/qa/redesign/design-review/02-trainer-web-home-panel-v3-web-1440x900.png` | none |
| 11c-trainee-active-workout-bodyweight-v3-ios-393x852.png | `11c-trainee-active-workout-bodyweight-v3-ios.png` | 25.6% (likely gap) | `docs/qa/redesign/design-review/11c-trainee-active-workout-bodyweight-v3-ios-393x852.png` | none |
| 132-trainer-web-home-panel-v3-resolved-readonly-web-1440x900.png | `132-trainer-web-home-panel-v3-resolved-readonly-web.png` | 24.9% (likely gap) | `docs/qa/redesign/design-review/132-trainer-web-home-panel-v3-resolved-readonly-web-1440x900.png` | none |
| 132-trainer-web-home-panel-v3-resolved-readonly-web--reviewed-1440x900.png | `132-trainer-web-home-panel-v3-resolved-readonly-web.png` | 24.9% (likely gap), paired by number prefix | `docs/qa/redesign/design-review/132-trainer-web-home-panel-v3-resolved-readonly-web--reviewed-1440x900.png` | none |
| 160d-trainer-web-progress-compare-v3-web-1440x900.png | `160d-trainer-web-progress-compare-v3-web.png` | 24.8% (likely gap) | `docs/qa/redesign/design-review/160d-trainer-web-progress-compare-v3-web-1440x900.png` | none |
| 208-trainer-web-client-menu-v3-web-1440x900.png | `208-trainer-web-client-menu-v3-web.png` | 24.8% (likely gap) | `docs/qa/redesign/design-review/208-trainer-web-client-menu-v3-web-1440x900.png` | none |
| 181-trainer-web-reminders-panel-v3-web-1440x900.png | `181-trainer-web-reminders-panel-v3-web.png` | 24.8% (likely gap) | `docs/qa/redesign/design-review/181-trainer-web-reminders-panel-v3-web-1440x900.png` | none |
| 11-trainee-active-workout-v3-ios--weighted-393x852.png | `11-trainee-active-workout-v3-ios.png` | 24.7% (likely gap), paired by number prefix | `docs/qa/redesign/design-review/11-trainee-active-workout-v3-ios--weighted-393x852.png` | none |
| DS4-home-row-card-web-1440x900.png | `DS4-home-row-card-web.png` | 24.6% (likely gap) | `docs/qa/redesign/design-review/DS4-home-row-card-web-1440x900.png` | none |
| IP-08-trainer-web-client-settings-package-v3-web-1440x900.png | `IP-08-trainer-web-client-settings-package-v3-web.png` | 24.5% (likely gap) | `docs/qa/redesign/design-review/IP-08-trainer-web-client-settings-package-v3-web-1440x900.png` | none |
| IP-07-trainer-web-coaching-setup-mode-v3-web-1440x900.png | `IP-07-trainer-web-coaching-setup-mode-v3-web.png` | 24.3% (likely gap) | `docs/qa/redesign/design-review/IP-07-trainer-web-coaching-setup-mode-v3-web-1440x900.png` | none |
| 149-trainer-web-configure-active-v3-web-1440x900.png | `149-trainer-web-configure-active-v3-web.png` | 24.3% (likely gap) | `docs/qa/redesign/design-review/149-trainer-web-configure-active-v3-web-1440x900.png` | none |
| 11-trainee-active-workout-v3-ios-393x852.png | `11-trainee-active-workout-v3-ios.png` | 24.2% (likely gap) | `docs/qa/redesign/design-review/11-trainee-active-workout-v3-ios-393x852.png` | none |
| 14c-trainee-check-in-measure-entry-v3-ios-393x852.png | `14c-trainee-check-in-measure-entry-v3-ios.png` | 24.0% (likely gap) | `docs/qa/redesign/design-review/14c-trainee-check-in-measure-entry-v3-ios-393x852.png` | none |
| 209-trainer-web-client-settings-v3-web-1440x900.png | `209-trainer-web-client-settings-v3-web.png` | 23.9% (likely gap) | `docs/qa/redesign/design-review/209-trainer-web-client-settings-v3-web-1440x900.png` | none |
| 148-trainer-web-configure-v3-web-1440x900.png | `148-trainer-web-configure-v3-web.png` | 23.8% (likely gap) | `docs/qa/redesign/design-review/148-trainer-web-configure-v3-web-1440x900.png` | none |
| 160-trainer-web-progress-v3-web-1440x900.png | `160-trainer-web-progress-v3-web.png` | 23.7% (likely gap) | `docs/qa/redesign/design-review/160-trainer-web-progress-v3-web-1440x900.png` | none |
| 133-trainer-web-home-panel-v3-not-found-web-1440x900.png | `133-trainer-web-home-panel-v3-not-found-web.png` | 23.6% (likely gap) | `docs/qa/redesign/design-review/133-trainer-web-home-panel-v3-not-found-web-1440x900.png` | none |
| 211-trainer-web-client-subscription-edit-v3-web-1440x900.png | `211-trainer-web-client-subscription-edit-v3-web.png` | 23.6% (likely gap) | `docs/qa/redesign/design-review/211-trainer-web-client-subscription-edit-v3-web-1440x900.png` | none |
| 160c-trainer-web-progress-measurements-v3-web-1440x900.png | `160c-trainer-web-progress-measurements-v3-web.png` | 23.4% (likely gap) | `docs/qa/redesign/design-review/160c-trainer-web-progress-measurements-v3-web-1440x900.png` | none |
| 03c-trainer-web-client-overview-reminders-v3-web-1440x900.png | `03c-trainer-web-client-overview-reminders-v3-web.png` | 23.4% (likely gap) | `docs/qa/redesign/design-review/03c-trainer-web-client-overview-reminders-v3-web-1440x900.png` | none |
| DS1-home-attention-web-1440x900.png | `DS1-home-attention-web.png` | 22.7% (likely gap) | `docs/qa/redesign/design-review/DS1-home-attention-web-1440x900.png` | none |
| DS1-home-renewals-web-1440x900.png | `DS1-home-renewals-web.png` | 22.1% (likely gap) | `docs/qa/redesign/design-review/DS1-home-renewals-web-1440x900.png` | none |
| 58-trainer-mobile-more-offline-ios-393x852.png | `58-trainer-mobile-more-offline-ios.png` | 21.9% (likely gap) | `docs/qa/redesign/design-review/58-trainer-mobile-more-offline-ios-393x852.png` | none |
| 166-trainer-web-checkins-inbox-web-1440x900.png | `166-trainer-web-checkins-inbox-web.png` | 21.5% (likely gap) | `docs/qa/redesign/design-review/166-trainer-web-checkins-inbox-web-1440x900.png` | none |
| 14-trainee-check-in-v3-ios-393x852.png | `14-trainee-check-in-v3-ios.png` | 21.1% (likely gap) | `docs/qa/redesign/design-review/14-trainee-check-in-v3-ios-393x852.png` | none |
| 07-trainee-diet-ios-393x852.png | `07-trainee-diet-ios.png` | 20.9% (likely gap) | `docs/qa/redesign/design-review/07-trainee-diet-ios-393x852.png` | none |
| 193-ipad-exception-drawer-ipad-portrait-768x1024.png | `193-ipad-exception-drawer-ipad-portrait.png` | 20.9% (likely gap) | `docs/qa/redesign/design-review/193-ipad-exception-drawer-ipad-portrait-768x1024.png` | none |
| 210-trainer-web-client-basic-edit-v3-web-1440x900.png | `210-trainer-web-client-basic-edit-v3-web.png` | 20.6% (likely gap) | `docs/qa/redesign/design-review/210-trainer-web-client-basic-edit-v3-web-1440x900.png` | none |
| 44-trainer-mobile-attention-offline-ios-393x852.png | `44-trainer-mobile-attention-offline-ios.png` | 20.6% (likely gap) | `docs/qa/redesign/design-review/44-trainer-mobile-attention-offline-ios-393x852.png` | none |
| 191-ipad-home-ipad-1024x768.png | `191-ipad-home-ipad.png` | 19.9% (likely gap) | `docs/qa/redesign/design-review/191-ipad-home-ipad-1024x768.png` | none |
| 04-trainee-today-ios-v3-past-393x852.png | `04-trainee-today-ios-v3-past.png` | 19.9% (likely gap) | `docs/qa/redesign/design-review/04-trainee-today-ios-v3-past-393x852.png` | none |
| 208b-ipad-client-menu-v3-ipad-1024x768.png | `208b-ipad-client-menu-v3-ipad.png` | 19.3% (likely gap) | `docs/qa/redesign/design-review/208b-ipad-client-menu-v3-ipad-1024x768.png` | none |
| 18-trainer-mobile-client-status-ios-393x852.png | `18-trainer-mobile-client-status-ios.png` | 18.6% (likely gap) | `docs/qa/redesign/design-review/18-trainer-mobile-client-status-ios-393x852.png` | none |
| DS4-home-row-card-ipad-1024x768.png | `DS4-home-row-card-ipad.png` | 18.4% (likely gap) | `docs/qa/redesign/design-review/DS4-home-row-card-ipad-1024x768.png` | none |
| 17-trainer-mobile-clients-ios-393x852.png | `17-trainer-mobile-clients-ios.png` | 18.0% (likely gap) | `docs/qa/redesign/design-review/17-trainer-mobile-clients-ios-393x852.png` | none |
| 52-trainer-mobile-notification-settings-ios-393x852.png | `52-trainer-mobile-notification-settings-ios.png` | 16.3% (likely gap) | `docs/qa/redesign/design-review/52-trainer-mobile-notification-settings-ios-393x852.png` | none |
| 86-trainee-diet-offline-ios-393x852.png | `86-trainee-diet-offline-ios.png` | 15.8% (likely gap) | `docs/qa/redesign/design-review/86-trainee-diet-offline-ios-393x852.png` | none |
| 04-trainee-today-android-v3-past-412x915.png | `04-trainee-today-android-v3-past.png` | 15.2% (likely gap) | `docs/qa/redesign/design-review/04-trainee-today-android-v3-past-412x915.png` | none |
| 05-trainer-mobile-needs-you-v3-ios-393x852.png | `05-trainer-mobile-needs-you-v3-ios.png` | 15.1% (likely gap) | `docs/qa/redesign/design-review/05-trainer-mobile-needs-you-v3-ios-393x852.png` | none |
| 171b-trainer-web-checkin-form-measure-picker-v3-web-1440x900.png | `171b-trainer-web-checkin-form-measure-picker-v3-web.png` | 14.8% (likely gap) | `docs/qa/redesign/design-review/171b-trainer-web-checkin-form-measure-picker-v3-web-1440x900.png` | Percentage: `100 %` |
| 18-trainer-mobile-client-status-ios--rohan-393x852.png | `18-trainer-mobile-client-status-ios.png` | 14.6% (likely gap), paired by number prefix | `docs/qa/redesign/design-review/18-trainer-mobile-client-status-ios--rohan-393x852.png` | none |
| 171-trainer-web-checkin-form-builder-v3-web-1440x900.png | `171-trainer-web-checkin-form-builder-v3-web.png` | 14.2% (likely gap) | `docs/qa/redesign/design-review/171-trainer-web-checkin-form-builder-v3-web-1440x900.png` | Percentage: `100 %` |
| ds5-ios-trainer-more-legal-393x852.png | `ds5-ios-trainer-more-legal.png` | 13.6% (likely gap) | `docs/qa/redesign/design-review/ds5-ios-trainer-more-legal-393x852.png` | none |
| 101-trainee-checkin-reviewed-ios-393x852.png | `101-trainee-checkin-reviewed-ios.png` | 13.2% (likely gap) | `docs/qa/redesign/design-review/101-trainee-checkin-reviewed-ios-393x852.png` | none |
| 73-trainer-mobile-clients-ended-ios-393x852.png | `73-trainer-mobile-clients-ended-ios.png` | 13.2% (likely gap) | `docs/qa/redesign/design-review/73-trainer-mobile-clients-ended-ios-393x852.png` | none |
| 192b-ipad-client-checkins-v3-ipad-1024x768.png | `192b-ipad-client-checkins-v3-ipad.png` | 12.9% (likely gap) | `docs/qa/redesign/design-review/192b-ipad-client-checkins-v3-ipad-1024x768.png` | none |
| 51-trainer-mobile-more-ios-393x852.png | `51-trainer-mobile-more-ios.png` | 12.9% (likely gap) | `docs/qa/redesign/design-review/51-trainer-mobile-more-ios-393x852.png` | none |
| 74-trainer-mobile-client-ended-ios-393x852.png | `74-trainer-mobile-client-ended-ios.png` | 12.8% (likely gap) | `docs/qa/redesign/design-review/74-trainer-mobile-client-ended-ios-393x852.png` | none |
| 93-trainee-steps-setup-ios-393x852.png | `93-trainee-steps-setup-ios.png` | 12.6% (likely gap) | `docs/qa/redesign/design-review/93-trainee-steps-setup-ios-393x852.png` | none |
| ds5-ios-more-legal-393x852.png | `ds5-ios-more-legal.png` | 12.6% (likely gap) | `docs/qa/redesign/design-review/ds5-ios-more-legal-393x852.png` | none |
| 19-trainer-mobile-check-in-review-ios-393x852.png | `19-trainer-mobile-check-in-review-ios.png` | 12.5% (likely gap) | `docs/qa/redesign/design-review/19-trainer-mobile-check-in-review-ios-393x852.png` | none |
| 59-trainer-mobile-role-select-ios-393x852.png | `59-trainer-mobile-role-select-ios.png` | 11.9% (check by eye) | `docs/qa/redesign/design-review/59-trainer-mobile-role-select-ios-393x852.png` | none |
| 46-trainer-mobile-checkins-to-review-ios-393x852.png | `46-trainer-mobile-checkins-to-review-ios.png` | 11.6% (check by eye) | `docs/qa/redesign/design-review/46-trainer-mobile-checkins-to-review-ios-393x852.png` | none |
| 162-trainer-web-client-checkins-v3-web-1440x900.png | `162-trainer-web-client-checkins-v3-web.png` | 10.5% (check by eye) | `docs/qa/redesign/design-review/162-trainer-web-client-checkins-v3-web-1440x900.png` | none |
| 209b-ipad-client-settings-v3-ipad-1024x768.png | `209b-ipad-client-settings-v3-ipad.png` | 10.4% (check by eye) | `docs/qa/redesign/design-review/209b-ipad-client-settings-v3-ipad-1024x768.png` | none |
| 50-trainer-mobile-checkins-android-412x915.png | `50-trainer-mobile-checkins-android.png` | 10.3% (check by eye) | `docs/qa/redesign/design-review/50-trainer-mobile-checkins-android-412x915.png` | none |
| 212-trainer-web-client-settings-ended-v3-web-1440x900.png | `212-trainer-web-client-settings-ended-v3-web.png` | 9.5% (check by eye) | `docs/qa/redesign/design-review/212-trainer-web-client-settings-ended-v3-web-1440x900.png` | none |
| 96-trainee-today-loading-v3-ios-393x852.png | `96-trainee-today-loading-v3-ios.png` | 9.3% (check by eye) | `docs/qa/redesign/design-review/96-trainee-today-loading-v3-ios-393x852.png` | none |
| 149-trainer-web-configure-active-v3-web--expectations-1440x900.png | `149-trainer-web-configure-active-v3-web.png` | 9.2% (check by eye), paired by number prefix, 2 candidate frames | `docs/qa/redesign/design-review/149-trainer-web-configure-active-v3-web--expectations-1440x900.png` | none |
| 47-trainer-mobile-checkins-overdue-ios-393x852.png | `47-trainer-mobile-checkins-overdue-ios.png` | 9.1% (check by eye) | `docs/qa/redesign/design-review/47-trainer-mobile-checkins-overdue-ios-393x852.png` | none |
| 53-trainer-mobile-more-permission-off-ios-393x852.png | `53-trainer-mobile-more-permission-off-ios.png` | 9.1% (check by eye) | `docs/qa/redesign/design-review/53-trainer-mobile-more-permission-off-ios-393x852.png` | none |
| 161-trainer-web-progress-empty-v3-web-1440x900.png | `161-trainer-web-progress-empty-v3-web.png` | 8.6% (check by eye) | `docs/qa/redesign/design-review/161-trainer-web-progress-empty-v3-web-1440x900.png` | none |
| 160h-trainer-web-progress-ended-v3-web-1440x900.png | `160h-trainer-web-progress-ended-v3-web.png` | 8.6% (check by eye) | `docs/qa/redesign/design-review/160h-trainer-web-progress-ended-v3-web-1440x900.png` | none |
| 162c-trainer-web-client-checkins-ended-v3-web-1440x900.png | `162c-trainer-web-client-checkins-ended-v3-web.png` | 8.4% (check by eye) | `docs/qa/redesign/design-review/162c-trainer-web-client-checkins-ended-v3-web-1440x900.png` | none |
| 160g-trainer-web-progress-sparse-v3-web-1440x900.png | `160g-trainer-web-progress-sparse-v3-web.png` | 8.3% (check by eye) | `docs/qa/redesign/design-review/160g-trainer-web-progress-sparse-v3-web-1440x900.png` | none |
| 55-trainer-mobile-profile-ios-393x852.png | `55-trainer-mobile-profile-ios.png` | 8.2% (check by eye) | `docs/qa/redesign/design-review/55-trainer-mobile-profile-ios-393x852.png` | none |
| 45-trainer-mobile-attention-error-ios-393x852.png | `45-trainer-mobile-attention-error-ios.png` | 8.2% (check by eye) | `docs/qa/redesign/design-review/45-trainer-mobile-attention-error-ios-393x852.png` | none |
| 43-trainer-mobile-attention-empty-ios-393x852.png | `43-trainer-mobile-attention-empty-ios.png` | 8.2% (check by eye) | `docs/qa/redesign/design-review/43-trainer-mobile-attention-empty-ios-393x852.png` | none |
| DS7-readonly-fields-web-1440x900.png | `DS7-readonly-fields-web.png` | 7.9% (check by eye) | `docs/qa/redesign/design-review/DS7-readonly-fields-web-1440x900.png` | none |
| DS8-d2-log-form-date-limit-ios-393x852.png | `DS8-d2-log-form-date-limit-ios.png` | 7.1% (check by eye) | `docs/qa/redesign/design-review/DS8-d2-log-form-date-limit-ios-393x852.png` | none |
| 162b-trainer-web-client-checkins-empty-v3-web-1440x900.png | `162b-trainer-web-client-checkins-empty-v3-web.png` | 7.1% (check by eye) | `docs/qa/redesign/design-review/162b-trainer-web-client-checkins-empty-v3-web-1440x900.png` | none |
| 48-trainer-mobile-checkins-empty-ios-393x852.png | `48-trainer-mobile-checkins-empty-ios.png` | 6.9% (check by eye) | `docs/qa/redesign/design-review/48-trainer-mobile-checkins-empty-ios-393x852.png` | none |
| ds5-web-privacy-1440x900.png | `ds5-web-privacy.png` | 6.5% (check by eye) | `docs/qa/redesign/design-review/ds5-web-privacy-1440x900.png` | none |
| DS1-home-asks-web-1440x900.png | `DS1-home-asks-web.png` | 6.4% (check by eye) | `docs/qa/redesign/design-review/DS1-home-asks-web-1440x900.png` | none |
| ds5-web-terms-1440x900.png | `ds5-web-terms.png` | 6.1% (check by eye) | `docs/qa/redesign/design-review/ds5-web-terms-1440x900.png` | none |
| ds5-web-credits-1440x900.png | `ds5-web-credits.png` | 5.8% (check by eye) | `docs/qa/redesign/design-review/ds5-web-credits-1440x900.png` | none |
| 160i-trainer-web-progress-loading-v3-web-1440x900.png | `160i-trainer-web-progress-loading-v3-web.png` | 5.3% (check by eye) | `docs/qa/redesign/design-review/160i-trainer-web-progress-loading-v3-web-1440x900.png` | none |
| 49-trainer-mobile-checkins-loading-ios-393x852.png | `49-trainer-mobile-checkins-loading-ios.png` | 5.3% (check by eye) | `docs/qa/redesign/design-review/49-trainer-mobile-checkins-loading-ios-393x852.png` | none |
| 179-trainer-web-client-ended-web-1440x900.png | `179-trainer-web-client-ended-web.png` | 5.1% (check by eye) | `docs/qa/redesign/design-review/179-trainer-web-client-ended-web-1440x900.png` | none |
| 140-trainer-web-clients-ended-web-1440x900.png | `140-trainer-web-clients-ended-web.png` | 5.0% (check by eye) | `docs/qa/redesign/design-review/140-trainer-web-clients-ended-web-1440x900.png` | none |
| DS1-home-asks-empty-web-1440x900.png | `DS1-home-asks-empty-web.png` | 3.3% (check by eye) | `docs/qa/redesign/design-review/DS1-home-asks-empty-web-1440x900.png` | none |
| DS1-home-renewals-empty-web-1440x900.png | `DS1-home-renewals-empty-web.png` | 3.3% (check by eye) | `docs/qa/redesign/design-review/DS1-home-renewals-empty-web-1440x900.png` | none |
| DS1-home-attention-empty-web-1440x900.png | `DS1-home-attention-empty-web.png` | 3.3% (check by eye) | `docs/qa/redesign/design-review/DS1-home-attention-empty-web-1440x900.png` | none |
| 135-trainer-web-home-all-clear-web-1440x900.png | `135-trainer-web-home-all-clear-web.png` | 3.1% (check by eye) | `docs/qa/redesign/design-review/135-trainer-web-home-all-clear-web-1440x900.png` | none |
| 167-trainer-web-checkins-inbox-empty-web-1440x900.png | `167-trainer-web-checkins-inbox-empty-web.png` | 2.9% (matches) | `docs/qa/redesign/design-review/167-trainer-web-checkins-inbox-empty-web-1440x900.png` | none |

## Warnings

- no spec docs/specs/redesign.md: frames chosen from the whole frame folder by name prefix

