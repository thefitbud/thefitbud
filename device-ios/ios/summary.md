### Device gate · ios · PASS

Flows (5): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F10-offline-sync.yaml`, `flows/v3/F10b-offline-sync-offline.yaml`, `flows/v3/F10c-offline-sync-reconnect.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 5 | 0 | 0 |
| dark | 5 | 5 | 0 | 0 |

**Device log:** clean · 4 allowed by allowlist.json

**Evidence (not part of the verdict):**

- build: cache-hit in 175 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.938 (3), dark 0.654 (3)
