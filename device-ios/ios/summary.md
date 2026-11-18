### Device gate · ios · FAIL

- light: 2 of 6 flows failed
- dark: 2 of 6 flows failed

Flows (6): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-38/1-trainee-note-banner.yaml`, `device/z12-46/1-no-plan.yaml`, `flows/v3/F11-weekly-checkin.yaml`, `flows/v3/F12-progress-weight.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 6 | 4 | 2 | 1 |
| dark | 6 | 4 | 2 | 1 |

<details><summary>Failed flows</summary>

- light · F11 Weekly check-in, sent, and a reviewed one (Z12-46): Assertion is false: "Sent to .*" is visible
- light · F12 Progress and log weight (Z12-46): Assertion is false: "Date" is visible
- dark · F11 Weekly check-in, sent, and a reviewed one (Z12-46): Assertion is false: "Sent to .*" is visible
- dark · F12 Progress and log weight (Z12-46): Assertion is false: "Date" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 154 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.922 (12), dark 0.201 (12)
