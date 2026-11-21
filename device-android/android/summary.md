### Device gate · android · PASS

Flows (2): `device/launch/1-trainee-today.yaml`, `device/launch/2-trainer-attention.yaml`

| theme | flows | passed | failed | Maestro exit |
|---|---|---|---|---|
| light | 2 | 2 | 0 | 0 |
| dark | 2 | 2 | 0 | 0 |

**Infra retries:** none

**Device log:** clean

**Evidence (not part of the verdict):**

- adb: steady — logcat stream restarted 0 time(s); boot: steady for 8 checks after 11s (0 drop(s) seen); theme light: steady for 8 checks after 8s (0 drop(s) seen); theme dark: steady for 8 checks after 7s (0 drop(s) seen)
- build: full in 500 s
- theme: mean screenshot luminance: light 0.893 (4), dark 0.738 (4)
