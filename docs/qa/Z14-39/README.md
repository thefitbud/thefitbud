# Z14-39 QA: trainer More stays loaded

No new frames; layout and copy are unchanged. Steps for a device or Expo-web check as a trainer:

1. Open More. The "Coach · N active clients" line loads.
2. Tap Clients, then More again. The screen and the count are shown in the same render, with no bare "Coach" flash and no remount.
3. Return after more than 30 s away: the count refreshes quietly underneath. Offline, the old count stays and the offline notice shows.
4. Attention, Clients and Check-ins behave as before. Signing out unmounts the whole shell, so no other user's count carries over.

Automated: `TrainerShell.keptTabs.test.tsx` (More stays mounted, no remount) and `MoreScreen.test.ts` (failed or in-flight reload keeps the count).
Trainee More: already in `TraineeShell`'s pane book; not edited (see PR).
