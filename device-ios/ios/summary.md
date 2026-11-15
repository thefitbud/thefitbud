### Device gate · ios · FAIL

- light: 1 of 2 flows failed

Flows (2): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 2 | 1 | 1 | 1 |
| dark | 2 | 2 | 0 | 0 |

<details><summary>Failed flows</summary>

- light · Launch smoke, trainer Attention loads: Assertion is false: "Loading" is not visible

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- build: cache-hit in 102 s
- theme: mean screenshot luminance: light 0.938 (2), dark 0.947 (2)
