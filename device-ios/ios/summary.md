### Device gate · ios · FAIL

- light: 1 of 7 flows failed
- dark: 3 of 7 flows failed

Flows (7): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-40/1-day-moves.yaml`, `device/z12-44/1-workout-tab.yaml`, `device/z12-44/2-finish-workout.yaml`, `device/z12-44/3-no-plan.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 7 | 6 | 1 | 1 |
| dark | 7 | 4 | 3 | 1 |

<details><summary>Failed flows</summary>

- light · Z12-44 Workout tab, no plan yet (TR-10b): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible
- dark · Z12-44 Workout tab v3 (done day, summary, future, rest, relaunch): Element not found: Text matching regex: Workout
- dark · Z12-44 Finish a workout (in progress, relaunch, summary, View summary only): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible
- dark · Z12-44 Workout tab, no plan yet (TR-10b): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 134 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.905 (20), dark 0.698 (18)
