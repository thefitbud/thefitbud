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

## Device run

See the PR for the run id, the flows and why they cover the change. Flows: `launch` (trainee Today, trainer Needs you), `device/z12-38/1-trainee-note-banner.yaml` (TR-06h: shows, leaves by itself, swipe up, tap) and `device/z12-36/3-trainee-workout.yaml` (D-W12-33: where the iOS shadow ADVICE lines appeared).

## Decisions (decided and noted)

1. **Two lanes in one queue.** Banners and toasts each show one at a time, but a toast does not wait behind a banner. They sit at opposite edges, and a toast answers something the person just did: an Undo waiting 4 s behind a banner would be wrong.
2. **Toasts draw where their screen puts them.** The queue decides when they show and when they leave. Each caller's layout (the `toast` footer slot above the tab bar, or the end of the screen) already matches its frame, so moving every toast to one host position would move them off their frames.
3. **Same-screen suppression covers entity screens only** (a meal, a workout, a check-in). A tab never suppresses a banner: a coach note opens Today, and TR-06h paints its banner over Today.
4. **Once per session per item.** A banner key (`meal:<id>`, `note:<id>`, `notification:<id>`) shows at most once per app session, so a still-unread item does not come back each time Today remounts. A push and Today's read of the same note make one banner.
5. **Opaque fill (D-W12-33).** The new banner uses `--card`, with the level-3 shadow in light, a hairline edge and no shadow in dark. The old `InAppBanner`, still used by the hostless fallback, Today's check-in reviewed banner (Z12-46's file) and the widget-tips preview, went from `rgba(250,249,253,0.97)` to the opaque `#FAF9FD`. The D-W12-33 allow-list entry and its README line are removed, and `harness.test.mjs` now requires an empty list.
6. **The banner follows the open screen's theme** (`useBarScheme`), so it is never dark over an un-migrated light screen.
7. **Hostless fallback.** Outside `NoticeHost` (render tests, the primitive gallery), `Snackbar` and `ForegroundBanner` draw in place as before. Existing callers and tests need no change.
8. **Foreground pushes.** The app sets no foreground notification handler, so expo-notifications shows no system banner while FitBud is open (unchanged). The push reaches `addNotificationReceivedListener`, and the banner's words come from the authoritative notification record (or the coach note), with the app's copy as the fallback. A tap routes like a system notification tap (`handleNotificationOpen`) and marks the notification read. Pushes queue in arrival order even when one needs an extra read.
9. **Reduced motion:** no slide or fade; a swipe dismisses at once. Every banner and toast is announced (`announceForAccessibility`); a banner also has a VoiceOver escape action to dismiss it.

## Not covered here (follow-ups)

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
