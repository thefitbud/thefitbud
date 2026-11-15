### Device gate · android · FAIL

- light: 3 of 4 flows failed
- dark: 3 of 4 flows failed

Flows (4): `flows/auth/sign-in-code.yaml`, `flows/auth/sign-in-password.yaml`, `flows/trainee/today.yaml`, `flows/trainer/clients.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 4 | 1 | 3 | 1 |
| dark | 4 | 1 | 3 | 1 |

<details><summary>Failed flows</summary>

- light · Sign in with a code: Assertion is false: "Today's workout|Needs you|Choose mode" is visible
- light · Trainee Today: Assertion is false: "Rest day\. Recovery is part of the plan\.|[0-9]+ exercises?.*" is visible
- light · Trainer Clients: Assertion is false: ".*QA Rohan.*" is visible
- dark · Sign in with a code: Assertion is false: "Today's workout|Needs you|Choose mode" is visible
- dark · Trainee Today: Assertion is false: "Rest day\. Recovery is part of the plan\.|[0-9]+ exercises?.*" is visible
- dark · Trainer Clients: Assertion is false: ".*QA Rohan.*" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 44 s
- theme: mean screenshot luminance: light 0.874 (9), dark 0.874 (9)
