### Device gate · ios · FAIL

- light: 2 of 4 flows failed
- dark: 2 of 4 flows failed

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-40/1-day-moves.yaml`, `flows/v3/F29-future-days.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 2 | 2 | 1 |
| dark | 4 | 2 | 2 | 1 |

<details><summary>Failed flows</summary>

- light · Z12-40 Moving between days (swipe, cached days, header): Assertion is false: ".*Loading your day.*" is not visible
- light · F29 Future days are view only (Z12-39): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible
- dark · Z12-40 Moving between days (swipe, cached days, header): Assertion is false: ".*· planned" is visible
- dark · F29 Future days are view only (Z12-39): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 173 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.791 (7), dark 0.894 (9)
