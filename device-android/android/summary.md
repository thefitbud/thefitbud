### Device gate · android · FAIL

- light: 1 of 6 flows failed
- dark: 1 of 6 flows failed

Flows (6): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-38/1-trainee-note-banner.yaml`, `device/z12-46/1-no-plan.yaml`, `flows/v3/F11-weekly-checkin.yaml`, `flows/v3/F12-progress-weight.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 6 | 5 | 1 | 1 |
| dark | 6 | 5 | 1 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- light · Z12-46 No-plan trainee, Today and Progress (calm states, no server text): Element not found: Text matching regex: Your coach's plan for today is waiting\. (not retried: not an infrastructure failure)
- dark · Z12-46 No-plan trainee, Today and Progress (calm states, no server text): Element not found: Text matching regex: Your coach's plan for today is waiting\. (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 9s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); retry (light): steady for 8 checks after 8s (0 drop(s) seen); theme dark: steady for 8 checks after 7s (0 drop(s) seen); retry (dark): steady for 8 checks after 7s (0 drop(s) seen)
- build: cache-hit in 43 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.845 (12), dark 0.222 (10)
