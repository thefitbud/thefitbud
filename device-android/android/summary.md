### Device gate · android · FAIL

- light: 1 of 5 flows failed
- device log: capture-empty 1

Flows (5): `device/z12-36/1-primitives-gallery.yaml`, `device/z12-36/2-trainee-today-diet.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `device/z12-36/9-gallery-hold.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 4 | 1 | 1 |
| dark | 5 | 5 | 0 | 0 |

<details><summary>Failed flows</summary>

- light · Z12-36 primitives gallery, light and dark, and the live theme flip: Unknown error

</details>

**Device log:** FAILED (capture-empty: 1)

<details><summary>First log findings</summary>

```
[capture-empty] android-device.log:0 no log shows Running "main": the app's output was not captured, so the scan proved nothing
```
</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 61 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.851 (9), dark 0.379 (16)
