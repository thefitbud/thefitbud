# FitBud type study and type scale (v1)

**Date:** 14 Nov 2026 (IST) · **Author:** FitBud UI · **Status:** proposal, used by the three v1 mocks in `png/`.

## 1. Method

- **Source:** Firoz's live captures of 14 Nov: Hevy (37), MyFitnessPal (14), Everfit Coach (10). Each is 1170 × 2532 px, so the device is a 390 × 844 pt iPhone at @3x (3 px per pt).
- **Measuring:** `_work/measure.py` crops one text run at a time and finds the rows with ink in them. It then converts the glyph height into a font size:
  - Runs of capitals or digits: size ≈ cap height ÷ 0.71.
  - Lowercase runs with ascenders but no descenders: size ≈ ascender height ÷ 0.75.
  - Weight comes from the median stem thickness divided by the size: under 0.09 is Regular, 0.09–0.11 Medium, 0.11–0.135 Semibold, above that Bold.
  - The raw glyph heights are in `_work/measure.json`.
- **Row pitch, gutters, the tab capsule and card insets** were measured with the same pixel scans (`_work/bands.py`).
- **Accuracy:** about ±1 pt on size and ±1 step on weight. Bold all-caps runs read about 1 pt large. Tracking was not measured from pixels. It is a visual estimate.

## 2. Measurements

| App | Capture | Text run | Glyph height (pt) | Est. size (pt) | Est. weight |
|---|---|---|---|---|---|
| MFP | `01-250fcbc7.png` | Large title "Today" | 20.0 | **26.7** | Bold |
| MFP | `01-250fcbc7.png` | Week letters S M T | 8.7 | **12.2** | Bold |
| MFP | `01-250fcbc7.png` | Card label "Calories" | 11.0 | **14.7** | Semibold |
| MFP | `01-250fcbc7.png` | Stat numeral "040" (1,040 cal) | 14.7 | **20.7** | Bold |
| MFP | `01-250fcbc7.png` | Goal suffix "/ 2,200" | 10.7 | **15.0** | Regular |
| MFP | `01-250fcbc7.png` | Remaining numeral "160" | 12.0 | **16.9** | Bold |
| MFP | `01-250fcbc7.png` | Unit "left" | 9.0 | **12.0** | Medium |
| MFP | `01-250fcbc7.png` | Macro label "Carbs" | 10.7 | **14.2** | Semibold |
| MFP | `01-250fcbc7.png` | Macro numeral "227" | 11.7 | **16.4** | Bold |
| MFP | `01-250fcbc7.png` | Sheet tile "Log Food" | 12.7 | **16.9** | Medium |
| MFP | `01-250fcbc7.png` | Sheet row "Water" | 10.0 | **14.1** | Semibold |
| MFP | `14-98d1af1d.png` | Section header "Meals" | 13.7 | **19.2** | Semibold |
| MFP | `14-98d1af1d.png` | Link "View d" | 11.0 | **14.7** | Bold |
| MFP | `14-98d1af1d.png` | Meal row "Breakfast" | 12.3 | **16.4** | Semibold |
| MFP | `14-98d1af1d.png` | Button "Lo" | 11.7 | **16.4** | Semibold |
| MFP | `14-98d1af1d.png` | Tab label "Today" | 9.3 | **12.4** | Medium |
| Hevy | `23-b4712154.png` | Nav title "Lo" (Log Workout) | 11.7 | **16.4** | Medium |
| Hevy | `23-b4712154.png` | Stat label "Duration" | 7.7 | **10.2** | Medium |
| Hevy | `23-b4712154.png` | Stat numeral "0" (Sets) | 11.7 | **16.4** | Medium |
| Hevy | `23-b4712154.png` | Exercise title "Box" | 13.0 | **18.3** | Semibold |
| Hevy | `23-b4712154.png` | Chip "Rest: OFF" | 11.7 | **16.4** | Medium |
| Hevy | `23-b4712154.png` | Button "Finish" | 11.3 | **15.1** | Medium |
| Hevy | `23-b4712154.png` | Column header "SET" | 9.3 | **13.1** | Semibold |
| Hevy | `23-b4712154.png` | Set number "1" | 12.7 | **17.8** | Semibold |
| Hevy | `23-b4712154.png` | Input value "5" | 11.0 | **15.5** | Regular |
| Hevy | `23-b4712154.png` | Button "Add Set" | 11.7 | **16.4** | Semibold |
| Hevy | `21-0dec1c62.png` | Previous "100" (100kg x 5) | 11.3 | **16.0** | Regular |
| Hevy | `21-0dec1c62.png` | Input "100" | 11.3 | **16.0** | Regular |
| Hevy | `21-0dec1c62.png` | Plan note "Backoff 7-10" | 11.7 | **15.6** | Medium |
| Everfit | `10-0bb117c9.png` | Eyebrow "TODAY, NOV 14" | 10.3 | **14.6** | Bold |
| Everfit | `10-0bb117c9.png` | Large title "All clients" | 21.7 | **28.9** | Bold |
| Everfit | `10-0bb117c9.png` | Stat numeral "3" | 17.7 | **24.9** | Bold |
| Everfit | `10-0bb117c9.png` | Stat label "Connected" | 10.0 | **13.3** | Medium |
| Everfit | `10-0bb117c9.png` | Section "ALL CLIENTS" | 8.7 | **12.2** | Bold |
| Everfit | `10-0bb117c9.png` | Row primary "Ben Andrew" | 11.7 | **15.6** | Bold |
| Everfit | `10-0bb117c9.png` | Row secondary "last active" | 10.0 | **13.3** | Regular |
| Everfit | `10-0bb117c9.png` | Tab label "Clients" | 7.7 | **10.2** | Bold |

