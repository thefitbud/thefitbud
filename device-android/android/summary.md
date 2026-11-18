### Device gate · android · FAIL

- light: 2 of 8 flows failed
- dark: 1 of 8 flows failed

Flows (8): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F03-first-workout.yaml`, `flows/v3/F04-plan-deviation.yaml`, `flows/v3/F05-exercise-detail-rest.yaml`, `flows/v3/F06-interruptions.yaml`, `flows/v3/F06b-interruptions-offline.yaml`, `flows/v3/F06c-interruptions-end.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 8 | 6 | 2 | 1 |
| dark | 8 | 7 | 1 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- light · F04 Plan deviation (swipe to skip, Undo, edit a logged set, mark not done, exercise menu, skip exercise): Assertion is false: "Set [0-9]+ skipped" is visible (not retried: not an infrastructure failure)
- light · F05 Exercise detail and rest (How to, History, rest +15 / −15 / Skip, rest ended): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible (not retried: not an infrastructure failure)
- dark · F05 Exercise detail and rest (How to, History, rest +15 / −15 / Skip, rest ended): No visible element found: "Continue workout|Log workout|Start workout" (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 9s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); retry (light): steady for 8 checks after 8s (0 drop(s) seen); retry (light): steady for 8 checks after 7s (0 drop(s) seen); theme dark: steady for 8 checks after 7s (0 drop(s) seen); retry (dark): steady for 8 checks after 8s (0 drop(s) seen)
- build: cache-hit in 71 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.878 (19), dark 0.205 (24)
