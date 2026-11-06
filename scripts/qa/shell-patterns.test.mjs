// Z5-20 (W4 gap G17). Run with: node --test scripts/qa/shell-patterns.test.mjs
//
// Two shell habits cost W4 a red run (BT12, #234). `find ... | head -n 1` closes the pipe
// early, so under `set -o pipefail` the upstream command dies of SIGPIPE and the step
// exits 141. And a plain `grep` with a literal pattern treats `.`, `[` and friends as
// regex, so a package id such as com.thefitbud.app matches more than it says.
//
// This scans the build scripts and qa.yml as text. It fails on a `find ... | head` pipe
// and on a grep with a literal pattern and no -F. A pattern that uses regex syntax
// (an anchor, a class, an alternation) must say -E; that is not flagged.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const files = [
  path.join(repo, ".github/workflows/qa.yml"),
  path.join(here, "build-ios-sim.sh"),
  path.join(here, "build-android-apk.sh"),
];

// Logical lines: comments dropped, `\` continuations joined, with their first line number.
export function logicalLines(text) {
  const out = [];
  let buf = "";
  let start = 0;
  text.split("\n").forEach((raw, i) => {
    if (/^\s*#/.test(raw)) return;
    if (!buf) start = i + 1;
    if (/\\\s*$/.test(raw)) {
      buf += raw.replace(/\\\s*$/, " ");
      return;
    }
    out.push({ n: start, text: buf + raw });
    buf = "";
  });
  return out;
}

export function findHeadPipes(text) {
  return logicalLines(text).filter(
    ({ text: t }) => /\bfind\b[^\n]*\|[^\n]*\bhead\b/.test(t),
  );
}

// A grep whose pattern has no regex syntax once $VAR / ${VAR} are taken out, and no -F/-E/-P.
export function literalGrepsWithoutF(text) {
  const bad = [];
  const re = /\bgrep\s+((?:-[A-Za-z]+\s+)*)(?:'([^']*)'|"([^"]*)"|([^\s|;&)-][^\s|;&)]*))/g;
  for (const { n, text: t } of logicalLines(text)) {
    for (const m of t.matchAll(re)) {
      const flags = m[1];
      if (/-[A-Za-z]*[FEP]/.test(flags)) continue;
      const pattern = m[2] ?? m[3] ?? m[4];
      const bare = pattern.replace(/\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/g, "");
      if (!/[.^$*+?()[\]{}|\\]/.test(bare)) bad.push({ n, text: t.trim() });
    }
  }
  return bad;
}

for (const file of files) {
  const rel = path.relative(repo, file);
  const text = fs.readFileSync(file, "utf8");
  test(`${rel}: no find piped into head`, () => {
    assert.deepEqual(findHeadPipes(text), []);
  });
  test(`${rel}: grep with a literal pattern uses -F`, () => {
    assert.deepEqual(literalGrepsWithoutF(text), []);
  });
}

test("the detectors catch what they are meant to", () => {
  assert.equal(findHeadPipes("x=$(find d -name '*.app' | sort | head -n 1)").length, 1);
  assert.equal(findHeadPipes("x=$(find d -name '*.app' | sort | sed -n 1p)").length, 0);
  assert.equal(findHeadPipes("# find . | head").length, 0);
  assert.equal(literalGrepsWithoutF('a | grep -q "$RUNTIME"').length, 1);
  assert.equal(literalGrepsWithoutF("a | grep -i 'asia/'").length, 1);
  assert.equal(literalGrepsWithoutF('a | grep -qx "$PKG"').length, 1);
  assert.equal(literalGrepsWithoutF('a | grep -Fqx "$PKG"').length, 0);
  assert.equal(literalGrepsWithoutF("a | grep -i '^Xcode'").length, 0);
  assert.equal(literalGrepsWithoutF("a | grep -Ec '^(a|b)$'").length, 0);
});
