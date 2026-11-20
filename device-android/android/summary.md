### Device gate · android · FAIL

- light: 4 of 6 flows failed
- dark: 4 of 6 flows failed

Flows (6): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-44/1-workout-tab.yaml`, `device/z12-44/2-finish-workout.yaml`, `device/z12-44/3-no-plan.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 6 | 2 | 4 | 1 |
| dark | 6 | 2 | 4 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- light · Launch smoke, trainee Today loads: Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- light · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- light · Z12-44 Workout tab v3 (done day, summary, future, rest, relaunch): Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- light · Z12-44 Finish a workout (in progress, relaunch, summary, View summary only): Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- dark · Launch smoke, trainee Today loads: Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- dark · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- dark · Z12-44 Workout tab v3 (done day, summary, future, rest, relaunch): Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- dark · Z12-44 Finish a workout (in progress, relaunch, summary, View summary only): Assertion is false: "Today's workout.*|This week|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 10s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); retry (light): steady for 8 checks after 7s (0 drop(s) seen); theme dark: steady for 8 checks after 7s (0 drop(s) seen); retry (dark): steady for 8 checks after 7s (0 drop(s) seen)
- build: cache-hit in 44 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 730 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.929 (4), dark 0.313 (4)
