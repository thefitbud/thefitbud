# Z14-33 QA

Checks run locally: `pnpm lint`, `pnpm typecheck`, `pnpm test` (all green).

Not done by the implementer: the Expo-web captures (393x852 and 360x800, light and dark) and the device run. FitBud UI runs `gh workflow run device.yml -f flows=launch,F25-clients-activity.yaml,F23-review-checkin.yaml,F32-client-profile-from-name.yaml` and compares against TM-09e and TM-09f.

Deviation from TM-09e (decided in the spec, first acceptance item): the client's first name is its own bold line above the sentence, because an inline name would be a button nested in the event button on web. The sentence under it drops the name ("removed their dinner log (Fri 13 Nov) · was 1,120 kcal, ate out").
