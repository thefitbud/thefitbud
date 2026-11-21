### Device gate · ios · FAIL

- light: 8 of 10 flows failed
- dark: 8 of 10 flows failed
- no device-log scan

Flows (10): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F20-triage-nudge.yaml`, `flows/v3/F21-review-resolve-notes.yaml`, `flows/v3/F22-reply-question.yaml`, `flows/v3/F23-review-checkin.yaml`, `flows/v3/F24-session-diet-review.yaml`, `flows/v3/F25-clients-activity.yaml`, `flows/v3/F26-ended-reactivation.yaml`, `flows/v3/F27-offline-loading-errors.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 10 | 2 | 8 | 1 |
| dark | 10 | 2 | 8 | 1 |

<details><summary>Failed flows</summary>

- light · F20 Trainer nudges a client as a FitBud push (Z12-50): Assertion is false: "Log measurement|Mark reviewed|Resolve" is visible
- light · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Assertion is false: id: review-sheet-resolve is visible
- light · F22 Coach replies to a question (Z12-53): No visible element found: "Reply"
- light · F23 Coach reviews a check-in (Z12-53): Assertion is false: "Undo|Check-ins|Reviewed" is visible
- light · F24 Coach reviews a session and a diet day (Z12-53): No visible element found: "Priya Nair.*"
- light · F25 Clients, activity and client detail (Z12-53): No visible element found: "Rohan Mehta.*"
- light · F26 Ended client and reactivation (Z12-53): Element not found: Text matching regex: Ended
- light · F27 Offline, loading, errors (Z12-53): No visible element found: "Rohan Mehta.*|Aarav.*"
- dark · F20 Trainer nudges a client as a FitBud push (Z12-50): Assertion is false: "Log measurement|Mark reviewed|Resolve" is visible
- dark · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): Assertion is false: id: review-sheet-resolve is visible
- dark · F22 Coach replies to a question (Z12-53): No visible element found: "Reply"
- dark · F23 Coach reviews a check-in (Z12-53): Assertion is false: "Undo|Check-ins|Reviewed" is visible
- dark · F24 Coach reviews a session and a diet day (Z12-53): No visible element found: "Priya Nair.*"
- dark · F25 Clients, activity and client detail (Z12-53): No visible element found: "Rohan Mehta.*"
- dark · F26 Ended client and reactivation (Z12-53): Element not found: Text matching regex: Ended
- dark · F27 Offline, loading, errors (Z12-53): No visible element found: "Rohan Mehta.*|Aarav.*"

</details>

**Evidence (not part of the verdict):**

- build: cache-hit in 134 s
- theme: mean screenshot luminance: light 0.921 (29), dark 0.123 (30)
