### Device gate · android · FAIL

- light: 5 of 10 flows failed
- dark: 5 of 10 flows failed

Flows (10): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F20-triage-nudge.yaml`, `flows/v3/F21-review-resolve-notes.yaml`, `flows/v3/F22-reply-question.yaml`, `flows/v3/F23-review-checkin.yaml`, `flows/v3/F24-session-diet-review.yaml`, `flows/v3/F25-clients-activity.yaml`, `flows/v3/F26-ended-reactivation.yaml`, `flows/v3/F27-offline-loading-errors.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 10 | 5 | 5 | 1 |
| dark | 10 | 5 | 5 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- light · F20 Trainer nudges a client as a FitBud push (Z12-50): Assertion is false: "Log measurement|Mark reviewed|Resolve" is visible (not retried: not an infrastructure failure)
- light · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Assertion is false: "Open .*profile" is visible (not retried: not an infrastructure failure)
- light · F23 Coach reviews a check-in (Z12-53): Assertion is false: "Undo|Check-ins|Reviewed" is visible (not retried: not an infrastructure failure)
- light · F25 Clients, activity and client detail (Z12-53): Element not found: Text matching regex: Clients (not retried: not an infrastructure failure)
- light · F26 Ended client and reactivation (Z12-53): Element not found: Text matching regex: Ended (not retried: not an infrastructure failure)
- dark · F20 Trainer nudges a client as a FitBud push (Z12-50): Assertion is false: "Log measurement|Mark reviewed|Resolve" is visible (not retried: not an infrastructure failure)
- dark · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Assertion is false: "Open .*profile" is visible (not retried: not an infrastructure failure)
- dark · F23 Coach reviews a check-in (Z12-53): Assertion is false: "Undo|Check-ins|Reviewed" is visible (not retried: not an infrastructure failure)
- dark · F25 Clients, activity and client detail (Z12-53): Element not found: Text matching regex: Clients (not retried: not an infrastructure failure)
- dark · F26 Ended client and reactivation (Z12-53): Element not found: Text matching regex: Ended (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 11s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); retry (light): steady for 8 checks after 7s (0 drop(s) seen); theme dark: steady for 8 checks after 7s (0 drop(s) seen); retry (dark): steady for 8 checks after 7s (0 drop(s) seen)
- build: cache-hit in 55 s
- theme: mean screenshot luminance: light 0.902 (28), dark 0.117 (28)
