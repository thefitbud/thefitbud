/**
 * No hard-coded colours in shared primitives (Z12-36).
 *
 * Primitives in `src/components/**` take every colour from the theme
 * (`useTheme()` / `createThemedStyles` in src/providers/ThemeProvider.tsx), so
 * they follow the system light/dark setting (D-W12-12). A literal colour stays
 * the same in both themes and is how unreadable text gets in.
 *
 * Reports a string literal or a template-literal chunk that contains:
 *   - a hex colour: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`;
 *   - an `rgb(` / `rgba(` / `hsl(` / `hsla(` call with a literal number first
 *     (`"rgba(0,0,0,.4)"`). A template that builds one from a token
 *     (`` `rgba(${t.colors.sh},.14)` ``) is fine.
 * Comments are not checked. Add a token to the design kit instead of
 * disabling the rule. The only sanctioned literals are WhatsApp's own brand
 * mark colours (a third-party logo, the same in both themes), each behind an
 * eslint-disable comment that gives that reason.
 */

const HEX = /(^|[^&\w])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_])/;
const COLOUR_FN = /\b(?:rgba?|hsla?)\(\s*[-+]?\.?\d/;

export function findColourLiteral(text) {
  const hex = HEX.exec(text);
  if (hex) return hex[0].slice(hex[1].length);
  const fn = COLOUR_FN.exec(text);
  if (fn) return fn[0];
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
export const noHardCodedColour = {
  meta: {
    type: "problem",
    docs: { description: "Disallow hex and rgb()/hsl() colour literals in shared primitives; use theme tokens." },
    schema: [],
    messages: {
      colour:
        "Hard-coded colour '{{value}}' in a shared primitive. Read it from the theme (useTheme().colors / createThemedStyles) so it follows light and dark.",
    },
  },
  create(context) {
    function check(node, text) {
      const value = findColourLiteral(text);
      if (value) context.report({ node, messageId: "colour", data: { value } });
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

export default {
  meta: { name: "fitbud-theme" },
  rules: { "no-hard-coded-colour": noHardCodedColour },
};
