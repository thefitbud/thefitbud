/**
 * Z12-64: do not render a raw error `.message` into UI state setters.
 * Use `userFacingMessage(err)` / `userFacingError(err)` from `@fitbud/api-client`.
 */

const SETTERS = new Set([
  "setError",
  "setFormError",
  "setLocalError",
  "setErrorMessage",
  "setSaveError",
  "setForkError",
  "setSessionError",
  "setNudgeHint",
  "setLoadError",
  "setHint",
  "setActionError",
]);

/** @type {import("eslint").Rule.RuleModule} */
export const noRawErrorMessage = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Do not pass err.message / error.message into UI error setters (Z12-64).",
    },
    schema: [],
    messages: {
      raw: "Do not show a raw error .message. Use userFacingMessage(err) from @fitbud/api-client (Z12-64).",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        if (!SETTERS.has(node.callee.name)) return;
        const arg = node.arguments[0];
        if (!arg) return;
        if (
          arg.type === "MemberExpression" &&
          !arg.computed &&
          arg.property.type === "Identifier" &&
          arg.property.name === "message" &&
          arg.object.type === "Identifier" &&
          /^(err|error|failure)$/.test(arg.object.name)
        ) {
          context.report({ node: arg, messageId: "raw" });
        }
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier") return;
        if (!/^(message|error|copy)$/.test(node.name.name)) return;
        const value = node.value;
        if (!value || value.type !== "JSXExpressionContainer") return;
        const expr = value.expression;
        if (
          expr.type === "MemberExpression" &&
          !expr.computed &&
          expr.property.type === "Identifier" &&
          expr.property.name === "message" &&
          expr.object.type === "Identifier" &&
          /^(err|error|failure)$/.test(expr.object.name)
        ) {
          context.report({ node: expr, messageId: "raw" });
        }
      },
    };
  },
};

export default {
  rules: {
    "no-raw-error-message": noRawErrorMessage,
  },
};
