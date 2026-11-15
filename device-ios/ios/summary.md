### Device gate · ios · FAIL

- light: 2 of 5 flows failed
- device log: rn-warn 4

Flows (5): `device/z12-36/1-primitives-gallery.yaml`, `device/z12-36/2-trainee-today-diet.yaml`, `device/z12-36/3-trainee-workout.yaml`, `device/z12-36/4-trainer-needs-you-nudge.yaml`, `device/z12-36/9-gallery-hold.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 5 | 3 | 2 | 1 |
| dark | 5 | 5 | 0 | 0 |

<details><summary>Failed flows</summary>

- light · Z12-36 trainee Today (TR-06a) and Diet (TR-07a): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible
- light · Z12-36 trainee active workout mid-session (W-03): Assertion is false: "Today's workout.*|Needs you.*|Choose mode" is visible

</details>

**Device log:** FAILED (rn-warn: 4)

<details><summary>First log findings</summary>

```
[rn-warn] ios-device.log:97855 2026-11-15 07:56:40.785 Df FitBudStaging[75290:2ffa9] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:106898 2026-11-15 07:57:02.302 Df FitBudStaging[75290:2ffa9] [fitbud-gate] native.warn (ADVICE) View #835 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:312299 2026-11-15 08:10:29.202 Df FitBudStaging[7680:44711] [fitbud-gate] native.warn (ADVICE) View #673 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
[rn-warn] ios-device.log:315396 2026-11-15 08:10:33.285 Df FitBudStaging[7680:44711] [fitbud-gate] native.warn (ADVICE) View #1265 of type RCTView has a shadow set but cannot calculate shadow efficiently. Consider setting a solid background color to fix this, or apply the shadow to a more specific component.
```
</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 175 s
- lockscreen-live-activity: not-found — no lock-screen element matches /Log set [0-9]+|Skip rest|FitBud · /i (dump: lockscreen/ios-live-activity-locked-swiped.json)
- lockscreen-notification: not-found — no lock-screen element matches /FitBud/i (dump: lockscreen/ios-notification-locked-swiped.json)
- offline: local API stopped and restarted (the simulator has no airplane mode) — screenshots offline-app and online-app
- push: simctl-push — APNs payload in Expo's envelope delivered by xcrun simctl push; the tap reaches the app's notification response listener
- theme: mean screenshot luminance: light 0.868 (11), dark 0.429 (13)
