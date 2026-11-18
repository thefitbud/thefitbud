### Device gate · ios · FAIL

- light: 2 of 8 flows failed
- dark: 6 of 8 flows failed

Flows (8): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F03-first-workout.yaml`, `flows/v3/F04-plan-deviation.yaml`, `flows/v3/F05-exercise-detail-rest.yaml`, `flows/v3/F06-interruptions.yaml`, `flows/v3/F06b-interruptions-offline.yaml`, `flows/v3/F06c-interruptions-end.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 8 | 6 | 2 | 1 |
| dark | 8 | 2 | 6 | 1 |

<details><summary>Failed flows</summary>

- light · F04 Plan deviation (swipe to skip, Undo, edit a logged set, mark not done, exercise menu, skip exercise): Assertion is false: "Set [0-9]+, skipped.*" is visible
- light · F06 Interruptions, part 2 (offline mid-workout, W-20): Assertion is false: "Rest, [0-9]+:[0-9]{2} left" is visible
- dark · F03 First workout (start, keypad, log, record, rest, rest ended, finish early sheet): Assertion is false: "[0-9]+ of [0-9]+ sets|Log workout|Start workout|Pick up where you left off\?" is visible
- dark · F04 Plan deviation (swipe to skip, Undo, edit a logged set, mark not done, exercise menu, skip exercise): Assertion is false: "[0-9]+ of [0-9]+ sets|Log workout|Start workout|Pick up where you left off\?" is visible
- dark · F05 Exercise detail and rest (How to, History, rest +15 / −15 / Skip, rest ended): Assertion is false: "[0-9]+ of [0-9]+ sets|Log workout|Start workout|Pick up where you left off\?" is visible
- dark · F06 Interruptions, part 1 (minimise, kill and resume, pause, discard confirm): Assertion is false: "[0-9]+ of [0-9]+ sets|Log workout|Start workout|Pick up where you left off\?" is visible
- dark · F06 Interruptions, part 2 (offline mid-workout, W-20): Assertion is false: "Minimise workout" is visible
- dark · F06 Interruptions, part 3 (back online; light finishes early, dark discards): Assertion is false: "Minimise workout" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 112 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.901 (20), dark 0.434 (6)
