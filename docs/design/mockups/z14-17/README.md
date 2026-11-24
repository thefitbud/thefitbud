# Z14-17 · Trainer app mocks for Firoz list 2

Drawn 24 Nov 2026 (IST) by FitBud UI with the v3 kit (`docs/design/v3/src/kit.css`, `kit.py`, `kit_trainer.py`), tokens only, the same pipeline as Z14-10. **Status: waiting for Firoz's approval (D-W14-28 Open).** Z14-22, Z14-23 and Z14-24 start only after D-W14-28 reads "Approved by Firoz, {date}". The back pattern (BK-01, BK-02) only reuses the approved v3 nav bar and does not wait (Z14-18, Z14-25).

Words are the ones Firoz chose on 24 Nov 2026 (D-W14-29): **"Remind {first}"**, **"Noted, keep open"**, **"Resolve…"** (opens a short sheet that asks for the outcome). "Mark reviewed" is gone everywhere; the section for noted items is **"Noted, still open"**.

| Folder | Frame |
|---|---|
| `ios-light/` | iPhone 393×852 pt @3x, light |
| `android-light/` | Android 412×915 dp @3x, light (Android status bar, ← back with no label) |
| `ios-dark/` | iPhone 393×852 @3x, dark |
| `sheets/` | one contact sheet per group (iOS light, Android light, iOS dark rows) |
| `src/` | `e_z14_17.py` (all screens), `render_z1417.mjs` (3 frames + checks; `TM-`, `RP-`, `BK-` render from `html/trainer/`), `z1417_sheets.py`, `z1417_ids.txt` |

Re-run: copy `src/*` into a copy of `docs/design/v3/src/` (with `kit.py`, `kit_trainer.py`, `kit.css`, `icons.json`), then `python3 e_z14_17.py && IDS=z1417_ids.txt OUT=../png-z1417 node render_z1417.mjs && python3 z1417_sheets.py <out>`. Checks: the v3 overflow checks (CLIP, TRUNC, OFFSCREEN, WRAP, OVERLAP) and the touch-target check (every button, nav button, list row, jump pill, section header, See all row, stepper button, text action and outcome option is at least 44 pt tall). **All 68 renders (23 screens × 3 frames, BK-02 iOS only) pass with 0 warnings.**

Content: Saturday 14 Nov, IST, coach Rahul, clients Rohan, Neha, Farhan, Deepak, Ishita, Aarav, Sneha, Priya, Meera. No percentages, streaks or error codes.

## 1 · Attention (D-W14-25, diagnosis #19, #20, #21) · `sheets/1-attention.png`
| ID | What it is | What it fixes |
|---|---|---|
| TM-01a3 | Default: the four summary tiles are **jump pills** (arrow, tap scrolls to the section); every section shows its **first 3 rows** and **"See all 5 missed"**; section headers have a collapse chevron | "Don't make me scroll through one section to reach the next" without scroll-inside-scroll |
| TM-01a4 | After tapping **Check-ins**: the page jumped to Check-ins; a compact pill row (Missed 5 · Asked 2 · Check-ins 2 · Off plan 1 · Noted 1) sticks under a small title with the current section highlighted | Pills that move you; the pill row stays reachable |
| TM-01a5 | Missed **collapsed**: the header becomes a card row with the count and "Show"; Asked moves up | Collapsible sections |
| TM-01a6 | **See all**: Missed as its own pushed list ("‹ Attention", "Missed · 5"), the same rows | The rest of a long section |
| TM-01a7 | **Empty section**: See all after the last missed item was resolved ("Nothing missed right now", Back to Attention). On Attention a section with 0 items is not shown and its pill is muted | Empty state |
| TM-01a8 | **Loading**: title and tab bar at once, skeleton tiles and rows with the action slot (no zeros) | — |
| TM-01a9 | **Offline**: neutral banner "You're offline. Showing what was here at 9:40 am. Reviewing comes back when you're online."; jumping still works, Review disabled | No red error for offline |
| all | **One row template**: avatar top-aligned, name and age on one line, issue (2 lines max), chips, a **fixed 84 pt trailing slot** with a 44 pt button (Review/Reply) in every section, so text and buttons line up from section to section | Misaligned rows (#21) |

## 2 · Review panel (D-W14-29, diagnosis #22, #23) · `sheets/2-review-panel.png`
| ID | What it is |
|---|---|
| RP-01 | Review sheet from Attention: avatar and name (with ›) open the profile; **"‹ 1 of 3 ›" is the only way to move** (dashes are a passive indicator, no "Next item" button); one card (what happened, Planned, Reminder; empty rows hidden); **Remind Rohan** · **Noted, keep open** · **Resolve…** (primary); **Add note** and **WhatsApp** as two text actions; no More (⋯) menu; no explanatory caption |
| RP-02 | After **Noted, keep open**: chip "Noted", state line "Noted by you at 9:52 am · still open" with **Undo**; the button pair becomes Remind Rohan · Resolve… |
| RP-03 | **Resolve…** opens the short confirm sheet: "What was the outcome?" Talked to Rohan · Plan adjusted · No action needed (44 pt rows), optional private note, the lock line, **Resolve** |
| RP-04 | Resolved: read-only, "Resolved by you at 10:05 am · Talked to Rohan" with Undo; the › stepper button is tinted and "2 more open for Rohan" |
| RP-05 | All done for Rohan: "2 resolved · 1 noted, still open", **Next client: Neha Reddy** and **Back to Attention** (the only place "next client" appears) |
| RP-06 | The **same review opened from Rohan's profile**: pushed screen "‹ Rohan", the same header, card and actions (today's second review UI goes) |

