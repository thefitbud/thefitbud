### Device gate · ios · PASS

Flows (2): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 2 | 2 | 0 | 0 |
| dark | 2 | 2 | 0 | 0 |

**Device log:** clean

**Evidence (not part of the verdict):**

- build: full in 1488 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.949 (2), dark 0.949 (2)
