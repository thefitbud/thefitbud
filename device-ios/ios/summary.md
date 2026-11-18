### Device gate · ios · FAIL

- light: 4 of 8 flows failed
- dark: 1 of 8 flows failed

Flows (8): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F03-first-workout.yaml`, `flows/v3/F04-plan-deviation.yaml`, `flows/v3/F05-exercise-detail-rest.yaml`, `flows/v3/F06-interruptions.yaml`, `flows/v3/F06b-interruptions-offline.yaml`, `flows/v3/F06c-interruptions-end.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 8 | 4 | 4 | 1 |
| dark | 8 | 7 | 1 | 1 |

<details><summary>Failed flows</summary>

- light · F04 Plan deviation (swipe to skip, Undo, edit a logged set, mark not done, exercise menu, skip exercise): Assertion is false: "Skip exercise\. .* sees it as skipped" is visible
- light · F06 Interruptions, part 1 (minimise, kill and resume, pause, discard confirm): Assertion is false: ".*Loading your day.*" is not visible
- light · F06 Interruptions, part 2 (offline mid-workout, W-20): Assertion is false: "Minimise workout" is visible
- light · F06 Interruptions, part 3 (back online; light finishes early, dark discards): Assertion is false: "Minimise workout" is visible
- dark · F04 Plan deviation (swipe to skip, Undo, edit a logged set, mark not done, exercise menu, skip exercise): Element not found: Text matching regex: Continue workout|Log workout|Start workout

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 156 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.904 (18), dark 0.212 (22)
