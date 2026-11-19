# Z12-46 Expo-web screenshot check (D-W12-34)

Expo web in Playwright Chromium, 393x852 at 2x, light and dark (`colorScheme`), against the local seeded API (`pnpm db:reset`, demo seed, 18 Nov 2026). Expo web proves copy, structure and values, not native layout; the device shots in `docs/qa/Z12-46/` are the authority.

| File | Persona | Mock | Grade |
|---|---|---|---|
| `TR-06a-today-*-web.png` | Aarav (rest day) | TR-06a / TR-06b | CLOSE: summary card (ring "kcal eaten", "kcal left" + Goal, macros "n / n g", chips with bars) and tab bar follow the theme. Web only: the date strip and the "Wed 18 Nov" heading are the web variants of `DateNavigator` (v2, white in dark; native is themed, Z12-42 note) |
| `TR-06a2-today-scrolled-*-web.png` | Aarav | TR-06a2 | CLOSE |
| `TR-13a-progress-*-web.png` | Aarav | TR-13a | CLOSE |
| `TR-13c-log-weight-*-web.png` | Aarav | TR-13c | CLOSE: keypad value, "Last: ... on ...", Date row, Save weight, Cancel. Web focus ring and selection show on the input; Cancel sits below the button, not top-left |
| `Today-no-plan-*-web.png` | Harpreet (no plan) | none (TR-10b pattern) | CLOSE: calm card, WhatsApp prefill button, no server text |
| `TR-13b-progress-empty-*-web.png` | Harpreet | TR-13b | CLOSE |

Not captured on web: TR-14a/c/d/g (no startable or reviewed check-in row was reachable for the two web personas; they are covered by render tests and the F11 device flow).