## 3 · Client profile (D-W14-27, diagnosis #24–#27) · `sheets/3-client-profile.png`
| ID | What it is |
|---|---|
| TM-03a3 | Top: "‹ Attention" and More (⋯, 44 pt); header (avatar, name, goal and week, status chip); **one action row: WhatsApp · Remind… · Add note** (the only Add note entry); Needs attention rows with the same 84 pt action slot as Attention; This week; Today's food; Next check-in |
| TM-03b3 | Scrolled: Recent activity (See all); **Coach notes: latest 3** with who can see each ("Aarav sees it" eye / "Only you" lock) and **See all 7 notes**; Reminders; Profile and safety. **No separate Edit plan card** (Copy FitBud web link is in the menu) |
| TM-03a4 | **Loading**: header and action row paint at once from the list; **skeletons sit inside the cards** under their real titles (no loader above the header, no zeros) |
| TM-03i2 | More menu, trimmed: Goal, intake and limitations · Log in person for Aarav · Copy FitBud web link · Cancel. **No Add note** |
| TM-03k | See all notes: pushed "‹ Aarav", "Notes · 7", newest first, visibility on each, pages as you scroll (D-W14-26) |

## 4 · Note sheet (D-W14-27 c, diagnosis #24, #25) · `sheets/4-note-sheet.png`
| ID | What it is |
|---|---|
| TM-04k2 | Empty: **Cancel** · "Note for Aarav" · **Save** (off while empty); keyboard up, the sheet sits above it; "Who can see it" **Only me / Aarav too** segmented control (44 pt), default Only me, line "Only you can see this note." |
| TM-04k3 | Typed, **Aarav too** picked: "Shows on Aarav's Today. He gets one notification."; Save on |
| TM-04k4 | Cancel (or swipe down, tap outside, Android back) with text typed: "Discard this note?" Keep writing / Discard. Empty sheets close without asking |

## 5 · Back (D-W14-24, diagnosis #17, #28) · `sheets/5-back.png`
| ID | What it is |
|---|---|
| BK-01 | Every pushed screen shows one **header back**: iOS chevron + the parent's name ("‹ Aarav"), Android ← (no label, "Back" for screen readers), 44 pt. Example: Log workout from Aarav's profile |
| BK-02 | **iOS edge swipe half-way** (iOS only): the pushed profile slides right and Attention is really underneath (slightly shifted and dimmed); the note explains the rule: drag from the left edge, let go past a third of the screen or flick to go back |

## Decisions made while drawing (FitBud UI, recorded for Firoz)
1. Jump pills are the existing summary tiles made tappable (an arrow shows they move you), not a new control; once they scroll away a compact pill row sticks under the title. Sections with 0 items are hidden and their pill is muted.
2. 3 rows per section before "See all"; See all is a pushed list, not an expanded section, so Attention stays short.
3. Collapsed sections become a card-like header row with the count and "Show" so they are easy to spot and tap.
4. One row template everywhere with a fixed 84 pt action slot; the same slot is used in the profile's Needs attention card.
5. Review: two secondary buttons side by side (Remind, Noted) and Resolve… full width as the main action; after Noted, Resolve… moves into the pair. "…" only on Resolve because it opens a sheet.
6. The Resolve sheet uses the outcome list as 44 pt radio rows (today's chips were below 44 pt).
7. Profile: Add note only in the action row (Firoz: remove it from the menu); the Coach notes card links to See all notes; Edit plan moved into the menu as Copy FitBud web link.
8. Note visibility is a segmented control with a consequence line instead of a switch, because "on/off" did not say who sees the note.
9. Header back uses the parent's name on iOS (Apple's pattern) and a plain ← on Android.

## Questions for Firoz (behaviour and scope only)
1. Words: we kept your pair, "Noted, keep open" and "Resolve…". Close them as drawn, or change before Z14-23 (app) and Z14-26 (web) start?
2. The section for noted items becomes "Noted, still open" on the app and web. OK?
3. Resolve outcomes stay Talked to {first} · Plan adjusted · No action needed. Keep, or add one?
4. 3 rows per section before See all: right number, or 5?
5. Approve these frames (D-W14-28)?
