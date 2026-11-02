import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guard against the AB2 crash: React Native throws on Android when
 * `accessibilityRole` carries a value outside its Android enum.
 *
 * `BaseViewManager.setAccessibilityRole` (BaseViewManager.java:327) calls
 * `ReactAccessibilityDelegate.AccessibilityRole.fromValue(...)`, and that
 * method throws `IllegalArgumentException("Invalid accessibility role value: "
 * + value)` (ReactAccessibilityDelegate.java:307) for anything it does not
 * know. The view then fails to be created and the screen red-screens.
 *
 * The allowed set below is `enum AccessibilityRole` in
 * react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/ReactAccessibilityDelegate.java
 * for react-native 0.76 (39 values). Web/ARIA landmark roles such as `main`,
 * `navigation` or `region` are NOT in it; they belong on the `role` prop,
 * which goes through the nullable `Role.fromValue`
 * (ReactAccessibilityDelegate.java:170) and is ignored on Android instead of
 * throwing.
 */
const ANDROID_ACCESSIBILITY_ROLES = [
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
] as const;

const allowed = new Set<string>(ANDROID_ACCESSIBILITY_ROLES);

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(here, "../..");
const repoRoot = resolve(mobileRoot, "../..");

const SCAN_ROOTS = [
  join(mobileRoot, "src"),
  join(repoRoot, "packages/ui-mobile/src"),
];

function tsxFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => join(entry.parentPath ?? root, entry.name));
}

/**
 * Returns the source text of the attribute/property value that follows
 * `accessibilityRole` at `from`, so that only that expression is inspected.
 *
 * Scanning the whole file instead would let an unrelated (or dead) literal
 * elsewhere in the file satisfy the check, which is exactly the failure mode
 * this guard has to avoid.
 */
function readValueExpression(src: string, from: number): string | null {
  let i = from;
  while (i < src.length && /\s/.test(src[i]!)) i += 1;

  // `accessibilityRole="button"` / `accessibilityRole='button'`
  if (src[i] === '"' || src[i] === "'") {
    const quote = src[i]!;
    const end = src.indexOf(quote, i + 1);
    return end === -1 ? null : src.slice(i, end + 1);
  }

  // `accessibilityRole={...}` — balance braces, skipping string and template
  // contents and comments so a `}` inside them does not end the expression.
  if (src[i] !== "{") return null;
  const start = i;
  let depth = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(src, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i);
      i = close === -1 ? src.length : close + 2;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
    i += 1;
  }
  return null;
}

/** Index just past the string/template literal starting at `start`. */
function skipString(src: string, start: number): number {
  const quote = src[start]!;
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return src.length;
}

type Finding = {
  file: string;
  line: number;
  value: string;
  expression: string;
};

/**
 * A copy of `src` with COMMENT text blanked to spaces, keeping every offset
 * and newline. The occurrence scan matches against this so that prose
 * mentioning accessibilityRole - including the explanatory comment in
 * Screen.tsx, which ends "not an Android accessibilityRole:" - is not read as
 * a real occurrence. Values are still read from the original source.
 */
function maskComments(src: string): string {
  const out = src.split("");
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      const end = nl === -1 ? src.length : nl;
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i);
      const end = close === -1 ? src.length : close + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      // Strings are stepped over but NOT blanked: a computed key
      // `["accessibilityRole"]:` needs its name intact to be matched.
      i = skipString(src, i);
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** Index of `ch` at brace/bracket/paren depth 0, or -1. */
function indexAtDepthZero(src: string, ch: string, from = 0): number {
  let depth = 0;
  let i = from;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i);
      continue;
    }
    if (c === "{" || c === "[" || c === "(") depth += 1;
    else if (c === "}" || c === "]" || c === ")") depth -= 1;
    else if (c === ch && depth === 0) return i;
    i += 1;
  }
  return -1;
}

/**
 * The positions in a value expression that actually become the prop's value.
 *
 * This is what stops an `as` cast laundering an unresolvable value. The bug
 * this file guards against was `{"main" as "summary"}`: the asserted type is
 * not the value, so the type is dropped and only the operand is kept. Without
 * that, `{SOME_IMPORT as "summary"}` would look resolved, because the cast's
 * own `"summary"` is a perfectly valid role.
 *
 * A ternary's condition is likewise not a value; its two branches are. So
 * `{tappable ? "button" : "text"}` yields two slots, both literals, and
 * `{cond ? SOME_IMPORT : "text"}` yields a slot that is not.
 */
function valueSlots(expression: string): string[] {
  let e = expression.trim();
  if (e.startsWith("{") && e.endsWith("}")) e = e.slice(1, -1).trim();

  // Drop `as <Type>` / `satisfies <Type>`, keeping the operand.
  let prev: string;
  do {
    prev = e;
    e = e
      .replace(
        /\s+(?:as|satisfies)\s+(?:"[^"]*"|'[^']*'|`[^`]*`|[A-Za-z_$][\w$.]*(?:\s*\[\s*\])*)/g,
        "",
      )
      .trim();
  } while (e !== prev);

  const q = indexAtDepthZero(e, "?");
  if (q !== -1) {
    const c = indexAtDepthZero(e, ":", q + 1);
    if (c !== -1) {
      return [...valueSlots(e.slice(q + 1, c)), ...valueSlots(e.slice(c + 1))];
    }
  }
  return [e];
}

