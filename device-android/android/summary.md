### Device gate · android · FAIL

- light: 1 of 4 flows failed
- dark: 1 of 4 flows failed

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-38/1-trainee-note-banner.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 3 | 1 | 1 |
| dark | 4 | 3 | 1 | 1 |

<details><summary>Failed flows</summary>

- light · Z12-38 trainee in-app banner (TR-06h) leaves by itself, swipes away, opens on a tap: Assertion is false: "Rahul has a note for you.*" is not visible
- dark · Z12-38 trainee in-app banner (TR-06h) leaves by itself, swipes away, opens on a tap: Assertion is false: "Rahul has a note for you.*" is not visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 65 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.897 (6), dark 0.785 (6)
