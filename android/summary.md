### Device gate · android · PASS

Flows (1): `flows/v3/F13-notifications-deep-links.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 1 | 1 | 0 | 0 |
| dark | 1 | 1 | 0 | 0 |

**Infra retries:** none

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 10s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); theme dark: steady for 8 checks after 8s (0 drop(s) seen)
- build: cache-hit in 72 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 730 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.932 (3), dark 0.072 (3)
