### Device gate · ios · FAIL

- light: 1 of 4 flows failed
- dark: 1 of 4 flows failed

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F20-triage-nudge.yaml`, `flows/v3/F21-review-resolve-notes.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 3 | 1 | 1 |
| dark | 4 | 3 | 1 | 1 |

<details><summary>Failed flows</summary>

- light · F20 Trainer nudges a client as a FitBud push (Z12-50): No visible element found: "[A-Z]{2},? Rohan Mehta.*|Rohan Mehta"
- dark · F20 Trainer nudges a client as a FitBud push (Z12-50): Assertion is false: "PREVIEW · TAP TO EDIT" is not visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 99 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.85 (13), dark 0.32 (14)
