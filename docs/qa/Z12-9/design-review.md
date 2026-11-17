# Design review: Z12-9

Advisory report (D-W11-2, D-W11-3). Pixel AE scores skipped (design-review tool / ImageMagick not required for this pass); grades are by eye against the locked frames in `docs/design/mockups/png/`. How to read it: docs/runbooks/design-review.md. **design-review tool not on main yet** (spec note).

| Screen | Frame | Grade | Notes |
|---|---|---|---|
| `165-trainer-web-history-web-1440x900.png` | `165-trainer-web-history-web.png` | **CLOSE** | History card + compact **All events** select; civil From/To (“Choose a date”, no mm/dd/yyyy); absolute times (`Tue 17 Nov, 11:50 pm`). Frame sample rows/dates differ from demo seed; frame omits From/To (kept per W12b gap list). No week headings (v3 flat timeline). |
| `190-trainer-web-search-web-1440x900.png` | `190-trainer-web-search-web.png` | **CLOSE** | Palette groups Clients / Templates / Pages; avatars + status · goal · plan meta; **Enter to open** on focused row; esc keycap. Query `ro` returns Rohan + word-prefix exercises (Ab Roller…) + Clients · Ended. Frame sample (Romanian deadlift, Siddharth Rao) differs from library/seed. |

Screens: 2 paired, 0 unmapped. Coral never used as a button. Ink primary elsewhere in shell. Global `styles/*` untouched (D-W12b-2).
