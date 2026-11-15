### Device gate · ios · FAIL

- light: 3 of 5 flows failed
- dark: 4 of 5 flows failed

Flows (5): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F10-offline-sync.yaml`, `flows/v3/F10b-offline-sync-offline.yaml`, `flows/v3/F10c-offline-sync-reconnect.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 2 | 3 | 1 |
| dark | 5 | 1 | 4 | 1 |

<details><summary>Failed flows</summary>

- light · Launch smoke, trainee Today loads: Assertion is false: "Today's workout|Needs you|Choose mode" is visible
- light · F10 offline sync, part 1 (online; sign in and load what will be used offline): Assertion is false: "Today's workout|Needs you|Choose mode" is visible
- light · F10 offline sync, part 2 (offline; log, sync status TR-19a, kill and relaunch): Element not found: Text matching regex: Log Waist
- dark · Launch smoke, trainee Today loads: Assertion is false: "Today's workout|Needs you|Choose mode" is visible
- dark · F10 offline sync, part 1 (online; sign in and load what will be used offline): Assertion is false: "Today's workout|Needs you|Choose mode" is visible
- dark · F10 offline sync, part 2 (offline; log, sync status TR-19a, kill and relaunch): Assertion is false: "Log weight" is visible
- dark · F10 offline sync, part 3 (online again; everything sends without a tap): Assertion is false: "Last sent .*" is visible

</details>

**Device log:** clean · 4 allowed by allowlist.json

**Evidence (not part of the verdict):**

- build: cache-hit in 132 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.936 (4), dark 0.76 (5)
