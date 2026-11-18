### Device gate · android · FAIL

- light: 1 of 8 flows failed
- dark: 1 of 8 flows failed

Flows (8): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F01-first-install.yaml`, `flows/v3/F02-sign-in.yaml`, `flows/v3/F02b-auth-errors.yaml`, `flows/v3/F15-settings-account.yaml`, `flows/v3/F16-expiry-errors-ended.yaml`, `flows/v3/F17-role-switch.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 8 | 7 | 1 | 1 |
| dark | 8 | 7 | 1 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- light · F01 Onboarding states, intake and waiting for the coach (Z12-49): Assertion is false: "Your plan will be here as soon as it's ready\." is visible (not retried: not an infrastructure failure)
- dark · F01 Onboarding states, intake and waiting for the coach (Z12-49): Assertion is false: "Your plan will be here as soon as it's ready\." is visible (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 11s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); retry (light): steady for 8 checks after 8s (0 drop(s) seen); theme dark: steady for 8 checks after 8s (0 drop(s) seen); retry (dark): steady for 8 checks after 7s (0 drop(s) seen)
- build: cache-hit in 71 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.892 (27), dark 0.18 (27)
