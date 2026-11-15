### Device gate · android · FAIL

- dark: 1 of 5 flows failed

Flows (5): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F10-offline-sync.yaml`, `flows/v3/F10b-offline-sync-offline.yaml`, `flows/v3/F10c-offline-sync-reconnect.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 5 | 0 | 0 |
| dark | 5 | 4 | 1 | 1 |

<details><summary>Failed flows</summary>

- dark · F10 offline sync, part 3 (online again; everything sends without a tap): Assertion is false: "All saved" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 70 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.92 (3), dark 0.506 (4)
