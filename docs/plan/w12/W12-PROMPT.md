# W12 run prompt: build the v3 design in the apps and fix every open device finding

Repo: `thefitbud/thefitbud`, from `main` (at `6ed1410e` or later). Follow CLAUDE.md and AGENTS.md as in W11. Written by FitBud UI, 14 Nov 2026 (IST). The issue-by-issue map is in `docs/plan/w12/ISSUE-MAP.md`.

## 0. What this batch is
1. **Source of truth for design:** `docs/design/v3/` (on `design/v2-handoff` until Z12-31 merges it):
   - `DESIGN-SYSTEM-v3.md`: tokens (light and dark), Inter, the type scale and the components.
   - `kit-v3.css`: token values.
   - `png/` and `png-dark/`: 185 target screens (108 trainee, 77 trainer). Screen IDs are the file-name prefixes; `screen-profile.md` lists every ID with its purpose.
   - `flows/flows.md`: 28 tap-by-tap flows (F01–F17, F02b, F20–F29).
   - `DECISIONS.md` and `CHANGELOG.md`.
   Where a v3 mock and an older frame or spec disagree, the v3 mock wins. Record any case where you depart from a mock, with the reason.
2. **Findings:** fix every finding in `ISSUE-MAP.md`: Firoz's 8 findings from 14 Nov, the open items from 13 Nov, and the trainer "What changed" bug. Each task below names the findings it closes.
3. **Device proof:** from W12 on, **a mobile task isn't done until it has been tapped through on devices.** That means the iOS simulator and the Android emulator, running the PR head as a native app, as both trainee and trainer, in light and dark. Add Firoz's PC emulator when it's reachable. Section 3 has the gate.

### Existing Z12-1 to Z12-30 specs (decided by FitBud UI, 14 Nov)
- `docs/specs/batches/W12.md` already holds Z12-1 to Z12-30, the gap buckets written on 2 Nov against the old frames. New tasks in this run start at **Z12-31**, so no ID collides.
- **Z12-18 to Z12-28 (mobile gap buckets): superseded.** The v3 tasks below replace them. In the planning PR (Z12-32):
  - read each one's gap list;
  - fold any item that is still open on main into the matching new task;
  - mark the old spec "superseded by Z12-xx" in W12.md.
- **Z12-29 and Z12-30 (account deletion, beta scope): stay as written.** Run them after Z12-49, built to the v3 mocks TR-20c, TR-20d and TR-22b, and before Z12-58.
- **Z12-1 to Z12-17 (trainer web gap buckets): deferred to W12b.** Only Z12-37 (tokens) touches the web in this run. If usage is under 60% once Z12-60 has merged, carry on with them in W12.md order. Otherwise list them in the report.

## 1. Standing rules (unchanged unless stated)
- One task per PR, merge commits.
  - `ci`, `e2e` and `banned-strings` must be green on the latest head before a merge.
  - No merges while main is red, unless the PR is the fix.
  - Fresh review before every merge.
- Plus one final PR for the batch report (Z12-60).
- **Never cancel or force-cancel GitHub Actions runs.** If runners are backed up, wait.
- `qa-scripts` is not a required check, and stays that way.
- No production deploy. **Hold the staging deploy until the end and deploy once** (Z12-59).
- Keep the repo public. Any change to repo settings (branch protection, required checks, visibility, secrets, Actions settings) needs Firoz's OK first. Ask in the PR and park it.
- Never print, log, screenshot or commit credentials, tokens, keys, `.p8` files or `.env` values. Seed and demo passwords come from the existing env vars only.
- Don't touch #177, #307, Z10-7 (parked) or Z14-*.
- **Decisions:** don't wait for a human. Pick your recommended option, carry on, and record the decision and the reason in the PR and the report.
- **Models:**
  - Opus is the default.
  - Use **Fable 5.2** only for Z12-41 (offline sync), Z12-45 (the workout logging rework) and Z12-60 (the final fresh review).
  - Use Sonnet or Haiku for routine steps (docs, seed, dependency bumps, report).
  - You may switch model when a task really needs it. Validate the result with tests and a fresh review, and record which model you used and why.
- Be careful with usage. Run at most 3 tasks at once, and wrap up at 92% with what merged and what's left.
- Never write the Claude mention handle (an at-sign followed by "claude") anywhere: PRs, commits, comments or docs.
- Captures go in `docs/qa/<task ID>/`. Never claim a pixel match. Grade MATCH, CLOSE or GAP, and list what remains.
- **Native changes are cleared for this batch (FitBud UI, 14 Nov), but only the ones listed in Z12-57.** They all land in that one PR, so there is a single rebuild. Every other task stays JS-only. If a task finds it needs a native change, it builds a JS fallback, notes it, and adds the change to Z12-57.
- Serialise anything that touches the local D1 (Z12-34, Z12-39 server part, Z12-43 server part, Z12-50 server part, Z12-58).

## 2. Tasks, in order

