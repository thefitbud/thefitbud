### Device gate · ios · FAIL

- light: 1 of 3 flows failed
- dark: 1 of 3 flows failed

Flows (3): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F08-log-it-myself.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 3 | 2 | 1 | 1 |
| dark | 3 | 2 | 1 | 1 |

<details><summary>Failed flows</summary>

- light · F08 Log it myself (Z12-43): Assertion is false: "Log it myself" is visible
- dark · F08 Log it myself (Z12-43): Assertion is false: "Log it myself" is visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 144 s
- theme: mean screenshot luminance: light 0.939 (4), dark 0.939 (4)
