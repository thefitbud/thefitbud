### Device gate · ios · FAIL

- light: 2 of 4 flows failed
- dark: 2 of 4 flows failed

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F07-diet-day.yaml`, `flows/v3/F09-diet-edit-delete-late.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 2 | 2 | 1 |
| dark | 4 | 2 | 2 | 1 |

<details><summary>Failed flows</summary>

- light · F07 Diet day (Z12-42): Assertion is false: "kcal eaten" is visible
- light · F09 Diet edit and late log (Z12-42): Assertion is false: "kcal eaten" is visible
- dark · F07 Diet day (Z12-42): Assertion is false: "kcal eaten" is visible
- dark · F09 Diet edit and late log (Z12-42): Assertion is false: "kcal eaten" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 143 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.885 (3), dark 0.643 (3)
