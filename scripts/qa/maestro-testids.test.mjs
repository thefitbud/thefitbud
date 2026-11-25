// Z14-29 (D-W14-33, D-W14-38): stale-selector guard for Maestro flows.
// Run with: node --test scripts/qa/maestro-testids.test.mjs
//
// Every id a flow taps, waits for or asserts visible must exist as a testID in
// non-test app source, and no flow step may use the retired word "Nudge" (the
// words are "Remind" / "Send reminder" since D-W14-15; internal ids such as
// `client-nudge` keep their names and are lower case, so they do not match).
//
// Node built-ins only (Z14-42, D-W14-38): the flows are read with the small block-YAML
// reader below, never js-yaml, so this test cannot skip in the qa-scripts job, which
// installs nothing. A flow that uses YAML the reader does not handle makes it throw.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const maestroRoot = join(repoRoot, "apps/mobile/.maestro");
const sourceRoots = [join(repoRoot, "apps/mobile/src"), join(repoRoot, "packages/ui-mobile/src")];

/**
 * A small reader for the block-style YAML the Maestro flows use (Z14-42, D-W14-38):
 * comments, `- key: value` lists, nested maps and lists, plain and quoted scalars.
 * Node built-ins only, so the guard runs in the qa-scripts job, which installs
 * nothing, and cannot skip. Flow-style (`{}` / `[]`), block scalars (`|` / `>`),
 * anchors and tags are not used by any flow; the reader throws on them rather
 * than guessing, so a flow that starts using one fails loudly here.
 */
function unquote(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    let out = "";
    for (let i = 1; i < value.length; i++) {
      const ch = value[i];
      if (ch === "\\") {
        const next = value[++i];
        out += next === "n" ? "\n" : next === "t" ? "\t" : next;
      } else if (ch === '"') {
        return out;
      } else out += ch;
    }
    throw new Error(`unterminated double-quoted scalar: ${raw}`);
  }
  if (value.startsWith("'")) {
    let out = "";
    for (let i = 1; i < value.length; i++) {
      if (value[i] === "'") {
        if (value[i + 1] === "'") {
          out += "'";
          i++;
        } else return out;
      } else out += value[i];
    }
    throw new Error(`unterminated single-quoted scalar: ${raw}`);
  }
  if (/^[{[|>&*!]/.test(value)) throw new Error(`YAML construct the guard does not read: ${raw}`);
  return value.replace(/\s+#.*$/, "");
}

function splitKey(text) {
  const m = /^([^\s"'#:][^:]*?):(?:\s+(.*))?$/.exec(text);
  return m ? { key: m[1], rest: m[2] ?? "" } : null;
}

function isItem(line) {
  return line.text === "-" || line.text.startsWith("- ");
}

function parseBlock(lines, start, indent) {
  let i = start;
  if (isItem(lines[i])) {
    const items = [];
    while (i < lines.length && lines[i].indent === indent && isItem(lines[i])) {
      const rest = lines[i].text.slice(1).trim();
      if (rest === "") {
        i++;
        if (i < lines.length && lines[i].indent > indent) {
          const [node, next] = parseBlock(lines, i, lines[i].indent);
          items.push(node);
          i = next;
        } else items.push(null);
      } else if (splitKey(rest)) {
        const offset = lines[i].text.indexOf(rest);
        lines[i] = { indent: indent + offset, text: rest };
        const [node, next] = parseBlock(lines, i, indent + offset);
        items.push(node);
        i = next;
      } else {
        items.push(unquote(rest));
        i++;
      }
    }
    return [items, i];
  }
  const map = {};
  while (i < lines.length && lines[i].indent === indent && !isItem(lines[i])) {
    const kv = splitKey(lines[i].text);
    if (!kv) throw new Error(`cannot read YAML line: ${lines[i].text}`);
    i++;
    if (kv.rest === "") {
      const child = lines[i];
      if (child && (child.indent > indent || (child.indent === indent && isItem(child)))) {
        const [node, next] = parseBlock(lines, i, child.indent);
        map[kv.key] = node;
        i = next;
      } else map[kv.key] = null;
    } else map[kv.key] = unquote(kv.rest);
  }
  return [map, i];
}

export function parseYamlBlock(text) {
  const lines = text
    .split("\n")
    .map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }))
    .filter((l) => l.text !== "" && !l.text.startsWith("#"));
  if (lines.length === 0) return null;
  return parseBlock(lines, 0, lines[0].indent)[0];
}

/**
 * Ids that a flow may name although no source testID matches. Each entry needs a
 * one-line reason (a UI change belongs to another task; never change app source here).
 */
const ALLOW_LIST = new Map([
  // Example: ["some-id", "reason, follow-up Z14-xx"],
]);

const FORBIDDEN_TEXT = /\bNudge\b|Send nudge/;

function walkFiles(dir, accept) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...walkFiles(path, accept));
    else if (accept(name)) found.push(path);
  }
  return found;
}

