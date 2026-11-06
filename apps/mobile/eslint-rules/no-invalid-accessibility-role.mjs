/**
 * Guard against the AB2 crash: React Native on Android throws
 * `IllegalArgumentException("Invalid accessibility role value: ...")` from
 * `ReactAccessibilityDelegate.AccessibilityRole.fromValue` when the
 * `accessibilityRole` prop carries a value outside its Android enum. The
 * `role` prop goes through the nullable `Role.fromValue` and is safe, which is
 * why web landmarks such as "main" belong on `role`.
 *
 * Reports, on a JSX `accessibilityRole` attribute or an `accessibilityRole`
 * object property:
 *   - a string or plain template literal outside the Android set;
 *   - any `as` cast (the bug was `{"main" as "summary"}`: the cast silences
 *     TypeScript, the runtime value is still "main");
 *   - a conditional / logical expression with an invalid literal branch.
 * Expressions it cannot resolve (identifiers, calls) are allowed.
 */

/**
 * The 39 Android roles. SOURCE OF TRUTH: ANDROID_ACCESSIBILITY_ROLES in
 * apps/mobile/src/components/accessibilityRole.test.ts (AB2), which also checks
 * it against react-native's Java enum. This is a copy; the rule's own test
 * asserts the two lists are equal so drift is detected.
 */
export const ANDROID_ACCESSIBILITY_ROLES = [
  "none",
  "button",
  "dropdownlist",
  "togglebutton",
  "link",
  "search",
  "image",
  "imagebutton",
  "keyboardkey",
  "text",
  "adjustable",
  "summary",
  "header",
  "alert",
  "checkbox",
  "combobox",
  "menu",
  "menubar",
  "menuitem",
  "progressbar",
  "radio",
  "radiogroup",
  "scrollbar",
  "spinbutton",
  "switch",
  "tab",
  "tablist",
  "timer",
  "list",
  "grid",
  "pager",
  "scrollview",
  "horizontalscrollview",
  "viewgroup",
  "webview",
  "drawerlayout",
  "slidingdrawer",
  "iconmenu",
  "toolbar",
];

const allowed = new Set(ANDROID_ACCESSIBILITY_ROLES);

function isRoleKey(prop) {
  if (prop.type !== "Property") return false;
  const { key, computed } = prop;
  if (!computed && key.type === "Identifier") return key.name === "accessibilityRole";
  if (key.type === "Literal") return key.value === "accessibilityRole";
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) {
    return key.quasis[0].value.cooked === "accessibilityRole";
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
export const noInvalidAccessibilityRole = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require accessibilityRole values to be in the React Native Android set (AB2 crash guard).",
    },
    schema: [],
    messages: {
      invalidRole:
        'accessibilityRole value "{{value}}" is not a React Native Android role, so Android throws "Invalid accessibility role value: {{value}}" when it creates the view in {{file}}. Web/ARIA landmarks such as "main" belong on the `role` prop.',
      castRole:
        "Do not cast an accessibilityRole value with `as`: it hides a non-native role from TypeScript but Android still throws at runtime ({{file}}). Use a literal from the Android set, or the `role` prop for web landmarks.",
    },
  },
  create(context) {
    const file = (context.filename ?? context.getFilename()).split(/[\\/]/).slice(-3).join("/");

    function check(node) {
      switch (node.type) {
        case "JSXExpressionContainer":
          return check(node.expression);
        case "TSAsExpression":
        case "TSTypeAssertion":
          context.report({ node, messageId: "castRole", data: { file } });
          return check(node.expression);
        case "TSSatisfiesExpression":
        case "TSNonNullExpression":
          return check(node.expression);
        case "Literal":
          if (typeof node.value === "string" && !allowed.has(node.value)) {
            context.report({ node, messageId: "invalidRole", data: { value: node.value, file } });
          }
          return;
        case "TemplateLiteral":
          if (node.expressions.length === 0) {
            const value = node.quasis[0].value.cooked;
            if (!allowed.has(value)) {
              context.report({ node, messageId: "invalidRole", data: { value, file } });
            }
          }
          return;
        case "ConditionalExpression":
          check(node.consequent);
          check(node.alternate);
          return;
        case "LogicalExpression":
          check(node.left);
          check(node.right);
          return;
        default:
          // Identifiers, calls, member access: cannot be resolved here.
          return;
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.type === "JSXIdentifier" && node.name.name === "accessibilityRole" && node.value) {
          check(node.value);
        }
      },
      Property(node) {
        if (isRoleKey(node)) check(node.value);
      },
    };
  },
};

export default {
  meta: { name: "fitbud-accessibility" },
  rules: { "no-invalid-accessibility-role": noInvalidAccessibilityRole },
};
