### Device gate · android · FAIL

- light: no JUnit report (Maestro did not finish)
- dark: no JUnit report (Maestro did not finish)

Flows (3): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F20-triage-nudge.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 0 | 0 | 0 | 1 |
| dark | 0 | 0 | 0 | 1 |

**Device log:** clean

**Evidence (not part of the verdict):**

- build: full in 321 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: opened-app — tapped at 911 1971 twice; com.thefitbud.mobile.staging has the window focus
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light — (0), dark — (0)
