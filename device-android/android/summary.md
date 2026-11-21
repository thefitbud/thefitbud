### Device gate · android · FAIL

- light: 3 of 10 flows failed
- dark: 3 of 10 flows failed

Flows (10): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F20-triage-nudge.yaml`, `flows/v3/F21-review-resolve-notes.yaml`, `flows/v3/F22-reply-question.yaml`, `flows/v3/F23-review-checkin.yaml`, `flows/v3/F24-session-diet-review.yaml`, `flows/v3/F25-clients-activity.yaml`, `flows/v3/F26-ended-reactivation.yaml`, `flows/v3/F27-offline-loading-errors.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 10 | 7 | 3 | 1 |
| dark | 10 | 7 | 3 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- light · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Assertion is false: id: more-sheet is visible (not retried: not an infrastructure failure)
- light · F24 Coach reviews a session and a diet day (Z12-53): Assertion is false: "rahul.coach@demo.fitbud.test" is visible (not retried: not an infrastructure failure)
- light · F26 Ended client and reactivation (Z12-53): No visible element found: id: clients-filter-ended (not retried: not an infrastructure failure)
- dark · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Assertion is false: id: more-sheet is visible (not retried: not an infrastructure failure)
- dark · F24 Coach reviews a session and a diet day (Z12-53): Element not found: Text matching regex: .*Back.*|.*‹.* (not retried: not an infrastructure failure)
- dark · F26 Ended client and reactivation (Z12-53): No visible element found: id: clients-filter-ended (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 9s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); retry (light): steady for 8 checks after 7s (0 drop(s) seen); theme dark: steady for 8 checks after 7s (0 drop(s) seen); retry (dark): steady for 8 checks after 8s (0 drop(s) seen)
- build: cache-hit in 57 s
- theme: mean screenshot luminance: light 0.882 (32), dark 0.119 (34)
