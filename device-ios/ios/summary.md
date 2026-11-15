### Device gate · ios · FAIL

- light: 1 of 4 flows failed

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-38/1-trainee-note-banner.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 3 | 1 | 1 |
| dark | 4 | 4 | 0 | 0 |

<details><summary>Failed flows</summary>

- light · Z12-38 trainee in-app banner (TR-06h) leaves by itself, swipes away, opens on a tap: Assertion is false: "Rahul has a note for you.*" is not visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 97 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.912 (7), dark 0.773 (5)
