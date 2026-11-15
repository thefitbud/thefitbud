### Device gate · ios · PASS

Flows (6): `device/z12-36/1-primitives-gallery.yaml`, `device/z12-36/2-trainee-today-diet.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `device/z12-36/8-primitives-gallery.yaml`, `device/z12-36/9-gallery-hold.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 6 | 6 | 0 | 0 |
| dark | 6 | 6 | 0 | 0 |

**Device log:** clean · 4 allowed by allowlist.json

**Evidence (not part of the verdict):**

- build: cache-hit in 120 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.868 (14), dark 0.38 (16)
