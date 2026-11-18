### Device gate · android · FAIL

- light: 1 of 5 flows failed
- dark: 1 of 5 flows failed

Flows (5): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-46/1-no-plan.yaml`, `flows/v3/F11-weekly-checkin.yaml`, `flows/v3/F12-progress-weight.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 4 | 1 | 1 |
| dark | 5 | 4 | 1 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- light · Launch smoke, trainee Today loads: Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- dark · F11 Weekly check-in, sent, and a reviewed one (Z12-46): No visible element found: "Start|Check-in sent" (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 9s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); retry (light): steady for 8 checks after 7s (0 drop(s) seen); theme dark: steady for 8 checks after 8s (0 drop(s) seen); retry (dark): steady for 8 checks after 7s (0 drop(s) seen)
- build: cache-hit in 57 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.862 (12), dark 0.219 (8)
