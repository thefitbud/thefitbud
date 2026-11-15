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
 *     (`` `rgba(${t.colors.sh},.14)` ``) is fine;
 *   - a CSS named colour as the whole string (`"white"`, `"Black"`, `"red"`, …).
 *     `transparent` is allowed (it is the absence of a colour); so are
 *     `currentColor` and `inherit`. Import paths and object keys are skipped.
 * Comments are not checked. Add a token to the design kit instead of
 * disabling the rule. The only sanctioned literals are WhatsApp's own brand
 * mark colours (a third-party logo, the same in both themes), each behind an
 * eslint-disable comment that gives that reason.
 */

const HEX = /(^|[^&\w])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_])/;
const COLOUR_FN = /\b(?:rgba?|hsla?)\(\s*[-+]?\.?\d/;

/** The CSS Color Module level 4 named colours (excluding `transparent`). */
export const NAMED_COLOURS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown " +
    "burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
    "darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid " +
    "darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
    "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro " +
    "ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow " +
    "lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
    "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine " +
    "mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise " +
    "mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab " +
    "orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru " +
    "pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan " +
    "teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);

export function findNamedColour(text) {
  const value = text.trim().toLowerCase();
  return NAMED_COLOURS.has(value) ? text.trim() : null;
}

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
    docs: { description: "Disallow hex, rgb()/hsl() and named colour literals in shared primitives; use theme tokens." },
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
        if (typeof node.value !== "string") return;
        check(node, node.value);
        const parent = node.parent;
        const isModulePath =
          parent &&
          (parent.type === "ImportDeclaration" ||
            parent.type === "ExportNamedDeclaration" ||
            parent.type === "ExportAllDeclaration" ||
            parent.type === "ImportExpression");
        const isKey = parent && parent.type === "Property" && parent.key === node;
        if (isModulePath || isKey) return;
        const named = findNamedColour(node.value);
        if (named) context.report({ node, messageId: "colour", data: { value: named } });
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
