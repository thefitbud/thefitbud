# Z12-38 QA: one in-app banner and toast queue

Spec: `docs/specs/Z12-38.md`. Mocks: TR-06h, TM-13b (banners); TR-07b, TR-26f, TM-04m (toasts, whose screens are built by Z12-42/43 and Z12-50 on this queue).

## What changed, in one paragraph

`NoticeHost` (mounted once in `AppRouter`, around both roles' screens) owns one notice queue with two lanes. Banners show at the top, one at a time, clear of the status bar, and leave after about 4 s, on a swipe up, or on a tap that opens their target. A coach note is then marked read. Toasts (`Snackbar`, same call signature) still draw where their screen puts them, but only while they are the queue's current toast. They leave after 6 s if they have an action (Undo, View), 4 s if not, or on a tap outside an action toast. The trainee meal and coach-note banners and every push received while the app is open go through the queue, for the signed-in role only.

## Expo-web screenshot check (D-W12-34)

Method: local API on port 8791 against this worktree's own D1 (`pnpm db:reset`), `expo start --web` with `EXPO_PUBLIC_API_BASE_URL` pointing at it and `EXPO_PUBLIC_SCREEN_CAPTURE=1`, Playwright Chromium at 393×852 @2x, `colorScheme` light and dark. State came from the real API: Rahul shared a coach note with Aarav (`POST /checkins/relationships/:id/notes`, visibility `client`), and Aarav asked about a meal (`POST /coach-asks`), which gives Rahul a real `trainer_ask_coach` notification. TR-06h is the trainee foreground banner reading that state on Today. For TM-13b, Rahul is on Clients and that notification's routing payload is handed to the real receive handler (`createForegroundPushHandler`, through the capture-mode `__fitbudReceivePush` hook, because Expo web has no push delivery).

| Shot | Mock | Grade | Notes |
|---|---|---|---|
| `TR-06h-light-web.png` | TR-06h light | CLOSE | Card, avatar (coach "RV" on `--coach`), "now", the two-line note match. The title reads "Rahul has a note for you", not "Rahul left a note": the copy is `noteBannerCopy` in `notifications/copy.ts`, owned by Z12-47 (all push copy). The Today behind it is still v2 (Z12-46). The card is opaque `--card`, not `--glass` with a blur (D-W12-33). |
| `TR-06h-dark-web.png` | TR-06h dark | GAP (expected) | Today has not opted in to dark yet (Z12-46), and the banner follows the open screen's theme (`useBarScheme`), so it is light. With an opted-in screen it uses the same tokens in dark: `--card` fill, a hairline `--edge`, no shadow. |
| `TM-13b-light-web.png` | TM-13b light | CLOSE | Client avatar "AS" on `--brand-tint`, title, "now", body. The copy is the app's `trainer_ask_coach` copy ("Aarav Shah asked on WhatsApp" / "Open the item they asked about."), not the mock's "Aarav asked you" / "Mentions pain · Romanian deadlift". That copy is `trainerNotificationCopy` in `@fitbud/core`; changing it belongs to Z12-47, and the topic line would need the ask's details. |
| `TM-13b-dark-web.png` | TM-13b dark | GAP (expected) | Clients has not opted in to dark yet (Z12-53), so the banner is light, as above. |

The script waited for each banner to leave on its own after the screenshot: 3.8 s after the shot, which was taken about 0.4 s after the banner appeared, so about 4.2 s in all. No console error came from the new code. The remaining web console errors were already there before this change: the realtime WebSocket through the Metro proxy, and `accessibilityElementsHidden` on TraineeShell's tab bar.

## Device runs

Flows (D-W12-34, exactly these): `launch` (trainee Today, trainer Needs you), `device/z12-38/1-trainee-note-banner.yaml` and `device/z12-36/3-trainee-workout.yaml`.

- **TR-06h flow:** signs in as Aarav and goes to Progress. While he is there, the coach shares a note through the local API (`share-note.js`, run on the Maestro host against the runner's local API). Going back to Today shows the banner below the status bar (screenshot `TR-06h`). The flow checks the banner leaves by itself. It then does a swipe up (screenshot `z12-38-after-swipe`, which shows it gone) and a tap that lands on Today. Each step uses a new note. The "gone at once, not after 4 s" timing of the swipe is proved by `NoticeHost.render.test.tsx` and Z12-58's phone checklist, not on the simulator (approved by the orchestrator).
- **W-03 trainee workout flow:** where the D-W12-33 shadow ADVICE lines appeared.

**D-W12-33 evidence: run 43715594740, iOS PASS.** All 8 flows passed in light and dark, the W-03 workout flow included, the device log was clean and `allowed: []`. That run's harness came from `main`, where the D-W12-33 allow-list entry was still live, so an allowed count of 0 means the shadow lines were not logged at all. Every later run's log scan was clean with 0 allowed, on both platforms.

**Review-fix device run: 44094063791 at `494c7ce`** (app ref `claude/Z12-38-notice-queue`, `main` merged with #457; flows `launch,z12-38`; every job log's `app:` line is `494c7ced`). One flake re-run was allowed and used (attempt 2 re-ran iOS only):

| Attempt | Android light | Android dark | iOS light | iOS dark | Device log |
|---|---|---|---|---|---|
| 1 | 3 / 3 | 3 / 3 | 2 / 3 (TR-06h tap step: "banner is visible" timed out; the failure frame shows the banner on screen) | 3 / 3 | clean, 0 allowed, both platforms |
| 2 (iOS re-run) | (attempt 1) | (attempt 1) | 3 / 3 | 2 / 3 (TR-06h step 1: the banner was still up after the 8 s wait to leave) | clean, 0 allowed |

So every flow passed on both platforms and in both themes in at least one attempt, but iOS was not green in one attempt. The iOS dark failure in attempt 2 is the "TR-06h outlives its 4 s on iOS" symptom below, in step 1, before any swipe, so it is not caused by the review fixes (none of them touch the banner timer). It is intermittent: run 44083550447 at `eef488a` passed it in both themes, and this run passed it in 3 of 4 iOS theme runs. Screenshots in this folder: Android from attempt 1; iOS TR-06h (light and dark) and after-swipe light from attempt 2; after-swipe dark iOS from attempt 1.

Previous device run: 44083550447 at `eef488a`, first attempt, iOS and Android 6 / 6 each, logs clean, 0 allowed.

**TR-06h on iOS: root cause and fix.** In runs 43744259140, 44063388981 and 44069358004 (attempt 2) the iOS banner was still fully on screen when the flow's 8 s wait to leave ran out (Android always passed). The failing frame is identical to the `TR-06h` screenshot taken before the wait: the banner never started to leave, so its dismissal never ran. The queue removed a banner with one `setTimeout(4000)`. React Native's iOS timer module (`RCTTiming.mm`, old architecture, RN 0.76) does not run a timer due more than 1 s away (`kMinimumSleepInterval`) on its display link: it pauses the display link and parks the timer on one shared `NSTimer` (`_sleepTimer`) in `NSDefaultRunLoopMode`, on whichever thread's run loop scheduled it (the main thread's when a resign-active notification, such as a system alert, lands while timers are pending); later long timers only move that timer's fire date. Android's timer module has no such path. So the 4 s dismissal depended on a default-mode run loop the app does not control, which the simulator under accessibility polling did not service in time. Nothing in the app re-armed the timer: `showBanner` drops a key already shown, and screen changes and Today's reloads never restart it. The queue now removes an item at a **wall-clock deadline** checked on ticks of 250 ms or less (`NOTICE_TICK_MS`), which stay on the display link, and a late or early tick only re-reads the clock. The banner's slide-out also swaps after a 400 ms fallback if the animation never reports back. The flow's waits and assertions are unchanged. Run 44083550447 passed it; run 44094063791 (attempt 2, iOS dark) shows it can still happen on the CI simulator, so the deadline ticks narrowed the problem but did not remove it there (open, see follow-ups). I could not read the simulator log (the artifact host is not reachable from this session), so the exact trigger on the CI simulator is inferred from `RCTTiming.mm`, not observed. Note also that this run left out the z12-36 flow, whose gallery link used to leave a system alert before z12-38.

Earlier runs, for the record: 43715594740 (iOS 8 / 8; Android light: a launch flake, and the TR-06h banner missed after a cold relaunch), 43719430750 (Android 8 / 8; iOS light DeviceUnreachableException), 43741069030, 43744259140 and 44063388981 (flow fixes between them, see the commits), and 44069358004 at `8a6e1b5` (every flow passed in at least one attempt, but no attempt was green on both platforms: sign-in keystroke flakes and the TR-06h iOS wait above).

## Decisions (decided and noted)

1. **Two lanes in one queue.** Banners and toasts each show one at a time, but a toast does not wait behind a banner. They sit at opposite edges, and a toast answers something the person just did: an Undo waiting 4 s behind a banner would be wrong.
2. **Toasts draw where their screen puts them.** The queue decides when they show and when they leave. Each caller's layout (the `toast` footer slot above the tab bar, or the end of the screen) already matches its frame, so moving every toast to one host position would move them off their frames.
3. **Same-screen suppression covers entity screens only** (a meal, a workout, a check-in). A tab never suppresses a banner: a coach note opens Today, and TR-06h paints its banner over Today.
4. **Once per session per item.** A banner key (`meal:<id>`, `note:<id>`, `notification:<id>`) shows at most once per app session, so a still-unread item does not come back each time Today remounts. A push and Today's read of the same note make one banner.
5. **Opaque fill (D-W12-33).** The new banner uses `--card`, with the level-3 shadow in light, a hairline edge and no shadow in dark. The old `InAppBanner`, still used by the hostless fallback, Today's check-in reviewed banner (Z12-46's file) and the widget-tips preview, went from `rgba(250,249,253,0.97)` to the opaque `#FAF9FD`. The D-W12-33 allow-list entry and its README line are removed, and `harness.test.mjs` now requires an empty list.
6. **The banner follows the open screen's theme** (`useBarScheme`), so it is never dark over an un-migrated light screen.
7. **Hostless fallback.** Outside `NoticeHost` (render tests, the primitive gallery), `Snackbar` and `ForegroundBanner` draw in place as before. Existing callers and tests need no change.
8. **Foreground pushes.** The app sets no foreground notification handler, so expo-notifications shows no system banner while FitBud is open (unchanged). The push reaches `addNotificationReceivedListener`, and the banner's words come from the authoritative notification record (or the coach note), with the app's copy as the fallback. A tap routes like a system notification tap (`handleNotificationOpen`) and marks the notification read. Pushes queue in arrival order even when one needs an extra read.
9. **Reduced motion:** no slide or fade; a swipe dismisses at once. Every banner and toast is announced once, through `announceForAccessibility` on both platforms (the toast has no live region as well, which made Android read it twice); a banner also has a VoiceOver escape action to dismiss it.
10. **Device evidence for the gestures** (approved by the orchestrator): the flow screenshots the screen right after the swipe and waits generously for the banner to go. The "gone at once" timing is proved by `NoticeHost.render.test.tsx` and Z12-58's phone checklist, because simulator accessibility snapshots are too slow to time a 4 s banner.
11. **Capture-mode push hook.** In `EXPO_PUBLIC_SCREEN_CAPTURE=1` builds only (Expo web QA), `globalThis.__fitbudReceivePush` hands a payload to the real receive handler, because web has no push delivery. Used for the TM-13b web screenshot.
12. **Review fixes (one round).** A swipe takes the banner off the queue on release (the fling is only looks). A push still being read when the session changes is dropped (the queue's epoch, bumped by `reset()`, plus the role and user it was received for). The same toast asked for again with a new action restarts its time, capped at twice its time from when it came up, silently; a toast that already left is not brought back by a re-render.

## Not covered here (follow-ups)

- **Harness:** (1) iOS `DeviceUnreachableException` on a whole theme (run 43719430750). (2) `device/z12-36/3-trainee-workout.yaml` ends by opening the gallery deep link, which leaves the iOS "Open in FitBud Staging?" alert for the next flow (run 43741069030). The z12-38 flow now dismisses it. (3) Maestro drops keystrokes on sign-in: the password typed into the email field, or a truncated or garbled email (runs 43719430750, 44063388981, 44069358004). (4) The gate cannot send a push in the middle of a flow, so TM-13b and the real foreground-push path cannot be shown on a device. (5) On `main`, `device-harness-tests` fails `scripts/qa/mobile-build.test.mjs` (`run-maestro` flow-directory order guard), because `flows/v3` (F29, Z12-39) changed the sort. (6) Still open, intermittent: the TR-06h banner outliving the 8 s wait on the iOS simulator (see "TR-06h on iOS" above; run 44094063791 attempt 2, iOS dark). Android never shows it. It needs the simulator log (not reachable from the agent session) to tell a simulator JS-timer stall from an app defect; Z12-58's real-phone check covers the 4 s on a device.

- **Trainer same-screen suppression.** `TrainerShell.tsx` is not in this task's `files_owned`, so trainer screens do not report their screen key. A trainer banner is never suppressed. `useNoticeScreen(key)` is ready for the trainer lane (Z12-53).
- **Today's check-in reviewed banner** (`trainee/today/ReviewedBanner.tsx`, Z12-46's file) is still drawn by Today, not queued. It waits while a queued banner is up (`bannerSlot`), as before, but it has no timer or swipe. Z12-46 moves it onto the queue with `queue.showBanner` (`useNoticeQueue()`).
- **Copy:** "left a note" (TR-06h) and "asked you" plus the topic line (TM-13b) are Z12-47's copy.

### For Firoz's real-phone checklist (Z12-58)

- With FitBud open on Today, have the coach share a note (a real push). Expected: one banner below the status bar with the note, gone by itself in about 4 s, no system banner on top of it.
- Same again, then swipe the banner up. Expected: it leaves at once. Same again, then tap it. Expected: Today, and the note no longer unread in Notifications.
- Two coach actions a few seconds apart (a note, then a plan publish). Expected: two banners one after the other, never stacked.
- Trainer phone on Clients when a client asks a question (a real push). Expected: one banner with the client's initials (TM-13b), about 4 s, tap opens Attention.
- With iOS Reduce Motion on: the banner appears and leaves without sliding.
- With VoiceOver / TalkBack on: each banner and toast is read out once.
