### Device gate · ios · FAIL

- light: 2 of 6 flows failed
- dark: 2 of 6 flows failed

Flows (6): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-44/1-workout-tab.yaml`, `device/z12-44/2-finish-workout.yaml`, `device/z12-44/3-no-plan.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 6 | 4 | 2 | 1 |
| dark | 6 | 4 | 2 | 1 |

<details><summary>Failed flows</summary>

- light · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible
- light · Z12-44 Finish a workout (in progress, relaunch, summary, View summary only): Assertion is false: "Log set [0-9]+ ·.*" is visible
- dark · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible
- dark · Z12-44 Finish a workout (in progress, relaunch, summary, View summary only): No visible element found: "View summary"

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 147 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.919 (15), dark 0.396 (16)
