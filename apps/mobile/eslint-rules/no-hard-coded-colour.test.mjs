import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint, RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import { findColourLiteral, findNamedColour, noHardCodedColour } from "./no-hard-coded-colour.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const filename = "Button.tsx";

tester.run("no-hard-coded-colour", noHardCodedColour, {
  valid: [
    { filename, code: "const s = { color: t.colors.ink };" },
    { filename, code: "const s = { shadowColor: `rgb(${t.colors.sh})` };" },
    { filename, code: "const s = { backgroundColor: `rgba(${t.colors.sh},.14)` };" },
    { filename, code: 'const s = { backgroundColor: "transparent" };' },
    { filename, code: '<Text accessibilityLabel="Set #1 of 3" />' },
    { filename, code: "// #FFFFFF in a comment is fine\nconst a = 1;" },
    { filename, code: 'const label = "Week 3";' },
    { filename, code: 'const entity = "&#123;";' },
    // Named colours: transparent is allowed; module paths and object keys are not colours.
    { filename, code: '<View style={{ backgroundColor: "transparent" }} />' },
    { filename, code: 'const s = { color: "currentColor" };' },
    { filename, code: 'import tan from "tan";' },
    { filename, code: 'const map = { "white": t.colors.card };' },
    { filename, code: 'const label = "White rice";' },
  ],
  invalid: [
    {
      filename,
      code: 'const s = { color: "#FFFFFF" };',
      errors: [{ messageId: "colour", data: { value: "#FFFFFF" } }],
    },
    {
      filename,
      code: 'const s = { color: "#fff" };',
      errors: [{ messageId: "colour", data: { value: "#fff" } }],
    },
    {
      filename,
      code: '<View style={{ backgroundColor: "#1A1248CC" }} />',
      errors: [{ messageId: "colour", data: { value: "#1A1248CC" } }],
    },
    {
      filename,
      code: '<Check color="#25D366" />',
      errors: [{ messageId: "colour", data: { value: "#25D366" } }],
    },
    {
      filename,
      code: 'const scrim = "rgba(15, 17, 21, 0.45)";',
      errors: [{ messageId: "colour" }],
    },
    {
      filename,
      code: "const tint = `rgba(255,255,255,.14)`;",
      errors: [{ messageId: "colour" }],
    },
    {
      filename,
      code: 'const s = { color: "white" };',
      errors: [{ messageId: "colour", data: { value: "white" } }],
    },
    {
      filename,
      code: '<Check color="Black" />',
      errors: [{ messageId: "colour", data: { value: "Black" } }],
    },
    {
      filename,
      code: 'const s = { borderColor: "red", backgroundColor: "rebeccapurple" };',
      errors: [
        { messageId: "colour", data: { value: "red" } },
        { messageId: "colour", data: { value: "rebeccapurple" } },
      ],
    },
    {
      filename,
      code: "const c = `${x} #A5B4FC`;",
      errors: [{ messageId: "colour", data: { value: "#A5B4FC" } }],
    },
  ],
});

describe("findNamedColour", () => {
  it("matches a whole-string CSS named colour, in any case, but not transparent", () => {
    expect(findNamedColour("white")).toBe("white");
    expect(findNamedColour(" Navy ")).toBe("Navy");
    expect(findNamedColour("transparent")).toBeNull();
    expect(findNamedColour("whiteish")).toBeNull();
    expect(findNamedColour("Red flag")).toBeNull();
  });
});

describe("findColourLiteral", () => {
  it("finds hex and rgb() colours and nothing else", () => {
    expect(findColourLiteral("#0B7A55")).toBe("#0B7A55");
    expect(findColourLiteral("hsl(10, 50%, 50%)")).not.toBeNull();
    expect(findColourLiteral("#12345")).toBeNull();
    expect(findColourLiteral("Set #12")).toBeNull();
    expect(findColourLiteral("rgb(")).toBeNull();
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("eslint config wiring", () => {
  it("applies the rule to every primitive in src/components", async () => {
    const eslint = new ESLint({ cwd: appRoot });
    const primitives = filesUnder(join(appRoot, "src/components"));
    expect(primitives.length).toBeGreaterThan(10);
    for (const file of primitives) {
      const config = await eslint.calculateConfigForFile(file);
      expect(config.rules?.["fitbud-theme/no-hard-coded-colour"]?.[0], relative(appRoot, file)).toBe(2);
    }
  });

  it("rejects a hard-coded colour in a primitive (failing fixture)", async () => {
    const eslint = new ESLint({ cwd: appRoot });
    const [result] = await eslint.lintText(
      'import { View } from "react-native";\nexport const Bad = () => <View style={{ backgroundColor: "#FFFFFF" }} />;\n',
      { filePath: join(appRoot, "src/components/__fixture__/Bad.tsx") },
    );
    const ids = (result?.messages ?? []).map((m) => m.ruleId);
    expect(ids).toContain("fitbud-theme/no-hard-coded-colour");
  });
});
