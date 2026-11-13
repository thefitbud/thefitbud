import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import { noUndeclaredDependency, packageNameOf } from "./no-undeclared-dependency.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const options = [{ dependencies: ["react", "expo-modules-core", "@fitbud/ui-mobile"] }];
const filename = "Screen.tsx";

tester.run("no-undeclared-dependency", noUndeclaredDependency, {
  valid: [
    { filename, options, code: 'import React from "react";' },
    { filename, options, code: 'import { x } from "expo-modules-core";' },
    { filename, options, code: 'import { colors } from "@fitbud/ui-mobile/tokens";' },
    { filename, options, code: 'import { a } from "./local"; import { b } from "../up";' },
    { filename, options, code: 'import fs from "node:fs";' },
    { filename, options, code: 'import type { T } from "type-only-package";' },
    { filename, options, code: 'const r = require("react");' },
    { filename, options, code: "const r = require(name);" },
    { filename, options, code: 'const r = require("./local");' },
  ],
  invalid: [
    {
      filename,
      options,
      code: 'try { const k = require("expo-keep-awake"); } catch {}',
      errors: [{ messageId: "undeclared", data: { name: "expo-keep-awake" } }],
    },
    {
      filename,
      options,
      code: 'import { useKeepAwake } from "expo-keep-awake";',
      errors: [{ messageId: "undeclared" }],
    },
    {
      filename,
      options,
      code: 'import("expo-haptics");',
      errors: [{ messageId: "undeclared" }],
    },
    {
      filename,
      options,
      code: 'export * from "expo-haptics";',
      errors: [{ messageId: "undeclared" }],
    },
    {
      filename,
      options,
      code: 'import x from "@scope/pkg/deep/path";',
      errors: [{ messageId: "undeclared", data: { name: "@scope/pkg" } }],
    },
  ],
});

describe("packageNameOf", () => {
  it("returns the package root", () => {
    expect(packageNameOf("react-native/Libraries/x")).toBe("react-native");
    expect(packageNameOf("@scope/pkg/sub")).toBe("@scope/pkg");
  });
});

describe("mobile package.json", () => {
  it("lists expo-modules-core and not expo-keep-awake (native, held for the Expo upgrade)", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
    );
    expect(pkg.dependencies["expo-modules-core"]).toBeDefined();
    expect(pkg.dependencies["expo-keep-awake"]).toBeUndefined();
  });
});