Each task lists:
- the mock screens it must match (Done = reachable in the app and graded MATCH or CLOSE against the mock in both themes);
- the findings it closes;
- its device check.

"Device check" always means the gate in section 3 plus the steps named.

### Phase A: docs, privacy and tooling

**Z12-31 · Merge `design/v2-handoff` into main (docs only)** · Haiku
- One PR, `design/v2-handoff` → `main`. It is ahead of main by docs-only commits (`docs/design/v2`, `docs/design/v3`, `docs/plan/w12`) and behind by none.
- Check the diff touches nothing outside `docs/`. If it does, stop and report.
- Done when: merged, and `docs/design/v3/png/trainee/TR-26e-custom-food.png` exists on main.

**Z12-32 · Planning PR** · Opus
- Update `docs/specs/batches/W12.md` with:
  - this run (Z12-31 to Z12-60);
  - the lanes and files owned;
  - the decisions in section 5;
  - the Z12-1 to Z12-30 handling from section 0.
- Write a short spec for each new task, `docs/specs/Z12-31.md` onwards.
- Create `docs/qa/W12/` with `parity.md` (template in section 3) and `maestro-map.md` (flow ID → Maestro file).
- Re-grade the lenient W11 MATCHes (frames 45 and 31, the ds5 web sign-in) as CLOSE.
- Done when: merged before any code task.

**Z12-33 · Trainer cache late-write guard (privacy, first code PR)** · Opus
- `trainer/cache.ts` and `AuthProvider` `applyMe`:
  - add an owner or epoch token on every cache write, so a fetch started under trainer A that resolves after A signs out and B signs in is dropped;
  - clear the previous owner's keys when the userId changes.
- Tests for both.
- Device check: sign in as rahul.coach, sign out, sign in as another trainer on the same simulator, and confirm no data from the first account shows.

**Z12-34 · Quick reseed and seed fixes** · Sonnet
- `pnpm db:reset` takes about 20 minutes on Firoz's Windows PC: 38 MB, 4,127 statements. Fix that:
  - batch the demo seed import (multi-row inserts, chunked files, one `wrangler d1 execute --file` per chunk, or the fastest route you measure);
  - add `pnpm db:reseed`, which wipes and reloads only the demo data, not migrations or the library, when the schema is current.
- Measure both on Linux and record the numbers. Target: reseed under 2 minutes.
- **Rename the seed's Priya to "Priya Nair"**, matching the mocks (TM-02a, TM-04l, TM-12b, TM-13b).
- Keep the demo accounts (aarav.ontrack, karan.dual, rahul.coach and the rest) and their personas as in `flows/flows.md`.
- Add a no-plan trainee to the seed (needed by Z12-47), plus at least one client with push off and one with reminders paused (Z12-51).
- Make the seed's "today" relative, so future and past days exist around the run date.
- Device check: none (no mobile change). Run `db:reseed` and paste the timing in the PR.

**Z12-35 · Device gate harness** · Opus
- Scripts under `scripts/qa/device/`:
  1. Build and launch the PR head as a native app:
     - iOS simulator, latest iOS and Xcode on the runner;
     - Android emulator, latest stable API image.
     Both run against the **local seeded API** (never staging).
  2. Switch theme: `xcrun simctl ui booted appearance light|dark`; `adb shell cmd uimode night yes|no`.
  3. Go offline and online:
     - Android: `adb shell cmd connectivity airplane-mode enable|disable`;
     - iOS simulator: stop the API or block its host, and record which.
  4. Send pushes: `xcrun simctl push` with the app's payloads, and FCM test payloads (or `adb` broadcast) on Android.
  5. Capture screenshots named `<screen ID>-<theme>-<platform>.png` into `docs/qa/W12/shots/`.
  6. Collect device logs (`xcrun simctl spawn booted log stream --predicate` for the app; `adb logcat`). **The run fails on any crash, red box, LogBox error or warning, or JS console.error or console.warn.** Allow-list nothing without a written reason in the PR.
- Extend `common/assert-no-crash.yaml` with "Requiring unknown module", "Encountered two children", "Each child in a list", "VirtualizedLists should never be nested" and "Possible unhandled promise".
- A vitest setup that fails any test on `console.error`, if it isn't on main yet.
- Generate `docs/qa/W12/parity.md` rows from `docs/design/v3/screen-profile.md`.
- Lock-screen taps: Maestro can't tap the lock screen. Use XCUITest springboard queries or `idb ui tap` on iOS, and UiAutomator on Android, for the lock-screen notification and Live Activity taps.
- Done when: the harness runs on main, and an example run on the current app is attached (failures expected).

### Phase B: foundations

**Z12-36 · Mobile token layer, theme and Inter** · Opus
- `packages/tokens`:
  - add the v3 tokens in light and dark from `docs/design/v3/kit-v3.css`, plus its "v3 additions" block;
  - generate them, don't hand-copy;
  - add a test that diffs `tokens.ts` against `kit-v3.css`.
