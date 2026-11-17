# Z12-39 QA: future days are view only (D-W12-7)

- **Screen shots** `<screen ID>-<theme>-<platform>.png` (TR-06d, TR-07k, W-01e, TR-06c, TR-07f) come from the scoped device run `device.yml`, `flows=launch,z12-39`. The PR names the run and its head. The grades are this task's rows in `docs/qa/W12/parity.md`.
- **Flow shots** under `flows/` come from the same run: the read-only planned meal (`f29-planned-meal-readonly-*`) and Today's planned meal rows (`f29-today-future-meals-*`), below the fold of TR-06d.
- **Expo-web check** (before the device run): `web/`, with grades in `web/README.md`.
- **Flow:** `apps/mobile/.maestro/flows/v3/F29-future-days.yaml`.

## For Z12-58's phone checklist (only a real phone can prove these)

- [ ] **Cross local midnight on a real phone, and the future day unlocks.** Open tomorrow on Today, Diet and Workout, then either leave the app open over midnight or change the phone's date to the next day and bring the app back. Expected: the day is today; Start workout, Eaten as planned and Something different appear; the "Logging opens on the day." / "Opens on {day}" notes are gone. The midnight timer and foreground refresh (`useLocalToday`) are unit-tested; the simulator run cannot change the date mid-flow.
- [ ] After Z12-57 (system theme) and the tabs' v3 opt-in (Z12-42, Z12-44, Z12-46): the future-day banner, the "Opens on" note and the read-only planned meal follow a live light/dark switch.

## Hand-off

`apps/mobile/src/trainee/PlannedMealSheet.tsx` (TR-07j without its actions) goes to **Z12-42**, which grades TR-07j, to reuse or replace when it builds the planned meal detail with actions.
