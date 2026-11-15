/**
 * Pure parser for the v3 design kit stylesheet (`docs/design/v3/kit-v3.css`
 * and the "v3 additions" block of `docs/design/v3/src/kit.css`).
 *
 * Used by `scripts/generate-v3.ts` to write `v3.generated.ts` and
 * `tokens-v3.css`, and by `v3.test.ts` to check that the generated tokens
 * still equal the stylesheet. No file system access here, so the same code
 * runs in the generator and in the test.
 */

/** Marker that opens the additions block in `docs/design/v3/src/kit.css`. */
export const V3_ADDITIONS_MARKER = "v3 additions";

export type KitRule = { selector: string; body: string };

export type KitTypeStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing: number;
  textTransform?: "uppercase";
  /** Token name (camelCase) of the default colour, when the kit sets one. */
  color?: string;
};

export type KitTokens = {
  /** Light values, `:root` (base, then additions). */
  light: Record<string, string>;
  /** Dark values, light overlaid with `body.dark` (base, then additions). */
  dark: Record<string, string>;
  /** Text classes `.t-*` and number classes `.n-*`, keyed by camelCase name. */
  type: Record<string, KitTypeStyle>;
};

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every flat rule in the stylesheet (the kit has no at-rules or nesting). */
export function parseRules(css: string): KitRule[] {
  const rules: KitRule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const source = stripComments(css);
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    rules.push({
      selector: (match[1] ?? "").trim().replace(/\s+/g, " "),
      body: match[2] ?? "",
    });
  }
  return rules;
}

/** Declarations of one rule body, in order, as [property, value]. */
export function parseDeclarations(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const prop = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (prop.length === 0 || value.length === 0) continue;
    out.push([prop, value]);
  }
  return out;
}

/** `--brand-tint2` → `brandTint2`; `--av1-bg` → `av1Bg`. */
export function cssVarToKey(name: string): string {
  return name
    .replace(/^--/, "")
    .replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/** `brandTint2` → `--brand-tint2`; `av1Bg` → `--av1-bg`. */
export function keyToCssVar(key: string): string {
  return `--${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
}

/** Upper-case hex digits so generated values are stable; rgba stays as written. */
function normaliseValue(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value.toUpperCase() : value;
}

function customProperties(rules: KitRule[], selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (rule.selector !== selector) continue;
    for (const [prop, value] of parseDeclarations(rule.body)) {
      if (!prop.startsWith("--")) continue;
      out[cssVarToKey(prop)] = normaliseValue(value);
    }
  }
  return out;
}

function px(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const m = /^(-?\d*\.?\d+)(px)?$/.exec(value.trim());
  return m ? Number(m[1]) : undefined;
}

function typeStyles(rules: KitRule[]): Record<string, KitTypeStyle> {
  const out: Record<string, KitTypeStyle> = {};
  for (const rule of rules) {
    if (!/^\.(t|n)-[a-z]+$/.test(rule.selector)) continue;
    const decl = Object.fromEntries(parseDeclarations(rule.body));
    const fontSize = px(decl["font-size"]);
    const lineHeight = px(decl["line-height"]);
    const fontWeight = decl["font-weight"] ? Number(decl["font-weight"]) : undefined;
    if (fontSize === undefined || lineHeight === undefined || fontWeight === undefined) continue;
    const style: KitTypeStyle = {
      fontSize,
      lineHeight,
      fontWeight,
      letterSpacing: px(decl["letter-spacing"]) ?? 0,
    };
    if (decl["text-transform"] === "uppercase") style.textTransform = "uppercase";
    const color = /^var\((--[a-z0-9-]+)\)$/.exec(decl.color ?? "");
    if (color?.[1]) style.color = cssVarToKey(color[1]);
    out[cssVarToKey(rule.selector.slice(1))] = style;
  }
  return out;
}

/**
 * Resolve the v3 tokens from the kit stylesheet and the source kit that holds
 * the additions block. `kitSource` may be the whole `src/kit.css`: only the
 * part from the additions marker on is read from it.
 */
export function kitTokens(kitV3: string, kitSource: string): KitTokens {
  const markerAt = kitSource.indexOf(V3_ADDITIONS_MARKER);
  if (markerAt < 0) {
    throw new Error(`kit source has no "${V3_ADDITIONS_MARKER}" block`);
  }
  // Back up to the start of the comment that carries the marker.
  const commentAt = kitSource.lastIndexOf("/*", markerAt);
  const additions = parseRules(kitSource.slice(commentAt < 0 ? markerAt : commentAt));
  const base = parseRules(kitV3);

  const light = {
    ...customProperties(base, ":root"),
    ...customProperties(additions, ":root"),
  };
  const dark = {
    ...light,
    ...customProperties(base, "body.dark"),
    ...customProperties(additions, "body.dark"),
  };
  return { light, dark, type: typeStyles(base) };
}

const GENERATED_HEADER = [
  "/*",
  " * GENERATED FILE, do not edit by hand.",
  ' * Source: docs/design/v3/kit-v3.css and the "v3 additions" block of docs/design/v3/src/kit.css.',
  " * Regenerate: pnpm --filter @fitbud/tokens generate:v3",
  " * Checked by src/v3.test.ts.",
  " */",
].join("\n");

function tsObject(record: Record<string, unknown>): string {
  const lines = Object.entries(record).map(
    ([key, value]) => `  ${key}: ${JSON.stringify(value)},`,
  );
  return `{\n${lines.join("\n")}\n}`;
}

function tsInline(record: Record<string, unknown>): string {
  const parts = Object.entries(record).map(
    ([key, value]) => `${key}: ${JSON.stringify(value)}`,
  );
  return `{ ${parts.join(", ")} }`;
}

/** The TypeScript module written to `src/v3.generated.ts`. */
export function renderGeneratedTs(tokens: KitTokens): string {
  const typeEntries = Object.entries(tokens.type)
    .map(([key, style]) => `  ${key}: ${tsInline(style)},`)
    .join("\n");
  return `${GENERATED_HEADER}

/** v3 light colour tokens (\`:root\`). Values are CSS colours as written in the kit; \`sh\` is an "r,g,b" shadow triple. */
export const v3LightColors = ${tsObject(tokens.light)} as const;

/** v3 dark colour tokens (\`body.dark\` over light). Same keys as light. */
export const v3DarkColors = ${tsObject(tokens.dark)} as const satisfies Record<keyof typeof v3LightColors, string>;

/** v3 type scale (\`.t-*\` text and \`.n-*\` number classes). Sizes in px (= pt); \`color\` names a colour token. */
export const v3TypeScale = {
${typeEntries}
} as const;
`;
}

/**
 * The stylesheet written to `src/tokens-v3.css`: light on `:root`, and the
 * dark values that differ under `:root[data-theme="dark"]`, a selector the
 * web app does not set (D-W12-14: web dark variables defined but off).
 */
export function renderV3Css(tokens: KitTokens): string {
  const light = Object.entries(tokens.light)
    .map(([key, value]) => `  ${keyToCssVar(key)}: ${value};`)
    .join("\n");
  const dark = Object.entries(tokens.dark)
    .filter(([key, value]) => tokens.light[key] !== value)
    .map(([key, value]) => `  ${keyToCssVar(key)}: ${value};`)
    .join("\n");
  return `${GENERATED_HEADER}
:root {
${light}
}

/* Dark: D-W12-12 (mobile follows the system); D-W12-14 (web: defined, switched on by nothing). */
:root[data-theme="dark"] {
${dark}
}
`;
}
