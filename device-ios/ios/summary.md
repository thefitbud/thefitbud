### Device gate · ios · FAIL

- light: 3 of 5 flows failed
- dark: 2 of 5 flows failed
- device log: rn-warn 7

Flows (5): `device/z12-36/1-primitives-gallery.yaml`, `device/z12-36/2-trainee-today-diet.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `device/z12-36/9-gallery-hold.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 2 | 3 | 1 |
| dark | 5 | 3 | 2 | 1 |

<details><summary>Failed flows</summary>

- light · Z12-36 primitives gallery, light and dark, and the live theme flip: Assertion is false: "Large title 30" is visible
- light · Z12-36 trainee Today (TR-06a) and Diet (TR-07a): Assertion is false: "Today's workout|Needs you|Choose mode" is visible
- light · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Today's workout|Needs you|Choose mode" is visible
- dark · Z12-36 trainee Today (TR-06a) and Diet (TR-07a): Assertion is false: "Today's workout|Needs you|Choose mode" is visible
- dark · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Today's workout|Needs you|Choose mode" is visible

</details>

**Device log:** FAILED (rn-warn: 7)

<details><summary>First log findings</summary>

```
[rn-warn] ios-device.log:23364 2026-11-15 06:01:05.389 Df FitBudStaging[29003:14608] [fitbud-gate] native.warn (ADVICE) View #819 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:89572 2026-11-15 06:05:41.193 Df FitBudStaging[49043:21dad] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:91527 2026-11-15 06:05:43.943 Df FitBudStaging[49043:21dad] [fitbud-gate] native.warn (ADVICE) View #715 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:158102 2026-11-15 06:09:05.816 Df FitBudStaging[55715:26401] [fitbud-gate] native.warn (ADVICE) View #4419 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:170068 2026-11-15 06:11:07.872 Df FitBudStaging[55715:26401] [fitbud-gate] native.warn (ADVICE) View #4419 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:261253 2026-11-15 06:18:49.993 Df FitBudStaging[82072:3718f] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:264394 2026-11-15 06:18:54.093 Df FitBudStaging[82072:3718f] [fitbud-gate] native.warn (ADVICE) View #1269 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
```
</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 120 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.811 (8), dark 0.389 (12)
