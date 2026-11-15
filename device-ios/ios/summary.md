### Device gate · ios · FAIL

- light: 1 of 5 flows failed
- dark: 1 of 5 flows failed
- device log: rn-warn 4

Flows (5): `device/z12-36/1-primitives-gallery.yaml`, `device/z12-36/2-trainee-today-diet.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `device/z12-36/9-gallery-hold.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 4 | 1 | 1 |
| dark | 5 | 4 | 1 | 1 |

<details><summary>Failed flows</summary>

- light · Z12-36 trainer Needs you (TM-01a) and the nudge sheet (TM-04b): Assertion is false: "Loading" is not visible
- dark · Z12-36 trainee Today (TR-06a) and Diet (TR-07a): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible

</details>

**Device log:** FAILED (rn-warn: 4)

<details><summary>First log findings</summary>

```
[rn-warn] ios-device.log:101933 2026-11-15 07:05:47.447 Df FitBudStaging[59790:27a20] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:108871 2026-11-15 07:06:07.873 Df FitBudStaging[59790:27a20] [fitbud-gate] native.warn (ADVICE) View #1269 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:266755 2026-11-15 07:20:53.772 Df FitBudStaging[96812:3f6d7] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:268750 2026-11-15 07:20:57.106 Df FitBudStaging[96812:3f6d7] [fitbud-gate] native.warn (ADVICE) View #835 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
```
</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 176 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.885 (11), dark 0.393 (13)
