# Credits and licences for exercise media and text

Owner decision, 31 Oct 2026. These rules bind any screen that shows an exercise drawing or wger exercise text: trainee and trainer mobile, trainer web, and the Credits and licences page (frame DS5, W2).

## What we ship
The exercise base 2026.10.21-v3 (`apps/api/seed/library/incoming/exercise-base-2026.10.21-v3/`) has 919 drawings for 460 exercises. All of them are CC BY-SA, which allows commercial use.

| Author (as credited) | Files | Licence | Where from |
|---|---|---|---|
| Everkinetic (everkinetic.com) | 912 | CC BY-SA 4.0 (574) / CC BY-SA 3.0 (338) | Everkinetic directly, Wikimedia Commons and wger |
| CFCF | 4 | CC BY-SA 4.0 | Wikimedia Commons |
| wger.de | 2 | CC BY-SA 3.0 | wger |
| hans | 1 | CC BY-SA 4.0 | wger |

These counts were checked against `exercise_library_media` after `pnpm db:reset`. In the seed, 338 Everkinetic rows store the author as "Everkinetic" and 574 as "Everkinetic (everkinetic.com)". Credits UI should show "Everkinetic (everkinetic.com)" for both.

## Rules
1. **Credit line wherever a drawing appears.** Show the author and licence, with a link to the licence:
   - CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
   - CC BY-SA 3.0: https://creativecommons.org/licenses/by-sa/3.0/

   An info or credits sheet on the exercise screen is enough; it doesn't have to sit on the image. The per-file credit comes from the data, never from hand-written copy:
   - `exercise_library_media.attribution`, `.author`, `.licence` and `.licence_url` (API);
   - each exercise's `media` entry in `exercises.json`;
   - the per-file list in `MEDIA_ATTRIBUTION.md`.
2. **Changes stay share-alike.** If we crop, recolour or combine a drawing, the edited file must be released under the same licence, with the same credit. Share-alike covers the images and their edits only, not FitBud's code or other content.
3. **wger exercise text is CC BY-SA too.** It is kept separately as `bysa_text`. If we show it, credit wger with the same kind of line.
4. **App-level page.** The Credits and licences page (DS5) lists the sources above and the food data sources in `apps/api/seed/library/ATTRIBUTION.md` (INDB, USDA FoodData Central).

## Status
- **Data:** every media row carries attribution, licence and licence URL (I2c, #84).
- **UI:** no screen shows the credit line yet. Any task that shows exercise drawings or `bysa_text` must include it. The Credits and licences page waits on frame DS5.
- `apps/api/seed/library/ATTRIBUTION.md` is a byte-locked copy of the foods release and still names only the old 242 Everkinetic PNGs. This file is the current source for exercise media credits.