- Mobile:
  - add `ThemeProvider` and `useTheme()`, which follow the system setting (`Appearance`, live updates) with no in-app switch;
  - status bar and navigation bar follow the theme;
  - replace Satoshi with Inter (`@expo-google-fonts/inter` through the existing `expo-font`/`FontsProvider`, JS only) and apply the type scale;
  - rebuild the shared primitives on tokens (Screen, Text, Button, Card, Chip, Pill, Sheet, TabBar, ListRow, Badge, Toast host).
- Screens migrate in their own tasks. Here, keep existing screens rendering correctly in light, and don't regress any test.
- No hard-coded hex in primitives: add a lint rule.
- Mocks: the anchors TR-06a, W-03, TR-07a, TM-01a and TM-04b for primitives only (colours, type, radius).
- Device check:
  - flip the system theme with the app open on both platforms, and the app changes live;
  - no unreadable text on any primitive (screenshots in both themes);
  - the Inter weights render.

**Z12-37 · Trainer web tokens** · Sonnet
- `packages/tokens/src/tokens.css` and the web theme use the same v3 tokens and Inter.
- Light only on web for now (decision 8): define the dark variables but don't switch them on, since there are no v3 web dark mocks.
- No web layout changes.
- Done when: the web e2e and visual checks pass, before/after captures of 5 pages are in `docs/qa/Z12-37/`, and contrast is checked.

**Z12-38 · In-app banner and toast system** · Opus · closes finding 8
- One queue for in-app notifications and toasts, showing one at a time:
  - **auto-dismiss after about 4 s;**
  - **swipe up to dismiss;**
  - **tap opens the target and marks the item read;**
  - never covers the status bar;
  - no banner for the screen you're already on;
  - reduced motion respected;
  - an accessibility announcement.
- Toasts with an action (Undo, View) stay 6 s and dismiss on tap outside.
- Mocks: TR-06h, TM-13b (banners), TR-07b (undo toast), TR-26f (saved toast), TM-04m (sent toast).
- Device check, both roles:
  - trigger a coach-note push while the app is open (TR-06h) and on Clients (TM-13b);
  - it disappears by itself in about 4 s; a swipe removes it; a tap lands on the right screen;
  - two in a row queue and don't stack.

**Z12-39 · Future days are view only (decision 1)** · Opus · closes finding 5
- **Client:**
  - on a day after today in the trainee's zone, Today, Diet and Workout show the plan with **no logging actions**;
  - Diet and Workout show the "Opens on {day}" note; Today keeps "Logging opens on the day.";
  - no Start workout, no Eaten as planned, no Something different, no ⋯ log actions;
  - tapping a planned meal opens the read-only planned meal detail (TR-07j without actions).
- Past days stay loggable as late logs, with the existing edit-window rules (TR-06c, TR-07f).
- **Server:** reject meal, workout, set and measurement logs whose civil date is after the trainee's today in their zone. Use 422 `FUTURE_DAY` with the CU17 zone resolver, and no `"Asia/Kolkata"` literals. Write a test for each endpoint, including the zone edge at 23:30 and 00:30.
- Mocks: TR-06d, TR-07k, W-01e (flow F29); TR-06c and TR-07f stay as they are.
- Device check:
  - walk F29 on both platforms;
  - try every log entry point on a future day (none visible);
  - change the device date to cross midnight, and the day unlocks;
  - a direct API call for a future date returns 422.

