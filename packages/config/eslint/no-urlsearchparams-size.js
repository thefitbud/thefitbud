/**
 * Bans `.size` on URLSearchParams (Z11b-1).
 *
 * On iOS and Android, Expo replaces the global `URLSearchParams` with
 * `whatwg-url-without-unicode`, which has no `size` property. The api-client's
 * `params.size > 0` check was therefore always false on device and every query
 * string was dropped. Use `params.toString()` (api-client: `queryString(params)`).
 *
 * Scope-aware, so Map/Set `.size` is never reported. Reports `.size` on:
 *   - a variable initialised with `new URLSearchParams(...)`;
 *   - a variable or parameter annotated `URLSearchParams`;
 *   - `new URLSearchParams(...).size` directly;
 *   - any `<expr>.searchParams.size` (URL#searchParams is the same class).
 */

const MESSAGE =
  "URLSearchParams has no `size` on iOS/Android (Expo's polyfill). Use `params.toString()` / `queryString(params)` instead.";

function isNewURLSearchParams(node) {
  return (
    node?.type === "NewExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "URLSearchParams"
  );
}

function isURLSearchParamsAnnotation(id) {
  const type = id?.typeAnnotation?.typeAnnotation;
  return (
    type?.type === "TSTypeReference" &&
    type.typeName.type === "Identifier" &&
    type.typeName.name === "URLSearchParams"
  );
}

function isSizeAccess(node) {
  if (node.type !== "MemberExpression") return false;
  if (!node.computed) return node.property.type === "Identifier" && node.property.name === "size";
  return node.property.type === "Literal" && node.property.value === "size";
}

/** @type {import("eslint").Rule.RuleModule} */
export const noUrlSearchParamsSize = {
  meta: {
    type: "problem",
    docs: { description: "Disallow URLSearchParams#size, which Expo's native polyfill lacks." },
    schema: [],
    messages: { size: MESSAGE },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function report(node) {
      context.report({ node, messageId: "size" });
    }

    function checkVariable(variable) {
      for (const reference of variable.references) {
        const parent = reference.identifier.parent;
        if (parent && isSizeAccess(parent) && parent.object === reference.identifier) {
          report(parent);
        }
      }
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier") return;
        if (!isNewURLSearchParams(node.init) && !isURLSearchParamsAnnotation(node.id)) return;
        for (const variable of sourceCode.getDeclaredVariables(node)) checkVariable(variable);
      },
      Identifier(node) {
        // Parameters annotated `URLSearchParams`.
        if (!isURLSearchParamsAnnotation(node)) return;
        const fn = node.parent;
        if (!fn || !("params" in fn) || !fn.params.includes(node)) return;
        for (const variable of sourceCode.getDeclaredVariables(fn)) {
          if (variable.name === node.name) checkVariable(variable);
        }
      },
      MemberExpression(node) {
        if (!isSizeAccess(node)) return;
        const object = node.object;
        if (isNewURLSearchParams(object)) report(node);
        else if (
          object.type === "MemberExpression" &&
          !object.computed &&
          object.property.type === "Identifier" &&
          object.property.name === "searchParams"
        ) {
          report(node);
        }
      },
    };
  },
};

export default { rules: { "no-urlsearchparams-size": noUrlSearchParamsSize } };