/** Positive selectors in a parsed flow: ids and text, with where they came from. */
export function collectSelectors(commands) {
  const ids = [];
  const texts = [];
  const allStrings = [];

  function addSelector(sel) {
    if (typeof sel === "string") {
      texts.push(sel);
    } else if (sel && typeof sel === "object") {
      if (typeof sel.id === "string") ids.push(sel.id);
      if (typeof sel.text === "string") texts.push(sel.text);
    }
  }

  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "string") {
      allStrings.push(node);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "notVisible") continue;
      if (key === "assertNotVisible") continue;
      if (key === "tapOn" || key === "assertVisible" || key === "longPressOn") {
        addSelector(value);
      } else if (key === "extendedWaitUntil" && value && typeof value === "object") {
        addSelector(value.visible);
      } else if (key === "scrollUntilVisible" && value && typeof value === "object") {
        addSelector(value.element);
      } else if (key === "runFlow" && value && typeof value === "object") {
        if (value.when && typeof value.when === "object") addSelector(value.when.visible);
      }
      walk(value);
    }
  }

  walk(commands);
  return { ids, texts, allStrings };
}

/** The command list of a flow document text (the part after the `---` line). */
export function parseFlowCommands(text) {
  const parts = text.split(/^---\s*$/m);
  return parseYamlBlock(parts.length > 1 ? parts.slice(1).join("\n") : parts[0]);
}

function templateToRegex(template, prefixes) {
  // `${testIdPrefix}-remind` resolves through the literal prefixes the app passes.
  const alternatives = [];
  const lead = template.match(/^\$\{(\w*[Pp]refix\w*)\}(.*)$/s);
  const bodies = lead ? prefixes.map((p) => `${p}${lead[2]}`) : [template];
  for (const body of bodies) {
    const escaped = body
      .split(/\$\{[^}]*\}/)
      .map((part) => part.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&"))
      .join(".+");
    alternatives.push(`^${escaped}$`);
  }
  return alternatives.map((a) => new RegExp(a));
}

