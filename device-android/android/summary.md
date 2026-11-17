### Device gate · android · FAIL

- light: 1 of 7 flows failed
- dark: 1 of 7 flows failed

Flows (7): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-40/1-day-moves.yaml`, `device/z12-44/1-workout-tab.yaml`, `device/z12-44/2-finish-workout.yaml`, `device/z12-44/3-no-plan.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 7 | 6 | 1 | 1 |
| dark | 7 | 6 | 1 | 1 |

<details><summary>Failed flows</summary>

- light · Z12-44 Workout tab, no plan yet (TR-10b): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible
- dark · Z12-44 Workout tab, no plan yet (TR-10b): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 71 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.887 (19), dark 0.556 (18)
