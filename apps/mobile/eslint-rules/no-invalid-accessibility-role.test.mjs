import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import plugin, {
  ANDROID_ACCESSIBILITY_ROLES,
  noInvalidAccessibilityRole,
} from "./no-invalid-accessibility-role.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const filename = "Screen.tsx";

tester.run("no-invalid-accessibility-role", noInvalidAccessibilityRole, {
  valid: [
    { filename, code: '<View accessibilityRole="button" />' },
    { filename, code: "<View accessibilityRole={'header'} />" },
    { filename, code: "<View accessibilityRole={`summary`} />" },
    { filename, code: '<View role="main" />' },
    { filename, code: '<View accessibilityRole={tappable ? "button" : "text"} />' },
    // Unresolvable expressions are allowed.
    { filename, code: "<View accessibilityRole={roleFromProps} />" },
    { filename, code: "<View accessibilityRole={getRole(kind)} />" },
    { filename, code: "const p = { accessibilityRole: ROLE };" },
    { filename, code: 'const p = { accessibilityRole: "tab" };' },
    // Unrelated props and keys are not checked.
    { filename, code: '<View testID="main" />' },
    { filename, code: 'const p = { role: "main" };' },
  ],
  invalid: [
    {
      filename,
      code: '<View accessibilityRole="main" />',
      errors: [{ messageId: "invalidRole", data: { value: "main", file: filename } }],
    },
    {
      filename,
      code: "<View accessibilityRole={`navigation`} />",
      errors: [{ messageId: "invalidRole" }],
    },
    // AB2's exact bug at e145572.
    {
      filename,
      code: '<View accessibilityRole={"main" as "summary"} />',
      errors: [{ messageId: "castRole" }, { messageId: "invalidRole" }],
    },
    // A cast is reported even when the operand is valid or unresolvable.
    {
      filename,
      code: "<View accessibilityRole={ROLE as AccessibilityRole} />",
      errors: [{ messageId: "castRole" }],
    },
    {
      filename,
      code: '<View accessibilityRole={tappable ? "region" : "text"} />',
      errors: [{ messageId: "invalidRole" }],
    },
    {
      filename,
      code: '<View accessibilityRole={a ? "button" : b ? "text" : "banner"} />',
      errors: [{ messageId: "invalidRole" }],
    },
    {
      filename,
      code: 'const p = { accessibilityRole: "main" };',
      errors: [{ messageId: "invalidRole" }],
    },
    {
      filename,
      code: 'const p = { ["accessibilityRole"]: "complementary" };',
      errors: [{ messageId: "invalidRole" }],
    },
  ],
});

describe("role list", () => {
  it("equals AB2's list in accessibilityRole.test.ts", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      resolve(here, "../src/components/accessibilityRole.test.ts"),
      "utf8",
    );
    const block = /ANDROID_ACCESSIBILITY_ROLES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(src);
    expect(block, "could not find the role list in AB2's test").not.toBeNull();
    const ab2 = [...block[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(ab2).toHaveLength(39);
    expect(ANDROID_ACCESSIBILITY_ROLES).toEqual(ab2);
  });

  it("is exposed as a plugin rule", () => {
    expect(plugin.rules["no-invalid-accessibility-role"]).toBe(noInvalidAccessibilityRole);
  });
});
