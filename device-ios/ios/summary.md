### Device gate · ios · FAIL

- light: 1 of 5 flows failed
- device log: rn-warn 4

Flows (5): `device/z12-36/1-primitives-gallery.yaml`, `device/z12-36/2-trainee-today-diet.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `device/z12-36/9-gallery-hold.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 4 | 1 | 1 |
| dark | 5 | 5 | 0 | 0 |

<details><summary>Failed flows</summary>

- light · Z12-36 primitives gallery, light and dark, and the live theme flip: Assertion is false: "Large title 30" is visible

</details>

**Device log:** FAILED (rn-warn: 4)

<details><summary>First log findings</summary>

```
[rn-warn] ios-device.log:114651 2026-11-15 09:37:37.803 Df FitBudStaging[57026:2589b] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:118012 2026-11-15 09:37:42.638 Df FitBudStaging[57026:2589b] [fitbud-gate] native.warn (ADVICE) View #829 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:332001 2026-11-15 09:51:07.987 Df FitBudStaging[83746:36d45] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:333533 2026-11-15 09:51:11.053 Df FitBudStaging[83746:36d45] [fitbud-gate] native.warn (ADVICE) View #713 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
```
</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 209 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.829 (12), dark 0.38 (16)
