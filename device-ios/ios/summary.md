### Device gate · ios · FAIL

- light: 1 of 3 flows failed
- dark: 2 of 3 flows failed

Flows (3): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F16-expiry-errors-ended.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 3 | 2 | 1 | 1 |
| dark | 3 | 1 | 2 | 1 |

<details><summary>Failed flows</summary>

- light · F16 Ended coaching and the coach's restart request (Z12-49): Element not found: Text matching regex: Sign out
- dark · Launch smoke, trainee Today loads: Assertion is false: "Today's workout.*|This week|Rest day|Recovery is part of the plan|View summary|Needs you.*|Choose mode|preparing your plan" is visible
- dark · F16 Ended coaching and the coach's restart request (Z12-49): Element not found: Text matching regex: Sign out

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 113 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.917 (9), dark 0.356 (10)
