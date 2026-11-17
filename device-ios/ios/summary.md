### Device gate · ios · FAIL

- light: 1 of 8 flows failed
- dark: 1 of 8 flows failed

Flows (8): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F01-first-install.yaml`, `flows/v3/F02-sign-in.yaml`, `flows/v3/F02b-auth-errors.yaml`, `flows/v3/F15-settings-account.yaml`, `flows/v3/F16-expiry-errors-ended.yaml`, `flows/v3/F17-role-switch.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 8 | 7 | 1 | 1 |
| dark | 8 | 7 | 1 | 1 |

<details><summary>Failed flows</summary>

- light · F17 Role select, switch to coach view and Back (Z12-49): Assertion is false: ".*also a coach" is visible
- dark · F17 Role select, switch to coach view and Back (Z12-49): Assertion is false: ".*also a coach" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: full in 1203 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.914 (24), dark 0.194 (24)
