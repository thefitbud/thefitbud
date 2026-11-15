### Device gate · ios · FAIL

- device log: rn-warn 4

Flows (5): `device/z12-36/1-primitives-gallery.yaml`, `device/z12-36/2-trainee-today-diet.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `device/z12-36/9-gallery-hold.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 5 | 0 | 0 |
| dark | 5 | 5 | 0 | 0 |

**Device log:** FAILED (rn-warn: 4)

<details><summary>First log findings</summary>

```
[rn-warn] ios-device.log:117782 2026-11-15 07:24:28.886 Df FitBudStaging[45352:1f67a] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:123451 2026-11-15 07:24:38.770 Df FitBudStaging[45352:1f67a] [fitbud-gate] native.warn (ADVICE) View #1269 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:291987 2026-11-15 07:38:28.687 Df FitBudStaging[79485:34cd6] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:293224 2026-11-15 07:38:30.670 Df FitBudStaging[79485:34cd6] [fitbud-gate] native.warn (ADVICE) View #705 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
```
</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 137 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.871 (12), dark 0.428 (13)
