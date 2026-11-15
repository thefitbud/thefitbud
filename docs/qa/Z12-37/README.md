# Z12-37: trainer web on v3 tokens and Inter (light only)

Captured with Playwright Chromium at 1440x900 on the demo seed (Rahul Verma), `before-*.png` on `main`, `after-*.png` on this branch.
Pages: Home, Clients, client Overview (Rohan), Plan builder (TW-13), Check-ins.

## What changed
- `tokens-v3.css` is imported after `tokens.css`. The legacy trainer-web names (`--near-black`, `--mid-grey`, `--indigo`, `--page-bg`, `--semantic-*` and the rest) are now aliases of the v3 tokens, so every rule that used them reads v3 values.
- About 680 hard-coded hex values in `styles.css`, `styles/*.css` and `home-views.css` that had an exact v3 role now use `var(--token)`. Colours with no v3 token were left as they are.
- Font: Satoshi (Fontshare link) replaced by Inter (Google Fonts, the same origin the Devanagari fallback already uses); `--font-family` is `Inter, "Noto Sans Devanagari", system-ui, sans-serif`.
- Text that used the low-contrast `--ink4` (2.28:1 on white) now uses `--ink3` (5.65:1).

## Light only, dark off
`tokens-v3.css` defines `:root[data-theme="dark"]`. Nothing in `apps/trainer-web` sets `data-theme`, and there is no `prefers-color-scheme` rule in its CSS (grep is empty), so dark is never applied.

## Grading (no v3 web mocks, D-W12-14)
| Screen | Layout vs before | Colour / type |
|---|---|---|
| Home | MATCH, no layout shift | CLOSE: coach-ink indigo is slightly bluer than the old indigo; Inter is ~2px taller per line than Satoshi (headings sit about 2px lower) |
| Clients | MATCH | CLOSE |
| Client Overview | MATCH | CLOSE |
| Plan builder | MATCH | CLOSE |
| Check-ins | MATCH | CLOSE |

## Contrast (WCAG 2.x, light tokens)
ink/card 17.16; ink2/card 9.32; ink3/card 5.65; ink3/bg 5.18; ink3/fill 4.87; coach-ink/card 7.62; coach-ink/coach-tint 6.48; white/coach-ink 7.62; done/done-tint 4.69; warn/warn-tint 4.86; crit/crit-tint 5.68; info/info-tint 5.31; coral-ink/coral-tint 4.60. All text pairs used are at or above 4.5:1. `ink4` on card is 2.28:1, so it is kept for decorative fills only.

## Notes
- I could not confirm that the Inter webfont was fetched from Google Fonts in the capture sandbox (body computed font-family is `Inter, "Noto Sans Devanagari", ...`); the glyphs in `after-*.png` look like Inter, but real loading from Google Fonts is unchecked.
- The `after-*.png` captures were taken before the last tweak (text that used `--ink4` now uses `--ink3`); that changes a few secondary-text greys in templates, plan and workspace screens only.
- Home, Clients, Overview, Plan builder and Check-ins were viewed side by side; the Overview and Check-ins pages were checked in the after captures only.
