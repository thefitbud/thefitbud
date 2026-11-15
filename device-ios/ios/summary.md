### Device gate · ios · FAIL

- light: 5 of 5 flows failed
- device log: rn-warn 2

Flows (5): `device/z12-36/1-primitives-gallery.yaml`, `device/z12-36/2-trainee-today-diet.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `device/z12-36/9-gallery-hold.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 0 | 5 | 1 |
| dark | 5 | 5 | 0 | 0 |

<details><summary>Failed flows</summary>

- light · Z12-36 primitives gallery, light and dark, and the live theme flip: Assertion is false: "Large title 30|Open in .*" is visible
- light · Z12-36 trainee Today (TR-06a) and Diet (TR-07a): Assertion is false: "Sign in with a code instead" is visible
- light · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Sign in with a code instead" is visible
- light · Z12-36 trainer Needs you (TM-01a) and the nudge sheet (TM-04b): Assertion is false: "Sign in with a code instead" is visible
- light · Z12-36 hold the gallery open for the theme flip: Assertion is false: "Large title 30" is visible

</details>

**Device log:** FAILED (rn-warn: 2)

<details><summary>First log findings</summary>

```
[rn-warn] ios-device.log:164473 2026-11-15 08:58:59.382 Df FitBudStaging[88494:39d26] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:169571 2026-11-15 08:59:11.499 Df FitBudStaging[88494:39d26] [fitbud-gate] native.warn (ADVICE) View #829 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
```
</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 165 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.671 (7), dark 0.449 (12)
