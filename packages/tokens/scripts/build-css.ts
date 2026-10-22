import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  brand,
  fontFamily,
  ink,
  rings,
  semantic,
  surface,
} from "../dist/tokens.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "../src/tokens.css");

const css = `/* Generated from src/tokens.ts — run pnpm build in @fitbud/tokens */
:root {
  --brand-indigo: ${brand.indigo};
  --brand-deep-navy: ${brand.deepNavy};
  --brand-coral: ${brand.coral};
  --brand-soft-coral: ${brand.softCoral};
  --brand-pale-lavender: ${brand.paleLavender};
  --brand-chalk: ${brand.chalk};

  --ink-900: ${ink[900]};
  --ink-700: ${ink[700]};
  --ink-500: ${ink[500]};
  --ink-200: ${ink[200]};

  --surface-page-web: ${surface.pageWeb};
  --surface-page-mobile: ${surface.pageMobile};
  --surface-card: ${surface.card};
  --border-default: ${surface.border};

  --semantic-critical-fill: ${semantic.critical.fill};
  --semantic-critical-text: ${semantic.critical.text};
  --semantic-attention-fill: ${semantic.attention.fill};
  --semantic-attention-text: ${semantic.attention.text};
  --semantic-positive-fill: ${semantic.positive.fill};
  --semantic-positive-text: ${semantic.positive.text};
  --semantic-info-fill: ${semantic.info.fill};
  --semantic-info-text: ${semantic.info.text};
  --semantic-neutral-fill: ${semantic.neutral.fill};
  --semantic-neutral-text: ${semantic.neutral.text};
  --semantic-brand-selected-fill: ${semantic.brandSelected.fill};
  --semantic-brand-selected-text: ${semantic.brandSelected.text};
  --semantic-destructive: ${semantic.destructive};

  --ring-kcal: ${rings.kcal};
  --ring-protein: ${rings.protein};
  --ring-carbs: ${rings.carbs};
  --ring-fat: ${rings.fat};
  --ring-track: ${rings.track};

  --font-family: ${fontFamily};

  /* Legacy aliases for trainer-web */
  --deep-navy: var(--brand-deep-navy);
  --indigo: var(--brand-indigo);
  --coral: var(--brand-coral);
  --soft-coral: var(--brand-soft-coral);
  --pale-lavender: var(--brand-pale-lavender);
  --near-black: var(--ink-900);
  --dark-grey: var(--ink-700);
  --mid-grey: var(--ink-500);
  --light-grey: var(--ink-200);
  --page-bg: var(--surface-page-web);
  --surface: var(--surface-card);
  --border: var(--border-default);
  --success: var(--semantic-positive-text);
  --warning: var(--semantic-attention-text);
  --error: var(--semantic-critical-text);
  --info: var(--semantic-info-text);
}
`;

writeFileSync(out, css, "utf8");
console.log("Wrote", out);
