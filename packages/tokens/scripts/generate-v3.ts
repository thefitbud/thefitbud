/**
 * Generate the v3 tokens from the design kit (Z12-36).
 *
 *   pnpm --filter @fitbud/tokens generate:v3
 *
 * Reads docs/design/v3/kit-v3.css and the "v3 additions" block of
 * docs/design/v3/src/kit.css, then writes src/v3.generated.ts and
 * src/tokens-v3.css. src/v3.test.ts fails when either file is stale.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kitTokens, renderGeneratedTs, renderV3Css } from "../src/kitCss.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const kitV3 = readFileSync(join(repo, "docs/design/v3/kit-v3.css"), "utf8");
const kitSource = readFileSync(join(repo, "docs/design/v3/src/kit.css"), "utf8");

const tokens = kitTokens(kitV3, kitSource);
const tsOut = join(here, "../src/v3.generated.ts");
const cssOut = join(here, "../src/tokens-v3.css");
writeFileSync(tsOut, renderGeneratedTs(tokens), "utf8");
writeFileSync(cssOut, renderV3Css(tokens), "utf8");
console.log(
  `Wrote ${Object.keys(tokens.light).length} colour tokens per theme and ${Object.keys(tokens.type).length} type styles to`,
  tsOut,
  "and",
  cssOut,
);
