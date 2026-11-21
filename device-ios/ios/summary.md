### Device gate · ios · FAIL

- light: 10 of 10 flows failed
- dark: 5 of 10 flows failed

Flows (10): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F20-triage-nudge.yaml`, `flows/v3/F21-review-resolve-notes.yaml`, `flows/v3/F22-reply-question.yaml`, `flows/v3/F23-review-checkin.yaml`, `flows/v3/F24-session-diet-review.yaml`, `flows/v3/F25-clients-activity.yaml`, `flows/v3/F26-ended-reactivation.yaml`, `flows/v3/F27-offline-loading-errors.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 10 | 0 | 10 | 1 |
| dark | 10 | 5 | 5 | 1 |

<details><summary>Failed flows</summary>

- light · Launch smoke, trainee Today loads: maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- light · Launch smoke, trainer Attention loads: maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- light · F20 Trainer nudges a client as a FitBud push (Z12-50): maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- light · F21 Trainer marks reviewed, resolves and adds a note (Z12-51): maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- light · F22 Coach replies to a question (Z12-53): maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- light · F23 Coach reviews a check-in (Z12-53): maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- light · F24 Coach reviews a session and a diet day (Z12-53): maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- light · F25 Clients, activity and client detail (Z12-53): maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- light · F26 Ended client and reactivation (Z12-53): maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- light · F27 Offline, loading, errors (Z12-53): maestro.DeviceUnreachableException: Device became unreachable during viewHierarchy
- dark · F22 Coach replies to a question (Z12-53): Assertion is false: id: ask-detail is visible
- dark · F23 Coach reviews a check-in (Z12-53): Assertion is false: id: checkins-loaded is visible
- dark · F24 Coach reviews a session and a diet day (Z12-53): Element not found: Text matching regex: .*Back.*|.*‹.*
- dark · F25 Clients, activity and client detail (Z12-53): Assertion is false: id: client-status is visible
- dark · F26 Ended client and reactivation (Z12-53): No visible element found: id: clients-filter-ended

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: full in 1752 s
- theme: mean screenshot luminance: light — (0), dark 0.123 (38)
