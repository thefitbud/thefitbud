### Device gate · ios · FAIL

- light: 7 of 8 flows failed
- dark: 7 of 8 flows failed

Flows (8): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F22-reply-question.yaml`, `flows/v3/F23-review-checkin.yaml`, `flows/v3/F24-session-diet-review.yaml`, `flows/v3/F25-clients-activity.yaml`, `flows/v3/F26-ended-reactivation.yaml`, `flows/v3/F27-offline-loading-errors.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 8 | 1 | 7 | 1 |
| dark | 8 | 1 | 7 | 1 |

<details><summary>Failed flows</summary>

- light · Launch smoke, trainer Attention loads: Assertion is false: "Needs you [0-9]+" is visible
- light · F22 Coach replies to a question (Z12-53): Assertion is false: "Needs you [0-9]+" is visible
- light · F23 Coach reviews a check-in (Z12-53): Assertion is false: "Mark reviewed|Reply|Save|This week|Last week" is visible
- light · F24 Coach reviews a session and a diet day (Z12-53): Assertion is false: "Needs you [0-9]+" is visible
- light · F25 Clients, activity and client detail (Z12-53): No visible element found: "Rohan Mehta.*"
- light · F26 Ended client and reactivation (Z12-53): Element not found: Text matching regex: Ended
- light · F27 Offline, loading, errors (Z12-53): No visible element found: "Rohan Mehta.*|Aarav.*"
- dark · Launch smoke, trainer Attention loads: Assertion is false: "Needs you [0-9]+" is visible
- dark · F22 Coach replies to a question (Z12-53): Assertion is false: "Needs you [0-9]+" is visible
- dark · F23 Coach reviews a check-in (Z12-53): No visible element found: "Submitted|to review|Open"
- dark · F24 Coach reviews a session and a diet day (Z12-53): Assertion is false: "Needs you [0-9]+" is visible
- dark · F25 Clients, activity and client detail (Z12-53): No visible element found: "Rohan Mehta.*"
- dark · F26 Ended client and reactivation (Z12-53): Element not found: Text matching regex: Ended
- dark · F27 Offline, loading, errors (Z12-53): No visible element found: "Rohan Mehta.*|Aarav.*"

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 140 s
- theme: mean screenshot luminance: light 0.937 (15), dark 0.109 (15)
