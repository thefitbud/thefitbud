### Device gate · android · FAIL

- light: 2 of 4 flows failed
- device log: capture-empty 1

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-38/1-trainee-note-banner.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 2 | 2 | 1 |
| dark | 4 | 4 | 0 | 0 |

<details><summary>Failed flows</summary>

- light · Launch smoke, trainee Today loads: Unknown error
- light · Z12-38 trainee in-app banner (TR-06h) leaves by itself, swipes away, opens on a tap: Assertion is false: "Rahul has a note for you.*" is not visible

</details>

**Device log:** FAILED (capture-empty: 1)

<details><summary>First log findings</summary>

```
[capture-empty] android-device.log:0 no log shows Running "main": the app's output was not captured, so the scan proved nothing
```
</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 72 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i, on the lock screen or in the shade over it (dumps: lockscreen/android-live-activity-locked*.xml)
- lockscreen-notification: tapped-no-app — tapped at 588 728 twice; com.thefitbud.mobile.staging does not have the window focus (see lockscreen/android-notification-focus.txt)
- offline: adb shell cmd connectivity airplane-mode enable/disable — screenshots offline-app and online-app
- push: shell-notification — no Firebase config in this APK (google-services.json is an EAS secret), so a shell-owned notification with the same title and text was posted; it proves the lock-screen tap mechanics, not app routing
- theme: mean screenshot luminance: light 0.896 (5), dark 0.763 (5)
