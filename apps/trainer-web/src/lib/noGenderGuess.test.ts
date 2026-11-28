import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Trainer web never guesses a pronoun from gender (D-W14-37, D-W13-31):
// copy uses the first name or neutral wording.

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/** Offending reason for a source text, or null. Exported shape kept simple for the mutation check. */
export function genderGuessReason(text: string): string | null {
  if (/\bpossessivePronoun\b/.test(text)) return "uses possessivePronoun";
  const fnRe =
    /function\s+(pronoun|objectPronoun|possessive)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;
  for (const m of text.matchAll(fnRe)) {
    if (/["'`](his|her|him|she)["'`]/i.test(m[2] ?? "")) {
      return `defines ${m[1]}() returning a gendered word`;
    }
  }
  const arrowRe =
    /(?:const|let)\s+(pronoun|objectPronoun|possessive)\s*=\s*(?:\([^)]*\)|\w+)\s*=>[\s\S]*?;/g;
  for (const m of text.matchAll(arrowRe)) {
    if (/["'`](his|her|him|she)["'`]/i.test(m[0])) {
      return `defines ${m[1]}() returning a gendered word`;
    }
  }
  return null;
}

describe("trainer web writes no gender guess", () => {
  it("no source file imports possessivePronoun or defines a gendered pronoun helper", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const reason = genderGuessReason(readFileSync(file, "utf8"));
      if (reason) offenders.push(`${relative(SRC, file)}: ${reason}`);
    }
    expect(offenders, `Gender guesses found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the detector flags the old patterns", () => {
    expect(genderGuessReason('import { possessivePronoun } from "@fitbud/core";')).not.toBeNull();
    expect(
      genderGuessReason('function pronoun(g: string) {\n  if (g === "m") return "his";\n  return "their";\n}\n'),
    ).not.toBeNull();
    expect(genderGuessReason('function objectPronoun(g: string) {\n  return "her";\n}\n')).not.toBeNull();
    expect(genderGuessReason("const x = 1;")).toBeNull();
  });
});