**Z12-40 · Moving between days: fast week strip, swipe, cache, same scroll** · Opus · closes finding 6
- Shared day state for Today, Diet and Workout, plus:
  - a fast week strip (tap a day → content swaps from cache in under 100 ms);
  - **swipe left or right on the body to change day**;
  - a per-day cache keyed by relationship and civil date, stale-while-revalidate, prefetching ±3 days;
  - **no spinner flash when a day is cached** (TR-06f's skeleton only on a first load with no cache);
  - **the same scroll position** for each tab when moving between days;
  - the header reads "Thursday, 12 Nov · past day" or "Monday, 16 Nov · planned" as in the mocks;
  - today's dot is the coral ring.
- Mocks: TR-06a, TR-06c, TR-06d, TR-07a, TR-07k, W-01a, W-01e.
- Device check:
  - swipe through 7 days and back on both platforms;
  - record a screen video or a perf trace showing no spinner on cached days and the time to content;
  - the scroll offset is kept;
  - no dropped frames worse than the platform's "janky" threshold (record the number).

### Phase C: trainee core

**Z12-41 · Offline sync and cold-start offline** · **Fable 5.2** · closes finding 2 and 13 Nov #2 (cold start)
- **Finding 2:** on 13 Nov, with mobile data off, Sync said it couldn't sync, yet the backend returned 200 when Firoz tapped Sync now.
  - Likely cause: his phone still reached the local API over Wi-Fi, so the send worked, but the status came from a stale error or the outbox state wasn't updated after the 200.
  - Reproduce first, with device logs and the D1 rows, then fix the root cause.
- Rules:
  1. The sync status comes only from the outbox's real state (waiting, sending, sent, failed with a reason), never from a stale flag. A 200 removes the item and clears the pill.
  2. The queue sends on its own: on reconnect (NetInfo when the native module is present, see Z12-57; until then a reachability probe), on app foreground, every 30 s while the queue isn't empty, and after any successful API call.
  3. "Try sending now" (TR-19a) shows Sending…, then the result, and the pill clears when the queue is empty.
  4. Idempotent sends: client mutation IDs, server dedupe, no double rows after retry.
  5. Conflict when the coach changed the plan meanwhile (TR-19b).
  6. **Cold start offline:** persist a me plus relationship snapshot (keyed by userId, cleared on sign-out, like the Z11-8 trainer cache), so the app opens on cached data with no network instead of the error screen.
- Mocks: TR-19a, TR-19b, TR-06e, TR-07d, W-20, TR-14e, TR-20f (sign out with unsent items); flows F06 and F10.
- Device check (both platforms):
  - go offline;
  - log a meal, a set and a weight;
  - see the "Saved on phone" states;
  - kill and relaunch offline, and the app opens on cached data;
  - go online, and everything sends without a tap;
  - **compare the outbox with the D1 rows** (counts and IDs; no duplicates, no losses), and paste the query and result in the PR;
  - repeat with Sync now;
  - repeat Firoz's case (data off, Wi-Fi on to the local API).

**Z12-42 · Diet day v3** · Opus · closes 13 Nov #8 (Diet values misaligned)
- Build Diet to v3.
- The ring number fits: `adjustsFontSizeToFit`, one line, `maxFontSizeMultiplier` 1.2, checked at 1,771 and 12,345.
- Macros sit on one line each ("104 / 102 g").
- A locked row shows no Change: add `!isLocked` (DietTab around line 517) and a test.
- Round once on the day sum (no "1,746 of 1,745").
- Over budget, no meals planned, and load error states.
- Mocks: TR-07a to TR-07j; the TR-07k shell (from Z12-39); flows F07 and F09.
- Device check:
  - Aarav's Thu 12 and today, in both themes, at the largest system font size;
  - nothing overflows or wraps (screenshots);
  - a locked meal has no Change.

**Z12-43 · Manual food logging v3** · Opus · closes finding 7 and 13 Nov #10
- **Food search (TR-26a to TR-26d):**
  - add optimistically, and fetch servings in the background (`addFood` must not await the network);
  - pressed style, then a ✓ and a count badge on the result;
  - "In this log · N" with "just added" in view;
  - debounce double taps;
  - tapping a row opens the amount picker (TR-26c, katori, piece, cup, grams);
  - show the real default serving label (no hard-coded "1 piece").
- **No match (TR-26d):** "Create “{query}”" opens TR-26e; "Log as Ate out" opens TR-08c.
- **Create a food (TR-26e):**
  - name, amount and kcal are required; protein, carbs and fat are optional;
  - "Save to my foods" is on by default;
  - the coach sees it as "added by {client}".
  - Use the existing trainee custom-food endpoint if there is one. Otherwise add an owner-scoped one (for example `POST /me/foods`). Record which.
  - Saved foods show in Recent and search for that trainee only.
- **Saved confirmation (TR-26f):**
  - after Save, return to Diet with the row reading "Logged myself · …", ticked, with kcal;
  - the ring updates;
  - the toast "{Meal} saved · {kcal} kcal" with View (Z12-38).
- **Something different (TR-08a to TR-08c):** Changed the portion and Ate out keep the Z11b-5 fix, on v3 styling.
- Mocks: TR-26a to TR-26f, TR-08a to TR-08c; flows F07 and F08.
- Device check:
  - walk F08 end to end on both platforms: search "roti" → add → saved; then search "ragi dosa" → Create → saved;
  - the ring and row change, and the toast shows and goes;
  - a double tap adds one line;
  - offline, the create and log are queued and sent (with Z12-41);
  - the coach sees the custom food on TM-12a.

**Z12-44 · Workout tab and summary v3** · Opus · closes finding 4 and 13 Nov #6
- A finished day shows **only "View summary"**, never Start workout (W-01c), on Today and Workout alike. Add a test for each status: not started, in progress, done, missed, rest, future.
- Summary week dots and the count come from one source (patch the finished assignment to completed before rendering both).
- The duration survives pause and resume.
- Mocks: W-01a to W-01e, W-17a, W-17b, TR-10a, TR-10c; flow F03 (summary part).
- Device check: finish a workout on both platforms. The tab and Today show View summary only; the dots match the count; kill and relaunch, and it's still right.

**Z12-45 · Active workout v3 (workout logging rework)** · **Fable 5.2** · closes 13 Nov #9
- Build the active log to the W- mocks:
  1. **Finish early** from mid-session (W-16), and Back or minimise to the minimised bar (W-14).
  2. Exercise ⋯ menu (W-09): skip, replace, note, ask coach.
  3. Swipe a set to Skip or Delete (W-08); skipped with Undo (W-09b).
  4. Tap a logged set to edit, undo or delete (W-13).
  5. Move between exercises freely; overview through the list.
  6. Rest bar (W-05a, W-05b): **haptic and sound at rest end** (react-native `Vibration` until Z12-57 adds `expo-haptics`). The rest time matches the Live Activity to the second.
  7. "How to" opens exercise detail How to (W-27), not Ask coach; History (W-26).
  8. **Pause is labelled and placed away from Back** (W-19).
  9. Keep-awake on (already JS-safe since Z11b-3; switch to `expo-keep-awake` in Z12-57).
  10. PR moment (W-12).
  11. Add exercise (W-21a, W-21b), replace with coach alternatives first (W-22).
  12. Discard (W-15); resume after kill (W-18); offline (W-20); keypad (W-04).
- Mocks: W-02 to W-27 (all), flows F03 to F06.
- Device check:
  - walk F03, F04, F05 and F06 on both platforms;
  - every button, menu item, swipe and sheet on those screens;
  - kill mid-workout and resume;
  - go offline mid-workout (with Z12-41);
  - leave the screen idle 3 min and it stays awake.

**Z12-46 · Today, Progress and check-in v3, the no-plan state, and no raw API errors** · Opus
- Build these screens to v3:
  - Today (TR-06a, TR-06a2, TR-06b, TR-06e to TR-06h; day logic from Z12-39 and Z12-40);
  - Progress (TR-13a to TR-13e);
  - check-in (TR-14a to TR-14g).
- **No-plan state:** a trainee with no plan sees "Your coach is setting up your plan" style empty states, never a server message:
  - Today;
  - Workout (TR-10b);
  - Diet (TR-07c);
  - check-in.
  Today has no dedicated mock: use TR-10b's pattern and record it.
- Sweep for raw API errors on these screens and on Diet (the frame-102 Diet 500 banner): map them to TR-21 or the inline error states (TR-06g, TR-07i).
- Mocks: as listed; flows F01 (last step), F11, F12.
- Device check: F11 and F12 on both platforms; sign in as the no-plan trainee and see the empty states on every tab.

**Z12-47 · Push notifications and the inbox v3** · Opus · closes finding 3
- **Push copy and presentation** (`notifications/copy.ts`, `androidChannels.ts`, `register.ts`):
  - every type has a short title and a body that fits two lock-screen lines (TR-15c, TM-13a);
  - iOS `threadIdentifier` per type, so they group, plus a summary;
  - the app icon and coach name are right;
  - no "FitBud ·" duplicated in the title.
- **Taps:** every type deep-links to its screen, from cold start, background and foreground (`openListener.ts`, `routing.ts`).
- **Inbox (TR-15a, TR-15b):**
  - Today, Yesterday and Earlier groups;
  - an unread coral dot;
  - coach rows in coach tint;
  - Read all;
  - "Notifications are kept for 30 days.";
  - a tap opens the target.
- Mocks: TR-15a, TR-15b, TR-15c, TM-13a; flow F13.
- Device check:
  - send every push type with `simctl push` and on Android, with the app killed, in the background and in the foreground;
  - screenshot the lock screen and Notification Centre in both themes (nothing cut off);
  - tap each, and it lands on the right screen;
  - the inbox matches TR-15a.

**Z12-48 · Lock-screen Live Activity v3** · Opus · closes finding 1 (the Live Activity part) and 13 Nov #7
- **JS** (`liveActivity.ts`, `liveActivitySession.ts`):
  - bodyweight sets print "Set 3 logged · 12 reps" (no "0 kg");
  - never print 0 reps (fall back to the plan, or omit the line);
  - when crossing exercises: "Push-up done · Next: Shoulder press, set 1 of 3".
- **Swift** (`targets/FitBudLiveActivity/`), landing in Z12-57:
  - the layout follows TR-15d exactly: fixed 160 pt, each text at most 2 lines, title row with the timer, exercise and set position, Last and Target (coach colour), the buttons "Log {target}" and "Open", and a coral progress line;
  - the tile tap and Open deep-link to the active log (W-03);
  - `LogSetIntent` logs only the set and **never marks the workout finished while exercises remain**, and JS owns the advance;
  - Dynamic Island compact and expanded views from the same data.
- Android: the ongoing workout notification shows the same lines and the rest timer, and its tap opens W-03. There is no Android layout mock; use a standard notification with these lines, and record it.
- Mocks: TR-15d; flow F13 (Open → W-03).
- Device check:
  - on the iOS simulator, start a workout, lock, and screenshot the Live Activity in both themes (complete, not cut off);
  - tap Log, and the set is logged and the workout continues;
  - tap Open and the tile, and both land on W-03;
  - log the last set of exercise 1 from the lock screen, and the workout isn't finished.
  - The Swift parts are proven on the Z12-57 build; until then JS lines only.

**Z12-49 · Trainee More, settings, onboarding and system screens v3, plus role switching** · Opus
- Build these screens to v3:
  - TR-01a to TR-01g;
  - TR-02a, TR-02b;
  - TR-03, TR-04, TR-05;
  - TR-16a, TR-16b;
  - TR-18;
  - TR-20a to TR-20g;
  - TR-21, TR-22a, TR-22b, TR-23, TR-24, TR-25;
  - TM-08a to TM-08d.
- "Switch to coach view" in trainee More is already on main (Z11-14, #420). Keep it, built to TM-08d.
- Add **Back or Cancel on role select when it's opened from More** (never on first run), clearing `roleSelectRequested`.
- **Push received in trainee mode for the coach role:** show the frame-61 role prompt (TM-08c pattern), reusing `pendingRoleSwitch` and `SwitchRoleSheet` (`openListener.ts`, `AuthProvider`).
- Mocks: as listed; flows F01, F02, F02b, F15, F16, F17.
- Device check:
  - F02, F15, F16 and F17 on both platforms, as aarav.ontrack and karan.dual;
  - a coach push arriving in trainee mode from cold start shows the prompt.

### Phase D: trainer

**Z12-50 · Nudge is a FitBud push (mobile and server)** · Opus
- Server, `POST /notifications/relationships/:id/nudges`:
  - add `body`, editable by the coach, 1 to 200 characters, trimmed, with no links;
  - the push **title is fixed as "{Coach first name} nudged you"**;
  - the limit is **2 nudges per client per day** (the client's civil day), counted across activities and every delivery mode, and returns 429 with the TM-04n copy;
  - quiet hours hold the push until they end (TM-04c), while the inbox entry is immediate.
- **Push off** (no token, OS permission off, or FitBud pushes off): deliver to the trainee's in-app inbox only. The response says `delivery: "inbox"`, and the sheet shows the "Push off" label and the TM-04o copy.
- **Reminders paused (decision 4):** the API currently rejects with `REMINDERS_PAUSED`. Change it:
  - a nudge isn't an automatic reminder, so it's allowed, but it's delivered like push off (inbox only, no push);
  - the sheet label reads "Reminders paused", with the copy "{First} has paused reminders. She’ll see this in FitBud, without a notification.";
  - the cap still applies.
  Record the rule in the spec and the API description.
- Mobile `trainer/sheets/NudgeSheet.tsx`:
  - stop opening WhatsApp;
  - the template chips (Gentle, Check in, Reschedule) prefill the body;
  - the preview is tappable to edit (TM-04b);
  - Send calls the endpoint;
  - on success, TM-04m (state on the item plus the toast); the limit is TM-04n; push off is TM-04o; quiet hours is TM-04c;
  - WhatsApp stays only as the "Message on WhatsApp" redirect in the ⋯ menu (TM-04j).
- Phone copy: `notifications/copy.ts` `activity_nudge` uses the server title and body.
- Trainer web: check its Nudge uses the same endpoint, title rule and body. Align it in this PR if not.
- Mocks: TM-04b, TM-04c, TM-04m, TM-04n, TM-04o, TM-03j, TR-15a (nudge row), TR-15d (nudge push under the Live Activity); flows F20 and F25.
- Device check:
  - nudge Rohan from the trainer simulator and receive it on the trainee emulator (real push through the local API's push provider, or the sim push path if no provider; record which), then tap it and land on the item;
  - a third nudge in a day is refused;
  - the push-off and paused clients get inbox-only;
  - during quiet hours, the push is held.

**Z12-51 · Trainer review sheet wiring v3** · Opus
- Wire every exception action:
  - Resolve… → TM-04d (outcome, private note, lock helper), then TM-04e or TM-04f;
  - ⋯ → TM-04j (Add note → TM-04k, WhatsApp redirect, profile);
  - not found (TM-04g), offline (TM-04h), ended (TM-04i), off-plan review (TM-04l);
  - reach the resolved and all-resolved states on Needs you.
- Mocks: TM-04a, TM-04d to TM-04l; flow F21.
- Device check: F21 on both platforms, every action on every sheet.

**Z12-52 · Coach logs a meal: "What changed" options** · Sonnet · closes the trainer "What changed" finding
- `trainer/clientlog/meal/ClientLogMealScreen.tsx`: today every "What changed" chip only selects a kind and the one Note box shows.
- Build it to TM-15a: "Something different" opens the trainee editor flow (TR-08a), and each choice opens its own editor:
  - Changed the portion → TR-08b steppers;
  - Ate out → TR-08c kcal;
  - Logged foods → TR-26a search;
  - the note is optional on each.
- Saved as authored by the coach ("Logged by you").
- Mocks: TM-15a, TM-15b, TR-08a to TR-08c, TR-26a; flow F28.
- Device check: as rahul.coach, Log in person for Meera; each option opens a different screen; save each; the trainee sees "Logged by Rahul".

**Z12-53 · Trainer mobile v3, remaining screens** · Opus
- Build these to v3:
  - Needs you (TM-01a to TM-01g);
  - Clients (TM-02a to TM-02g);
  - Client (TM-03a to TM-03i);
  - Check-ins (TM-05a to TM-05e, TM-06a to TM-06g);
  - More (TM-07a to TM-07g);
  - activity (TM-09a to TM-09d);
  - asks (TM-10a, TM-10b);
  - sessions (TM-11a, TM-11b);
  - diet review (TM-12a, TM-12b);
  - TM-13a, TM-13b.
- Fix the Z11-13 header that hides dates when the trainer has no zone.
- Flows F20, F22 to F28.
- Device check: F20 and F22 to F28 on both platforms, in both themes.

### Phase E: repo hygiene (any time after Z12-32, own lane)

**Z12-54 · Sentry exception scrubbing** · Sonnet
- `apps/api/src/lib/sentry.ts` `beforeSend` rewrites `exception.values[].value` and any `params:` tail for DrizzleQueryError.
- `routes/plans.ts` (around line 1955) logs `error.name` and `cause.code`, not the raw error.
- Add a test with a fake DrizzleQueryError.

**Z12-55 · drizzle-orm 0.45** (after Z12-54) · Sonnet. Its own PR; the e2e must be green.

**Z12-56 · vitest 4 and de-flake** · Sonnet
- The JS-only major bump.
- De-flake `ClientLogWorkout.test.tsx` and `WorkoutTab.week.test.tsx`.

### Phase F: native bundle, full device run, deploy, report

**Z12-57 · Native bundle and builds** · Opus
- One PR with every native change, and nothing else:
  - `expo-haptics` (rest end, set logged, PR moment) and `expo-keep-awake` as direct dependencies (switch to `useKeepAwake`);
  - `@react-native-community/netinfo` (Z12-41 switches from the probe);
  - the Live Activity Swift layout and `LogSetIntent` fix (Z12-48);
  - Android `<queries>` mailto (Z10-26);
  - Inter, if it needs any native config.
- **No Expo SDK upgrade in W12 (decision 7).** Mixing it with the visual change would make device regressions impossible to pin down. It becomes its own task after Firoz's W12 device pass.
- Builds:
  - simulator and emulator builds for the gate as usual (no EAS);
  - **EAS: one iOS and one Android development build after this PR merges**, for Firoz's phones. The big visual change and the native bundle justify them.
  - Check the EAS free-plan usage first. On 12 Nov about 12 of 30 builds were used until 1 Dec. Spend at most 2 more (one more pair) only if a native fix fails on device.
  - Record the build IDs and the remaining quota. Never print credentials.
- Device check: the gate on the new builds, plus the Z12-48 lock-screen checks and haptics on the simulator where possible.

**Z12-58 · Full device run and parity matrix** · Opus (Sonnet for the capture grind)
- On main after Z12-57, Z12-29 and Z12-30, on the iOS simulator and the Android emulator (and Firoz's PC emulator when reachable), as trainee, dual and trainer:
  - **one Maestro flow per v3 workflow**, F01–F17, F02b and F20–F29, in `apps/mobile/.maestro/flows/v3/<flow ID>-<slug>.yaml`, tagged `device`. Extend or replace the old flows; record the map in `docs/qa/W12/maestro-map.md`.
  - Tap every button, tab, sheet, menu item and deep link on every reachable screen, not only the flow path. The tap list per screen is in `docs/design/v3/flows/index.md`.
  - Lock-screen notification and Live Activity taps (section 3, step 5).
  - Offline → online with the outbox-vs-D1 check (Z12-41).
  - **Any crash, red box or warning fails the run.**
- **Parity matrix** `docs/qa/W12/parity.md`: one row per screen ID × theme (370 rows), with columns:
  - screen ID;
  - theme;
  - reachable (yes/no) and how (flow and step, or "state: …");
  - iOS verdict (MATCH, CLOSE or GAP);
  - Android verdict;
  - app screenshot paths;
  - mock path;
  - remaining differences.
  Every "no" or GAP gets a reason and either a fix PR or a listed follow-up.
- Nightly `full` must be green, or every failure triaged.
- **Firoz device checklist** `docs/qa/W12/firoz-device-checklist.md` (10 to 15 minutes per phone) covers what simulators can't prove:
  - haptics at rest end, set logged and PR;
  - a real push (nudge from the trainer phone to the trainee phone) on the lock screen and its tap;
  - the Live Activity look plus the Log and Open taps on a real lock screen;
  - keep-awake over 3 minutes;
  - system dark and light switching live;
  - the feel of swiping between days and of sheets;
  - real airplane mode → log → reconnect → sent;
  - in-app banners auto-dismissing;
  - Inter rendering.
  Write it as checkboxes with the expected result for each.

**Z12-59 · Staging deploy, once** · Sonnet
- After Z12-58 is green: run the migrations on staging, deploy the API and trainer web to staging once, and smoke-test.
- No production.
- Record the SHA and migration list.

**Z12-60 · Final fresh review and batch report** · **Fable 5.2** for the review, Sonnet for the report
- A fresh review of the whole batch diff against `docs/design/v3` and `ISSUE-MAP.md`: every finding closed with evidence, or listed.
- The report goes in W12.md's Report section, as its own PR. It contains:
  - the merged PRs with SHAs;
  - the decisions, including model switches with the reasons;
  - the parity totals (MATCH, CLOSE, GAP per theme and platform);
  - the device-run summary and the paths;
  - the EAS builds used and the quota left;
  - the outbox-vs-D1 result;
  - the held and parked items;
  - the deferred Z12-1 to Z12-17;
  - follow-ups;
  - the final main SHA.

## 3. Device gate (applies to every mobile task)
A mobile task's PR can merge only when all of these hold on the **PR head build**:
1. `ci`, `e2e` and `banned-strings` are green.
2. The Z12-35 harness ran the task's Maestro flows on the **iOS simulator and the Android emulator**, against the local seeded API, in **light and dark**, as every role the task touches, with **zero crashes, red boxes or warnings** in the device logs.
3. A manual tap-through by the agent of every control on the task's screens (Maestro or scripted taps), listed in the PR as `screen ID → control → result`.
4. Screenshots for each of the task's mock IDs in both themes and on both platforms are in `docs/qa/<task ID>/`, with the task's rows added to `docs/qa/W12/parity.md`.
5. Any lock-screen, push or offline step named in the task is done and evidenced.
6. Anything that can only be proven on a real phone goes on Firoz's checklist (Z12-58), not skipped silently.

Parity row template:
`| TR-26e | light | yes · F08 step 7 | MATCH | CLOSE | shots/TR-26e-light-ios.png, …-android.png | docs/design/v3/png/trainee/TR-26e-custom-food.png | keypad is the system keyboard |`

## 4. Order (at most 3 tasks at once)
1. **Z12-31 → Z12-32**, then Z12-33 (first code PR).
2. Z12-34, Z12-35 and Z12-36 in parallel (Z12-36 after Z12-35 has landed the harness, if they share CI files). Z12-54 → Z12-55 → Z12-56 fill free slots.
3. Z12-37, then **Z12-38 → Z12-39 → Z12-40** (they share Today, Diet, Workout and shell files, so run them in series).
4. **Z12-41** (sync and auth restore) in parallel with Z12-42 → Z12-43 (Diet and food).
5. Z12-44 → Z12-45 → Z12-48 (Workout files); Z12-46 after Z12-40.
6. Z12-47 → Z12-49 (they share `openListener.ts`) → Z12-29 → Z12-30.
7. Z12-50 → Z12-51 → Z12-52 → Z12-53 (they share the trainer sheets).
8. **Z12-57** after Z12-45 and Z12-48; then **Z12-58 → Z12-59 → Z12-60**.

If two tasks turn out to own the same file, serialise them and note it. Don't widen a task's files without saying so in the PR.

## 5. Decisions already made (record them in W12.md)
1. **Future days are view only** (FitBud UI, 14 Nov): plan visible, no logging actions, "Opens on {day}"; past days loggable as late logs; the server rejects future-dated logs (422 `FUTURE_DAY`).
2. **v3 mocks are the target**; mobile gap specs Z12-18 to Z12-28 are superseded; Z12-29 and Z12-30 stay; web Z12-1 to Z12-17 are deferred to W12b.
3. **Nudge is always a FitBud push**: editable body, fixed title "{Coach} nudged you", 2 per client per day; WhatsApp is only a redirect.
4. **Push off and reminders paused:** the nudge goes to the in-app inbox only, labelled "Push off" or "Reminders paused" on the sheet; the cap still applies; quiet hours hold the push but not the inbox entry. Paused reminders no longer block nudges.
5. **Custom food** (TR-26e): name, amount and kcal required; macros optional; saved to "my foods" by default; visible to the coach as added by the client.
6. **The theme follows the system**, with no in-app switch; web is light-only for now.
7. **No Expo SDK upgrade in W12**: own task after Firoz's W12 device pass. Native changes go only in Z12-57.
8. **Web dark variables defined but off**, since there are no web dark mocks.
9. **Seed:** Priya becomes Priya Nair; the seed date is relative; a no-plan trainee, a push-off client and a reminders-paused client are added.

## 6. Not in this run
- Production deploy.
- Store submission.
- The Expo SDK upgrade.
- Trainer web gap buckets Z12-1 to Z12-17 (unless the usage rule in section 0 allows).
- Z10-7, Z14-*, #177, #307.
- The client-view switch sheet (no frame).
