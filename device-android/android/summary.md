### Device gate · android · PASS

Flows (3): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`, `flows/v3/F08-log-it-myself.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 3 | 3 | 0 | 0 |
| dark | 3 | 3 | 0 | 0 |

**Infra retries:** none

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 11s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); theme dark: steady for 8 checks after 7s (0 drop(s) seen)
- build: cache-hit in 71 s
- theme: mean screenshot luminance: light 0.925 (2), dark 0.925 (2)
