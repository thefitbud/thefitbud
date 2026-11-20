# 08 · Credits and Licences

> **DRAFT for founder review — the facts here are from the repository, so this draft needs less legal work than the others and more verification work.** Prepared 2 Nov 2026.
> On approval this becomes `docs/legal/credits.md`, which BT3 publishes at `https://app.thefitbud.com/credits`.
> **This page is a licence condition, not a courtesy.** The exercise illustrations are CC BY-SA; showing them without attribution breaches the licence.

**Last updated:** [[DATE]]

---

## Part A — the published page

The text below is what users see. It is drafted to be rendered from data rather than typed: per-image credit comes from `exercise_library_media.attribution`, `.author`, `.licence` and `.licence_url`, and source-level credit from `library_sources.attribution`. Hand-written copy here will drift from the data.

### Credits and licences

FitBud is built on work other people did and shared. This page credits them and sets out the licences we use their work under.

#### Exercise illustrations

The exercise drawings in FitBud are licensed under **Creative Commons Attribution-ShareAlike**. There are 919 drawings covering 460 exercises.

| Author | Drawings | Licence |
|---|---|---|
| Everkinetic (everkinetic.com) | 912 | CC BY-SA 4.0 (574) and CC BY-SA 3.0 (338) |
| CFCF | 4 | CC BY-SA 4.0 |
| wger.de | 2 | CC BY-SA 3.0 |
| hans | 1 | CC BY-SA 4.0 |

Obtained from Everkinetic directly, from Wikimedia Commons and from wger.

- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
- CC BY-SA 3.0: https://creativecommons.org/licenses/by-sa/3.0/

Each drawing carries its own author and licence, shown with the exercise. Where we have changed a drawing — cropped, recoloured or combined it — the changed version is released under the same licence, with the same credit. The share-alike condition applies to these drawings and to our adaptations of them. It does not extend to FitBud's software or to any other content in FitBud.

#### Exercise descriptions

- Some exercise text comes from **wger.de** and is licensed **CC BY-SA**. Where it appears, it is credited to wger and carries the same licence notice.
- Some exercise names, steps, muscles and equipment data come from **free-exercise-db** by yuhonas, released under **The Unlicense** (public domain). No attribution is required; we credit it anyway. We do not use the photographs from that project.
- The rest — coaching cues, common mistakes and some step lists — was written for FitBud.

#### Food and nutrition data

| Source | Used for | Licence |
|---|---|---|
| **Indian Nutrient Databank (INDB) 2024** — Vijayakumar A. et al., Anuvaad Solutions / Jaacks lab | Indian dishes: nutrients per 100 g, serving sizes, recipe ingredients, local names | CC BY 4.0 |
| **USDA FoodData Central** — SR Legacy, Foundation Foods, FNDDS | Ingredients, staples and survey dishes: nutrients and household portions | Public domain |

Credits, in the form the licences call for:

> Nutrient data: Indian Nutrient Databank (INDB), Vijayakumar et al. 2024, CC BY 4.0.
> U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, fdc.nal.usda.gov.

Nutrition figures are estimates and may not match the food in front of you. Where a source does not report a nutrient, FitBud shows it as unknown rather than as zero. See the Health and Fitness Disclaimer.

#### Fonts, icons and software

[[TO BE COMPLETED: the open-source licences of the fonts (including Noto Sans Devanagari), icon set (Lucide), and any other third-party component whose licence requires a notice. Generate this from the dependency manifests rather than by hand.]]

#### Questions

Email tech@thefitbud.com. If you believe we have used your work without proper credit, tell us and we will fix it.

---

## Part B — internal notes (not published)

### B.1 Compliance gaps that must close before any build ships

1. **No screen shows a credit line yet.** The data carries attribution on every media row, but no UI renders it (`docs/spec/credits-and-licences.md`, Status). **Every screen that displays an exercise drawing or wger text must show the credit before that screen ships.** An info or credits sheet on the exercise screen is sufficient; it need not sit on the image. Today, shipping the exercise library to testers without it is a licence breach, however small the audience.
2. **This page does not exist yet.** It is task BT3, and it depends on the DS5 design frame.
3. **`apps/api/seed/library/ATTRIBUTION.md` is stale.** It is a byte-locked copy of the food release and still names only the old 242 Everkinetic PNGs. The current source of truth for exercise media credit is `docs/spec/credits-and-licences.md`. Do not build the page from the stale file.

### B.2 The INDB licence risk — needs resolution before public launch

The INDB GitHub repository **has no LICENSE file**. CC BY 4.0 is stated in the published paper, not in the repository, and INDB's own values are calculated from IFCT 2017 (NIN-ICMR) and other tables.

**Action:** obtain written confirmation from Anuvaad Solutions or the authors that redistributing the derived per-100 g values inside an app is covered. Until that exists, this is an open licence risk on roughly 319 Indian dishes — which are the India-first differentiator, so removing them is not an attractive fallback.

> **COUNSEL:** please advise on exposure here. Specifically: does relying on a licence asserted in a paper rather than in the distribution give us a defensible position, and does the derivation of INDB from IFCT 2017 create a separate claim by NIN-ICMR that CC BY 4.0 on INDB cannot cure?

### B.3 Share-alike discipline

Any change to a CC BY-SA drawing — crop, recolour, recombine — makes the result a derivative that must be released under the same licence with the same credit. Practical rule for the team: **do not edit these images.** If an edit is genuinely needed, record it and release the edited file under the same licence.

### B.4 Trade marks

"FitBud" is used as an unregistered trade mark; the application is pending. Do not use ® anywhere in the product, the store listings or these documents. ™ may be used.

### B.5 Maintenance

Regenerate Part A from the data whenever the library seed version changes, and re-count the drawings. The counts in Part A were verified against `exercise_library_media` after a database reset for seed `2026.10.21-v3`.
