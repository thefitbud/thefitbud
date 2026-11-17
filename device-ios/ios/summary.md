### Device gate · ios · FAIL

- light: 1 of 4 flows failed
- dark: 1 of 4 flows failed

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F07-diet-day.yaml`, `flows/v3/F09-diet-edit-delete-late.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 3 | 1 | 1 |
| dark | 4 | 3 | 1 | 1 |

<details><summary>Failed flows</summary>

- light · Launch smoke, trainer Attention loads: Assertion is false: "Loading" is not visible
- dark · Launch smoke, trainer Attention loads: Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 205 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.936 (5), dark 0.488 (6)
