### Device gate · ios · FAIL

- light: 5 of 10 flows failed
- dark: 7 of 10 flows failed
- no device-log scan

Flows (10): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F20-triage-nudge.yaml`, `flows/v3/F21-review-resolve-notes.yaml`, `flows/v3/F22-reply-question.yaml`, `flows/v3/F23-review-checkin.yaml`, `flows/v3/F24-session-diet-review.yaml`, `flows/v3/F25-clients-activity.yaml`, `flows/v3/F26-ended-reactivation.yaml`, `flows/v3/F27-offline-loading-errors.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 10 | 5 | 5 | 1 |
| dark | 10 | 3 | 7 | 1 |

<details><summary>Failed flows</summary>

- light · F22 Coach replies to a question (Z12-53): Assertion is false: "Mark answered" is visible
- light · F23 Coach reviews a check-in (Z12-53): Assertion is false: "Reply sent|Undo|Mark reviewed|Check-ins" is visible
- light · F24 Coach reviews a session and a diet day (Z12-53): Assertion is false: "Food|Meals ·" is visible
- light · F25 Clients, activity and client detail (Z12-53): Element not found: Id matching regex: tab-clients
- light · F26 Ended client and reactivation (Z12-53): Assertion is false: id: clients-filter-ended is visible
- dark · F20 Trainer nudges a client as a FitBud push (Z12-50): Assertion is false: "PREVIEW · TAP TO EDIT" is visible
- dark · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Element not found: Text matching regex: Review Rohan Mehta|Review Rohan.*
- dark · F22 Coach replies to a question (Z12-53): Assertion is false: "Mark answered" is visible
- dark · F23 Coach reviews a check-in (Z12-53): Element not found: Text matching regex: Mark reviewed
- dark · F24 Coach reviews a session and a diet day (Z12-53): Assertion is false: "Food|Meals ·" is visible
- dark · F25 Clients, activity and client detail (Z12-53): Element not found: Id matching regex: tab-clients
- dark · F26 Ended client and reactivation (Z12-53): Assertion is false: id: clients-filter-ended is visible

</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 158 s
- theme: mean screenshot luminance: light 0.874 (40), dark 0.116 (35)
