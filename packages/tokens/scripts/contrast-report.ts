/**
 * Print the WCAG contrast table for the v3 text/background pairs, light and
 * dark, as Markdown (Z12-36; pasted into docs/qa/Z12-36/README.md).
 *
 *   pnpm --filter @fitbud/tokens contrast:v3
 */
import { measurePairs, sideLabel, V3_CONTRAST_PAIRS } from "../src/contrast.ts";
import { v3DarkColors, v3LightColors } from "../src/v3.generated.ts";

const light = measurePairs("light", v3LightColors);
const dark = measurePairs("dark", v3DarkColors);

const rows = V3_CONTRAST_PAIRS.map((pair, i) => {
  const l = light[i]!;
  const d = dark[i]!;
  const cell = (r: typeof l) => `${r.ratio.toFixed(2)}${r.pass ? "" : " **FAIL**"}`;
  return `| \`${sideLabel(pair.fg)}\` on \`${sideLabel(pair.bg)}\` | ${pair.kind} (${l.min}:1) | ${cell(l)} | ${cell(d)} | ${pair.use} |`;
});

console.log("| Pair | Kind (min) | Light | Dark | Used for |");
console.log("|---|---|---|---|---|");
for (const row of rows) console.log(row);

const failing = [...light, ...dark].filter((r) => !r.pass);
console.log("");
console.log(
  failing.length === 0
    ? `All ${light.length} pairs pass in both themes.`
    : `Failing: ${failing.map((r) => `${sideLabel(r.fg)} on ${sideLabel(r.bg)} (${r.scheme} ${r.ratio.toFixed(2)})`).join("; ")}`,
);