function collectTestIds() {
  const files = sourceRoots.flatMap((root) =>
    walkFiles(
      root,
      (name) =>
        /\.(tsx?|jsx?)$/.test(name) &&
        !/\.(test|spec)\.[tj]sx?$/.test(name) &&
        !name.endsWith(".d.ts"),
    ).filter((f) => !f.includes("__tests__")),
  );
  const literals = new Set();
  const templates = [];
  const prefixes = new Set();
  const literalRe = /testID\s*(?:=|:)\s*\{?\s*(["'])([^"'\n]+)\1/g;
  const templateRe = /testID\s*(?:=|:)\s*\{\s*`([^`\n]+)`\s*\}?/g;
  const prefixRe = /testIdPrefix\s*(?:=|:)\s*\{?\s*(["'])([^"'\n]+)\1/g;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(literalRe)) literals.add(m[2]);
    for (const m of src.matchAll(templateRe)) templates.push(m[1]);
    for (const m of src.matchAll(prefixRe)) prefixes.add(m[2]);
  }
  // testID={rowId} where `const rowId = `client-row-${...}`` is built earlier in the file.
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/testID\s*=\s*\{\s*([A-Za-z_]\w*)\s*\}/g)) {
      const decl = new RegExp(`(?:const|let)\\s+${m[1]}\\s*=\\s*\`([^\`]+)\``).exec(src);
      if (decl) templates.push(decl[1].replace(/\s+/g, ""));
    }
  }
  // Ternaries such as testID={a ? "x" : "y"} and `?? "x"` defaults.
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/testID\s*(?:=|:)\s*\{([^}\n]+)\}/g)) {
      for (const lit of m[1].matchAll(/(["'])([a-z0-9][\w-]*)\1/g)) literals.add(lit[2]);
    }
  }
  // A template like `${prefix}-${id}` has no fixed text of its own: it would match almost
  // any id (exception-more) and hide stale selectors, so it is not evidence of an id.
  const specific = templates.filter(
    (t) => t.replace(/\$\{[^}]*\}/g, "").replace(/[^A-Za-z]/g, "").length > 0,
  );
  const templateRegexes = specific.flatMap((t) => templateToRegex(t, [...prefixes]));
  return { literals, templateRegexes };
}

/** Returns a list of problems for one flow text; `known` comes from collectTestIds. */
export function checkFlowText(text, known) {
  const problems = [];
  const { ids, texts, allStrings } = collectSelectors(parseFlowCommands(text));
  for (const id of new Set(ids)) {
    if (ALLOW_LIST.has(id)) continue;
    // `${CLIENT_SLUG}` in a flow id stands for any slug.
    const probe = id.replace(/\$\{[^}]*\}/g, "SLUG");
    const ok = known.literals.has(probe) || known.templateRegexes.some((r) => r.test(probe));
    if (!ok) problems.push(`id "${id}" is not a testID in apps/mobile/src or packages/ui-mobile/src`);
  }
  for (const t of new Set([...texts, ...allStrings])) {
    if (FORBIDDEN_TEXT.test(t)) problems.push(`text "${t}" uses the retired word Nudge (use Remind / Send reminder)`);
  }
  return problems;
}

test("a flow naming a removed id is rejected (self-test)", () => {
  const known = { literals: new Set(["exception-remind"]), templateRegexes: [] };
  const stale = [
    "appId: x",
    "---",
    "- tapOn:",
    "    id: exception-more",
    "- assertVisible:",
    "    id: exception-remind",
    "- tapOn: Send nudge",
  ].join("\n");
  const problems = checkFlowText(stale, known);
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.match(problems[0], /exception-more/);
  assert.match(problems[1], /Send nudge/);

  const negative = ["appId: x", "---", "- assertNotVisible:", "    id: exception-more"].join("\n");
  assert.deepEqual(checkFlowText(negative, known), []);
});

test("slug templates match template testIDs (self-test)", () => {
  const known = {
    literals: new Set(),
    templateRegexes: templateToRegex("client-row-${slug}", []),
  };
  const flow = ["appId: x", "---", "- tapOn:", '    id: "client-row-${CLIENT_SLUG}"'].join("\n");
  assert.deepEqual(checkFlowText(flow, known), []);
});

test(
  "every id a Maestro flow selects exists as a testID, and no flow says Nudge",
  () => {
    const known = collectTestIds();
    assert.ok(known.literals.size > 50, "found too few testIDs; the source scan is broken");
    const failures = [];
    for (const file of walkFiles(maestroRoot, (n) => /\.ya?ml$/.test(n))) {
      if (file.endsWith("config.yaml")) continue;
      for (const problem of checkFlowText(readFileSync(file, "utf8"), known)) {
        failures.push(`${relative(repoRoot, file)}: ${problem}`);
      }
    }
    assert.deepEqual(failures, [], `\n${failures.join("\n")}`);
  },
);
