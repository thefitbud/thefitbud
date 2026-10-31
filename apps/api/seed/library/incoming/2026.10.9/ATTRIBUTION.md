# Attribution and licences: FitBud library seed 2026.10.0

| Source | Version pinned | Used for | Licence | Required attribution |
|---|---|---|---|---|
| Indian Nutrient Databank (INDB) 2024, Vijayakumar A. et al., Anuvaad Solutions / Jaacks lab | git `fbdb62be` | 319 Indian dishes: nutrients per 100 g, serving sizes, recipe ingredients, local names | **CC BY 4.0** (as stated in the INDB publication) | "Nutrient data: Indian Nutrient Databank (INDB), Vijayakumar et al. 2024, CC BY 4.0." |
| USDA FoodData Central: SR Legacy (2018-04), Foundation Foods (2025-12-18), FNDDS 2021–2023 full bulk release (Survey foods JSON, 2024-10-31) | archive sha256 `0fe8ae48…ef`, `7ff2828e…bf`, FNDDS `dfb06ae7…3eb` | 1,140 foods: ingredients, staples and survey dishes: nutrients, household portions | Public domain / CC0 1.0 | Not required; we credit: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, fdc.nal.usda.gov." |
| free-exercise-db (yuhonas) | git `f00c92c7` | 339 exercises: names, steps, muscles, equipment, level | The Unlicense (public domain) | Not required; credited. **Photos from this repo are NOT used** (their provenance is unclear). |
| Everkinetic exercise illustrations | git `446bb9a3` | 242 PNG drawings for 121 exercises | **CC BY-SA 4.0** | "Exercise illustrations © Everkinetic (everkinetic.com), CC BY-SA 4.0." Show it next to the image or on an in-app credits screen. Share-alike applies to the images and any edited versions of them; it does not extend to FitBud's code or text. |
| FitBud editorial (AI-drafted, to be human-reviewed) | 2026.10.0 | Household servings, Hindi/Telugu aliases, coaching cues and mistakes, 14 authored exercises, 26 filled-in step lists, templates, names and taxonomy | FitBud proprietary | none |

## Open licence items (action needed before public launch)
1. **INDB GitHub repo has no LICENSE file.** CC BY 4.0 comes from the paper. INDB values are themselves calculated from IFCT 2017 (NIN-ICMR) and other tables. Get written confirmation from Anuvaad / the authors that app redistribution of the derived per-100 g values is covered.
2. **Everkinetic CC BY-SA:** if images are recoloured or cropped, the edited image must also be CC BY-SA and credited.
3. There is no IFCT data in this seed, by decision.

The in-app credits text should be built from `library_sources.attribution`; per-image credit comes from `exercise_library_media.attribution`.
