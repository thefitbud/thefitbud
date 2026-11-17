### Device gate · android · FAIL

- dark: 3 of 4 flows failed

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-40/1-day-moves.yaml`, `flows/v3/F29-future-days.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 4 | 0 | 0 |
| dark | 4 | 1 | 3 | 1 |

<details><summary>Failed flows</summary>

- dark · Launch smoke, trainer Attention loads: Unknown error
- dark · Z12-40 Moving between days (swipe, cached days, header): Unknown error
- dark · F29 Future days are view only (Z12-39): Unknown error

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 58 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i, on the lock screen or in the shade over it (dumps: lockscreen/android-notification-locked*.xml)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.859 (15), dark 0.773 (1)
