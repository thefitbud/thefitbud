### Device gate · android · FAIL

- light: 1 of 3 flows failed
- dark: 1 of 3 flows failed

Flows (3): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F08-log-it-myself.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 3 | 2 | 1 | 1 |
| dark | 3 | 2 | 1 | 1 |

**Infra retries:** none

<details><summary>Failed flows</summary>

- light · F08 Log it myself (Z12-43): No visible element found: "Something different" (not retried: not an infrastructure failure)
- dark · F08 Log it myself (Z12-43): No visible element found: "Something different" (not retried: not an infrastructure failure)

</details>

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 11s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); retry (light): steady for 8 checks after 7s (0 drop(s) seen); theme dark: steady for 8 checks after 8s (0 drop(s) seen); retry (dark): steady for 8 checks after 7s (0 drop(s) seen)
- build: cache-hit in 60 s
- theme: mean screenshot luminance: light 0.917 (3), dark 0.68 (3)
