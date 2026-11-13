/**
 * Bans `require()` / `import` / dynamic `import()` / `export ... from` of a bare
 * package that is not listed in this app's package.json `dependencies`
 * (Z11b-3).
 *
 * Why: with pnpm's isolated layout a package that is only a transitive
 * dependency (for example `expo-keep-awake`, pulled in by `expo`) is not
 * resolvable from `apps/mobile`. Metro treats a try-wrapped `require` as an
 * optional dependency and emits it with an undefined module id; at runtime
 * `metroRequire` reports that through `ErrorUtils.reportFatalError`, so the
 * surrounding try/catch never runs and the app crashes on device.
 *
 * Relative paths, absolute paths and `node:` builtins are ignored. Test files
 * are exempt in eslint.config.mjs, because they may use devDependencies.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function readDeclaredDependencies(packageJsonPath = resolve(here, "../package.json")) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return new Set(Object.keys(pkg.dependencies ?? {}));
}

/** "@scope/name/sub/path" -> "@scope/name"; "name/sub" -> "name". */
export function packageNameOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isBare(specifier) {
  return !(
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("~") ||
    specifier.startsWith("@/")
  );
}

/** @type {import("eslint").Rule.RuleModule} */
export const noUndeclaredDependency = {
  meta: {
    type: "problem",
    docs: { description: "Disallow require/import of packages not in package.json dependencies." },
    schema: [
      {
        type: "object",
        properties: { packageJson: { type: "string" }, dependencies: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      undeclared:
        "'{{name}}' is not listed in apps/mobile/package.json dependencies. Under pnpm it cannot be resolved from the app, and Metro turns an unresolved require into a fatal error on device. Add it as a dependency (native packages need a rebuild) or use expo-modules-core's requireOptionalNativeModule.",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const declared = options.dependencies
      ? new Set(options.dependencies)
      : readDeclaredDependencies(options.packageJson);

    function check(node, specifier) {
      if (typeof specifier !== "string" || !isBare(specifier)) return;
      const name = packageNameOf(specifier);
      if (!declared.has(name)) context.report({ node, messageId: "undeclared", data: { name } });
    }

    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") return;
        check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (node.exportKind === "type") return;
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source && node.exportKind !== "type") check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") check(node, node.source.value);
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0]?.type === "Literal"
        ) {
          check(node, node.arguments[0].value);
        }
      },
    };
  },
};

export default {
  meta: { name: "fitbud-dependencies" },
  rules: { "no-undeclared-dependency": noUndeclaredDependency },
};
