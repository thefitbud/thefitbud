### Device gate · ios · FAIL

- light: 2 of 4 flows failed
- dark: 4 of 4 flows failed

Flows (4): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `flows/v3/F21-review-resolve-notes.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 2 | 2 | 1 |
| dark | 4 | 0 | 4 | 1 |

<details><summary>Failed flows</summary>

- light · Z12-36 trainer Needs you (TM-01a) and the nudge sheet (TM-04b): Assertion is false: "Large title 30" is visible
- light · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Assertion is false: "Sign in with a code instead" is visible
- dark · Launch smoke, trainee Today loads: Assertion is false: "Sign in with a code instead" is visible
- dark · Launch smoke, trainer Attention loads: Assertion is false: "Sign in with a code instead" is visible
- dark · Z12-36 trainer Needs you (TM-01a) and the nudge sheet (TM-04b): Assertion is false: "Sign in with a code instead" is visible
- dark · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Assertion is false: "Sign in with a code instead" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 172 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.763 (9), dark 0.349 (4)
