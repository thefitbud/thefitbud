### Device gate · android · FAIL

- light: 1 of 3 flows failed
- dark: 1 of 3 flows failed

Flows (3): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F28-settings-inperson-signout.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 3 | 2 | 1 | 1 |
| dark | 3 | 2 | 1 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- light · Launch smoke, trainee Today loads: Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- dark · Launch smoke, trainee Today loads: Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 10s (0 drop(s) seen); theme light: steady for 8 checks after 9s (0 drop(s) seen); retry (light): steady for 8 checks after 7s (0 drop(s) seen); theme dark: steady for 8 checks after 7s (0 drop(s) seen); retry (dark): steady for 8 checks after 7s (0 drop(s) seen)
- build: cache-hit in 68 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 730 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.927 (3), dark 0.386 (3)
