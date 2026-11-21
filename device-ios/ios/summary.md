### Device gate · ios · FAIL

- light: 3 of 10 flows failed
- dark: 5 of 10 flows failed
- no device-log scan

Flows (10): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F20-triage-nudge.yaml`, `flows/v3/F21-review-resolve-notes.yaml`, `flows/v3/F22-reply-question.yaml`, `flows/v3/F23-review-checkin.yaml`, `flows/v3/F24-session-diet-review.yaml`, `flows/v3/F25-clients-activity.yaml`, `flows/v3/F26-ended-reactivation.yaml`, `flows/v3/F27-offline-loading-errors.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 10 | 7 | 3 | 1 |
| dark | 10 | 5 | 5 | 1 |

<details><summary>Failed flows</summary>

- light · F22 Coach replies to a question (Z12-53): Assertion is false: id: ask-detail is visible
- light · F24 Coach reviews a session and a diet day (Z12-53): Element not found: Text matching regex: .*Back.*|.*‹.*
- light · F26 Ended client and reactivation (Z12-53): No visible element found: id: clients-filter-ended
- dark · F20 Trainer nudges a client as a FitBud push (Z12-50): Assertion is false: id: nudge-preview is not visible
- dark · F22 Coach replies to a question (Z12-53): Assertion is false: id: ask-detail is visible
- dark · F24 Coach reviews a session and a diet day (Z12-53): Element not found: Text matching regex: .*Back.*|.*‹.*
- dark · F25 Clients, activity and client detail (Z12-53): Assertion is false: ".*Nudge .* about.*|.*Send nudge.*|.*Close.*|.*Cancel.*|.*nudge-pick.*" is visible
- dark · F26 Ended client and reactivation (Z12-53): No visible element found: id: clients-filter-ended

</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 60 s
- theme: mean screenshot luminance: light 0.878 (43), dark 0.123 (35)