### Layout metrics (pt)

| Metric | Hevy | MyFitnessPal | Everfit Coach |
|---|---|---|---|
| Screen side margin | 16 | 16 outside cards, ~24 inside a card | 20 |
| Main list row pitch | **47** per set row (`21`, `23`: rows at 115 / 162 and 513 / 560 / 607) | **69** meal card + 8 gap = 77 (`14`) | **73** client row (`10`) |
| Input or control height | set input ≈ 35, set chip ≈ 30 × 30, Add Set ≈ 38 | Log pill ≈ 58 × 31 | search ≈ 46 |
| Card radius | n/a (flat white log) | ≈ 16 | ≈ 12 |
| Floating tab capsule | ≈ 316 wide, ≈ 58 tall, bottom ≈ 22 above the screen edge | ≈ 275 wide + a 56 FAB, 60 tall | ≈ 335 wide, 60 tall, 5 items |
| Tab label | ≈ 11.7 Medium (cap 8.3) | 12.4 Medium | 10.2 Bold |

## 3. How each app builds hierarchy

**MyFitnessPal (diet).**
- Large title around 27 pt Bold.
- Numbers outrank everything inside a card. Calories run 20.7 pt Bold against a 14.7 pt Semibold label (**1.4×**). The goal suffix "/ 2,200" drops to 15 pt Regular in grey.
- Hierarchy comes from **weight and colour, not size**:
  - The label is black Semibold.
  - The number is black Bold.
  - The goal is grey Regular at about the label's size.
- Rows are big (69 pt cards) with one 16 pt Semibold line. That's calm, but it wastes space.

**Hevy (workout).**
- Hevy is very flat. Almost everything is 15–16 pt: chips, inputs, previous values and Add Set.
- Stats labels are tiny (≈ 10–12 pt grey) over 16 pt values (**1.6×**).
- The exercise name is the only coloured text (blue, about 18 pt Semibold). That's how you find your place in a long log.
- Hevy separates "done" from "to do" with **colour** (green rows, grey placeholders at luminance 178/255) more than with type.
- 47 pt rows with ≈ 35 pt inputs make it dense but still easy to tap.

**Everfit Coach (trainer).**
- The large title is the biggest of the three (≈ 29 pt Bold), with a coloured all-caps eyebrow for the date.
- Count chips put a 25 pt Bold number over a 13 pt label (**1.9×**).
- Rows are a 15.6 pt Bold name over a 13.3 pt Regular grey line. That reads well, but Bold is used everywhere, so nothing stands out.

**What made our earlier frames look like a prototype:**
- One display font did every job.
- Sizes sat too close together (15 / 16 / 17 with the same weight).
- Numbers weren't the heaviest thing in their card.
- Padding was generous everywhere (≈ 80 pt rows). The reference apps keep rows at 47–73 pt.

## 4. Font choice: Inter (SIL OFL, free)

- **Why Inter:**
  - It is the closest free match to the system grotesques Hevy and MFP read as. It has the same x-height (≈ 0.73 of cap height), even widths and a neutral tone, so it looks like a shipping iOS app rather than a "brand font" demo.
  - **Tabular figures** via `font-variant-numeric: tabular-nums` (OpenType `tnum`). Every number in the mocks uses equal-width digits, so 40 / 42.5 / 10 and 1,072 / 778 stay in fixed columns as they change.
  - **An optical-size axis** (`opsz`). 30 pt titles automatically use the tighter "Display" design and 11 pt labels use the open "Text" design. That's what SF does too.
  - It ships in 400 / 500 / 600 / 700 statics (`@expo-google-fonts/inter`), so React Native gets identical weights on iOS and Android. A system stack would mean SF on iOS and Roboto on Android: two looks, and Roboto's figures are narrower.
  - The ₹ sign and Indian digit grouping (1,07,200) render correctly.
- **Rejected:**
  - **Satoshi:** no `opsz`, small sizes get wide, and it's a strong personality font that made the old frames feel like a landing page.
  - **Hanken Grotesk:** fine, but no optical sizes and looser digits.
  - **A system font stack:** inconsistent across platforms (see above).