/** True when the slot is wholly one string literal with no interpolation. */
function isResolvedLiteral(slot: string): boolean {
  return /^(["'`])((?:[^"'`\\$]|\$(?!\{))*)\1$/.test(slot.trim());
}

type Occurrence = {
  file: string;
  line: number;
  expression: string;
  literals: string[];
  /** Value positions that are not a plain string literal (see valueSlots). */
  unresolved: string[];
};

function scan(): { occurrences: Occurrence[]; findings: Finding[] } {
  const occurrences: Occurrence[] = [];
  const findings: Finding[] = [];

  for (const root of SCAN_ROOTS) {
    for (const file of tsxFiles(root)) {
      const src = readFileSync(file, "utf8");
      const scannable = maskComments(src);
      // Also matches a computed key, `["accessibilityRole"]:`, which a plain
      // \baccessibilityRole\b[=:] would miss inside a spread object.
      const pattern = /(?:\baccessibilityRole\b|\[\s*["'`]accessibilityRole["'`]\s*\])\s*[=:]/g;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(scannable)) !== null) {
        const expression = readValueExpression(src, match.index + match[0].length);
        const line = src.slice(0, match.index).split("\n").length;
        const display = relative(repoRoot, file);
        if (expression === null) {
          // A bare identifier (`{ accessibilityRole: ROLE }`) is not readable
          // as a literal expression. Record it as unresolved rather than
          // skipping it, or the occurrence would vanish silently.
          const rest = src.slice(match.index + match[0].length).split("\n")[0]!.trim();
          occurrences.push({
            file: display,
            line,
            expression: rest,
            literals: [],
            unresolved: [rest || "(unreadable)"],
          });
          continue;
        }

        // Every string literal in the value expression is a candidate value:
        // this covers `"main" as "summary"` casts, both branches of a ternary
        // such as `tappable ? "button" : "text"`, and plain template literals.
        // A template with an interpolation is not a literal, so it is left out
        // here and caught by the "resolves every value" test below.
        const literals = [
          ...expression.matchAll(/(["'`])((?:[^"'`\\$]|\$(?!\{))*)\1/g),
        ].map((m) => m[2]!);
        const unresolved = valueSlots(expression).filter(
          (slot) => slot !== "" && !isResolvedLiteral(slot),
        );
        occurrences.push({ file: display, line, expression, literals, unresolved });

        for (const value of literals) {
          if (!allowed.has(value)) {
            findings.push({ file: display, line, value, expression });
          }
        }
      }
    }
  }

  return { occurrences, findings };
}

describe("accessibilityRole values are valid on Android", () => {
  const { occurrences, findings } = scan();

  it("scans the mobile and shared UI sources", () => {
    // Sanity: if the scanner silently stops matching, this fails rather than
    // passing an empty scan.
    expect(occurrences.length).toBeGreaterThan(100);
  });

  it("uses no value outside the React Native 0.76 Android AccessibilityRole set", () => {
    const message = findings
      .map(
        (f) =>
          `${f.file}:${f.line} uses accessibilityRole value "${f.value}", which React Native ` +
          `throws on when Android creates the view (Invalid accessibility role value: ${f.value}). ` +
          `Expression: ${f.expression.replace(/\s+/g, " ")}. ` +
          `Web/ARIA landmark roles belong on the \`role\` prop instead.`,
      )
      .join("\n");

    expect(message, message).toBe("");
    expect(findings).toEqual([]);
  });

  it("resolves every accessibilityRole value to a string literal", () => {
    // A text scan cannot follow a value through a variable, a concatenation or
    // a `.join()`, so such a value cannot be checked at all. Rather than pass
    // it silently, fail and make the author inline the literal (or move a web
    // landmark to `role`).
    //
    // This keys on every VALUE POSITION being a literal, not on the expression
    // containing at least one literal somewhere. That distinction is the whole
    // point: `{SOME_IMPORT as "summary"}` contains a valid literal, but the
    // value is still unknowable - and that is exactly the shape of the bug
    // this file exists to catch.
    const unresolved = occurrences.filter((o) => o.unresolved.length > 0);
    const message = unresolved
      .map(
        (o) =>
          `${o.file}:${o.line} computes its accessibilityRole (${o.expression.replace(/\s+/g, " ")}; ` +
          `unresolved: ${o.unresolved.join(", ")}), ` +
          `so this guard cannot check the value. Use a string literal, or the \`role\` prop for a ` +
          `web/ARIA landmark.`,
      )
      .join("\n");

    expect(message, message).toBe("");
  });

  it("keeps the allowed list in step with React Native's Android enum", () => {
    const require_ = createRequire(import.meta.url);
    const rnRoot = dirname(require_.resolve("react-native/package.json"));
    const javaFile = join(
      rnRoot,
      "ReactAndroid/src/main/java/com/facebook/react/uimanager/ReactAccessibilityDelegate.java",
    );

    const java = readFileSync(javaFile, "utf8");
    const block = /public enum AccessibilityRole\s*\{([\s\S]*?)\}/.exec(java);
    expect(block, `could not find enum AccessibilityRole in ${javaFile}`).not.toBeNull();

    const body = block![1]!;
    // The constant list runs up to the first `;`, before the enum's methods.
    const constants = body.slice(0, body.indexOf(";"));
    const fromJava = [...constants.matchAll(/\b([A-Z][A-Z_]*)\b/g)].map((m) =>
      m[1]!.toLowerCase(),
    );

    // If a React Native bump changes the enum, this fails loudly rather than
    // letting the hard-coded list drift out of date.
    expect([...fromJava].sort()).toEqual([...ANDROID_ACCESSIBILITY_ROLES].sort());
  });
});
