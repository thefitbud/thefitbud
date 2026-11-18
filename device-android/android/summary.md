### Device gate · android · FAIL

- dark: 1 of 4 flows failed

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `flows/v3/F21-review-resolve-notes.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 4 | 0 | 0 |
| dark | 4 | 3 | 1 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- dark · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Assertion is false: "Needs you [0-9]+" is visible (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 10s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); theme dark: steady for 8 checks after 8s (0 drop(s) seen); retry (dark): steady for 8 checks after 7s (0 drop(s) seen)
- build: cache-hit in 60 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.814 (14), dark 0.391 (12)