- **Brand touch without a new font:**
  - Colour: indigo `#4527C6` and ink `#16123A`.
  - Numerals one step heavier than their labels.
  - Large titles with tight tracking (−0.6).

## 5. FitBud type scale (iOS pt, CSS px at 1×)

All numeric tokens use `tnum`. Line heights sit on a 1 pt baseline and round to even numbers where possible.

| Token | Size / line | Weight | Tracking | Used for | Reference it answers |
|---|---|---|---|---|---|
| `large-title` | 30 / 36 | 700 | −0.6 | Screen titles (Diet, Attention) | MFP 26.7, Everfit 28.9 |
| `title` | 20 / 25 | 700 | −0.35 | Section headers (Meals) | MFP "Meals" 19.2 Semibold |
| `headline` | 17 / 22 | 600 | −0.25 | Exercise name, nav title, group header | Hevy exercise 18.3 Semibold |
| `body` | 16 / 21 | 400 (600 = `body-strong`) | −0.15 | Row primary text; `body-strong` for meal and client names | MFP row 16.4, Hevy 16 |
| `subhead` | 14 / 19 (13.5 / 18 in dense rows) | 400 | −0.05 | Row secondary, coach cue, food list | Everfit 13.3, MFP 14–15 |
| `caption` | 12 / 16 | 500 | 0 | Stat labels, times, units under numbers | Hevy stat label ≈ 10–12 (we go up for legibility) |
| `label` | 11.5 / 15 | 600 caps | +0.5 | Table column headers (SET · PREVIOUS · KG) | Hevy 13.1, Everfit 12.2 |
| `tab` | 10.5 / 13 | 600 | +0.1 | Floating tab bar labels | Hevy ≈ 11.7, Everfit 10.2 |
| `num-hero` | 25 / 30 | 700 | −0.9 | Number in the ring centre | MFP 20.7 (we're the ring) |
| `num-lg` | 22 / 26 | 700 | −0.5 | Card headline numbers (778 kcal left, 9 clients) | Everfit chip 24.9 |
| `num-md` | 17 / 22 | 600 | −0.25 | Set values, kcal per meal, workout stats | Hevy inputs 16 |
| `num-sm` | 14 / 19 | 600 | −0.1 | Macro values (58 / 110 g) | MFP macro 16.4 |

**Number : label ratios we use**
- Ring 25 : 12 = **2.1×**
- Card headline 22 : 14 = **1.6×**
- Workout stats 17 : 12 = **1.4×**
- Meal kcal 17 : 11 = **1.5×**
- Macro 14 Semibold : 13.5 Regular, which works through weight like MFP

The rule: a number is always at least one weight step heavier than its label, and its unit (kg, kcal, / goal) drops to `caption` colour `#8F8BA6`.

**Colour ramp for text**
- ink `#16123A`
- ink-2 `#5A5672` (secondary)
- ink-3 `#8F8BA6` (labels, units)
- ink-4 `#B9B6CB` (disabled)
- Coach-target ghost values `#9C8CEB`

## 6. Spacing grid (4 pt base)

| Token | pt | Use |
|---|---|---|
| `s1` | 4 | Icon-to-text in tags, label-to-bar |
| `s2` | 8 | Gap between cards, chip gap, between buttons |
| `s3` | 12 | Leading tile to text, row inner gap |
| `s4` | 16 | **Screen margin** (Hevy and MFP both use 16), card padding |
| `s5` | 20 | Section top spacing in dense screens |
| `s6` | 24 | Section top spacing in relaxed screens |
| `s8` | 32 | Large separations (rare) |

**Component heights**
- Set row 48 (Hevy 47)
- Set input 36
- Collapsed meal card 62 (MFP 69, tightened)
- Client/action row ≈ 76 with two lines and tags (Everfit 73)
- Exercise header 56
- Chip and pill 32
- Primary in-card button 38
- Floating tab capsule 62, inset 16 at the sides and 22 at the bottom
- Rest bar 60

**Radii:** card 18, meal card 16, controls 10–12, pills fully round.

**Tap targets:** at least 44 × 44 for anything standalone. Set inputs are 36 tall but sit inside a 48 pt row, and the whole row cell is the target.

## 7. How the scale shows up in the mocks

- `png/a-diet-day.png`:
  - `large-title` "Diet"
  - `num-hero` 1,072 in the ring
  - `num-lg` 778 kcal left
  - `num-sm` macros
  - `body-strong` meal names, `subhead` foods
  - `num-md` + `caption` for kcal
- `png/b-active-workout.png`:
  - `headline` for the nav and exercise names (indigo, like Hevy's single coloured line)
  - `caption` + `num-md` for the stats
  - `label` for the table header
  - `num-md` values, with coach targets as ghost `#9C8CEB`
- `png/c-trainer-attention.png`:
  - `large-title`
  - `num-lg` 9
  - `headline` group titles
  - `body-strong` / `subhead` rows
  - 11.5 pt tags
