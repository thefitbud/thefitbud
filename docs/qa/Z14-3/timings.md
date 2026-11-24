# Z14-3 timings

Expo web at 393x852, against the local seeded API (Rahul, demo seed), with 80 ms
injected on every API request. Median of three runs each, in milliseconds.
Before is `main` at `d7d62fa`; after is this branch. Harness: `capture.mjs` (this
folder); raw runs in `timings-before.json` and `timings-after.json`.

| Step | Before | After | API calls (before / after) |
|---|---|---|---|
| Needs you, first load after sign-in, to the first card | 1017 | 911 | unchanged (not in this task's scope) |
| Clients tab, first visit, to the first row | 839 | 273 | 4 / 1 |
| A client's page, first open, fully loaded (Reminders card in) | 351 | 415 | 6 / 6 |
| The same client's page, second open (snapshot exists) | 332 | 112 | 6 / 6 (refresh underneath) |
| Tab switch: Clients to Needs you and back, to the first row | 819 | 71 | 4 / 0 |

Reading the numbers:

- **Clients and the tab switch are the real wins.** Clients makes one clients
  call (the attention and coach-ask calls are gone: the list rows carry their own
  attention summary from Z14-1, and the counts come from the same page when no
  filter is set). Switching back to a visited tab remounts nothing and refetches
  nothing inside 30 s.
- **A snapshot paints at once.** The second open of a client's page shows the last
  data in about one frame (112 ms to "fully loaded" is the refresh underneath
  completing, the page was already complete). `client-page-snapshot-*.png` shows the page with the quiet "Updating…" line
  while its refresh is held.
- **The client page's first open is not faster locally.** It now sends all six
  reads in one round, but the local worker answers them one after another, so the
  wall clock is the server's work, not round trips (before: two rounds of about
  170 ms; after: one round of about 350 ms). Against a real network the saving is
  one round trip (the week and responsiveness reads no longer wait for the
  workspace). The 415 median has one slow outlier in the three runs (1424 ms in
  the third; 314 and 415 in the first two); not a regression we could attribute.
- **Needs you first load is within noise.** Its own calls are untouched; the
  gain from Z14-1 is on the server side and does not show with this local worker.

How to rerun: start the API on 8792 and the Expo web bundle with
`EXPO_PUBLIC_API_BASE_URL=http://localhost:8792 EXPO_PUBLIC_SCREEN_CAPTURE=1`, then
`CHROMIUM_PATH=<chromium> node docs/qa/Z14-3/capture.mjs http://localhost:<port> <label> timings`
(or `shots`).

## Screenshots (after, 393x852, light and dark)

Frames: TM-01a Needs you, TM-02a Clients, TM-03a client page, TM-09 Activity, and
the review sheet from Needs you (frame 31 family). Files:

Each screen is captured with none (a fresh browser context, no snapshot, the
screen's reads held 4 s: the empty or skeleton paint) and with a snapshot (the
screen was visited once, the page reloaded so nothing stays mounted, then the
reads held 4 s: the last data plus the quiet "Updating…" line).

- Loaded: `needs-you-`, `clients-`, `activity-`, `client-page-{light,dark}.png`.
- With none: `needs-you-none-`, `clients-none-`, `activity-none-`,
  `client-page-none-`, `review-sheet-none-{light,dark}.png` (the review sheet one
  has the list loaded but no kept item, so the card shows its loading line).
- With a snapshot: `needs-you-snapshot-`, `clients-snapshot-`, `activity-snapshot-`,
  `client-page-snapshot-{light,dark}.png`.
- `review-sheet-item1-{light,dark}.png` and `review-sheet-item2-{light,dark}.png`:
  stepping to item 2 shows the card at once (prefetched), no "Loading item…".

Not captured: the dark TM frames were not diffed against `docs/design/v3/png-dark`
here (no pixel diff run); the capture is for the reviewer to read.
