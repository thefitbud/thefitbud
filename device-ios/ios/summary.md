### Device gate · ios · FAIL

- light: 2 of 3 flows failed

Flows (3): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-29/1-delete-and-reactivate.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 3 | 1 | 2 | 1 |
| dark | 3 | 3 | 0 | 0 |

<details><summary>Failed flows</summary>

- light · Launch smoke, trainee Today loads: Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible
- light · Z12-29 delete account from Privacy, archived notice, sign in again, reactivate: Assertion is false: "Your account is archived\. Sign in before [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4} to bring it back\." is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 320 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.93 (7), dark 0.321 (8)
