### Device gate · ios · FAIL

- light: no JUnit report (Maestro did not finish)
- dark: no JUnit report (Maestro did not finish)
- device log: capture-empty 1

Flows (3): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F20-triage-nudge.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 0 | 0 | 0 | 1 |
| dark | 0 | 0 | 0 | 1 |

**Device log:** FAILED (capture-empty: 1)

<details><summary>First log findings</summary>

```
[capture-empty] ios-device.log:0 no log shows Running "main": the app's output was not captured, so the scan proved nothing
```
</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 144 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light — (0), dark — (0)
