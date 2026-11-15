### Device gate · ios · FAIL

- light: 5 of 5 flows failed
- dark: 4 of 5 flows failed

Flows (5): `device/z12-36/1-primitives-gallery.yaml`, `device/z12-36/2-trainee-today-diet.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `device/z12-36/9-gallery-hold.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 0 | 5 | 1 |
| dark | 5 | 1 | 4 | 1 |

<details><summary>Failed flows</summary>

- light · Z12-36 primitives gallery, light and dark, and the live theme flip: Assertion is false: "Large title 30" is visible
- light · Z12-36 trainee Today (TR-06a) and Diet (TR-07a): Assertion is false: "Sign in with a code instead" is visible
- light · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Sign in with a code instead" is visible
- light · Z12-36 trainer Needs you (TM-01a) and the nudge sheet (TM-04b): Assertion is false: "Sign in with a code instead" is visible
- light · Z12-36 hold the gallery open for the theme flip: Assertion is false: "Large title 30" is visible
- dark · Z12-36 primitives gallery, light and dark, and the live theme flip: Assertion is false: "Large title 30" is visible
- dark · Z12-36 trainee Today (TR-06a) and Diet (TR-07a): Assertion is false: "Sign in with a code instead" is visible
- dark · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Sign in with a code instead" is visible
- dark · Z12-36 trainer Needs you (TM-01a) and the nudge sheet (TM-04b): Assertion is false: "Sign in with a code instead" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 103 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.643 (8), dark 0.277 (6)
