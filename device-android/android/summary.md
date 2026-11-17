### Device gate · android · PASS

Flows (7): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-40/1-day-moves.yaml`, `device/z12-44/1-workout-tab.yaml`, `device/z12-44/2-finish-workout.yaml`, `device/z12-44/3-no-plan.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 7 | 7 | 0 | 0 |
| dark | 7 | 7 | 0 | 0 |

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 46 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.885 (18), dark 0.489 (17)
