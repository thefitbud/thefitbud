// Z12-35. Run with: node --test scripts/qa/device/parity-gen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { columnKey, findTables, main, mergeParity, parseProfile, screenIdOf } from "./parity-gen.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

const PROFILE = `# Screen profile

## Trainee

| Screen | Area | PNG | Purpose | Flows |
|---|---|---|---|---|
| \`TR-01a-signin-password\` | onboarding | \`png/trainee/TR-01a-signin-password.png\` | Sign in | F02 |
| \`TR-06a2-today-scrolled\` | today | \`png/trainee/TR-06a2-today-scrolled.png\` | Today, scrolled | F11 |
| \`W-03b-active-end-of-list\` | workout | \`png/trainee/W-03b-active-end-of-list.png\` | Active log | F03 |

## Trainer

| Screen | Area | PNG | Purpose | Flows |
|---|---|---|---|---|
| \`TM-01a-needs-you\` | needsyou | \`png/trainer/TM-01a-needs-you.png\` | Needs you | F17 |

## Open decisions

1. **Not a row** | with a pipe
`;

function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "parity-gen-"));
  const v3 = path.join(root, "docs/design/v3");
  fs.mkdirSync(path.join(v3, "png-dark/trainee"), { recursive: true });
  fs.writeFileSync(path.join(v3, "screen-profile.md"), PROFILE);
  fs.writeFileSync(path.join(v3, "png-dark/trainee/TR-01a-signin-password.png"), "");
  return root;
}

const screens = parseProfile(PROFILE);
const opts = { repo: fixtureRepo(), profileDir: "docs/design/v3" };

// The committed matrix's shape (docs/qa/W12/parity.md, Z12-32): prose, a Trainee table,
// a Trainer table whose header has an extra Flows column, `—` placeholders, a footer.
const COMMITTED_SHAPE = [
  "# W12 parity matrix",
  "",
  "Intro that must survive.",
  "",
  "## Trainee (TR-, W-)",
  "",
  "| Screen | Theme | Reachable | iOS | Android | App screenshots | Mock | Remaining differences |",
  "|---|---|---|---|---|---|---|---|",
  "| TR-01a | light | yes · F02 step 1 | MATCH | CLOSE | shots/TR-01a-light-ios.png | `docs/design/v3/png/trainee/TR-01a-signin-password.png` | chip \\| spacing |",
  "| TR-01a | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-01a-signin-password.png` | — |",
  "| W-03b | light | — | — | — | — | `docs/design/v3/png/trainee/W-03b-active-end-of-list.png` | — |",
  "",
  "## Trainer (TM-)",
  "",
  "| Screen | Theme | Flows | Reachable | iOS | Android | App screenshots | Mock | Remaining differences |",
  "|---|---|---|---|---|---|---|---|---|",
  "| TM-01a | light | F17 | — | — | — | — | `docs/design/v3/png/trainer/TM-01a-needs-you.png` | — |",
  "",
  "Rows: 5.",
  "",
].join("\n");

test("screen IDs are the file-name prefix", () => {
  assert.equal(screenIdOf("TR-26e-custom-food"), "TR-26e");
  assert.equal(screenIdOf("TR-06a2-today-scrolled"), "TR-06a2");
  assert.equal(screenIdOf("W-03b-active-end-of-list"), "W-03b");
  assert.equal(screenIdOf("TM-01a-needs-you"), "TM-01a");
  assert.equal(screenIdOf("not-a-screen"), null);
});

test("the profile parser reads every screen row in order and nothing else", () => {
  assert.deepEqual(
    screens.map((s) => s.id),
    ["TR-01a", "TR-06a2", "W-03b", "TM-01a"],
  );
});

test("every table with an id and a theme column is read, whatever its columns", () => {
  const tables = findTables(COMMITTED_SHAPE.split("\n"));
  assert.equal(tables.length, 2);
  assert.deepEqual(tables[0].keys, ["id", "theme", "reachable", "ios", "android", "shots", "mock", "remaining"]);
  assert.deepEqual(tables[1].keys, ["id", "theme", null, "reachable", "ios", "android", "shots", "mock", "remaining"]);
});

test("missing rows go to their own section's table, in that table's columns; nothing existing changes", () => {
  const { text, added, kept, orphans } = mergeParity(COMMITTED_SHAPE, screens, opts);
  assert.equal(kept, 4);
  assert.equal(added, 4); // TR-06a2 light/dark, W-03b dark, TM-01a dark
  assert.deepEqual(orphans, []);
  const lines = text.split("\n");
  // Every original line is still there, unchanged and in order.
  let at = 0;
  for (const original of COMMITTED_SHAPE.split("\n")) {
    const found = lines.indexOf(original, at);
    assert.ok(found >= at, `kept: ${original}`);
    at = found + 1;
  }
  const trainerHeader = lines.findIndex((l) => l.startsWith("| Screen | Theme | Flows"));
  const tmDark = lines.findIndex((l) => l.startsWith("| TM-01a | dark"));
  const trDark = lines.findIndex((l) => l.startsWith("| TR-06a2 | dark"));
  assert.ok(tmDark > trainerHeader, "the TM- row went to the Trainer table");
  assert.ok(trDark > 0 && trDark < trainerHeader, "the TR- rows stayed in the Trainee table");
  assert.equal(
    lines[tmDark],
    "| TM-01a | dark | — | — | — | — | shots/TM-01a-dark-ios.png, shots/TM-01a-dark-android.png | `docs/design/v3/png-dark/trainer/TM-01a-needs-you.png (missing)` | — |",
    "built from the Trainer table's 9 columns",
  );
  assert.equal(lines[trDark].split(" | ").length, 8, "built from the Trainee table's 8 columns");
  assert.equal(lines.filter((l) => l.startsWith("| TM-01a |")).length, 2, "no duplicated trainer rows");
  // Idempotent.
  const again = mergeParity(text, screens, opts);
  assert.equal(again.added, 0);
  assert.equal(again.text, text);
});

test("a row the profile no longer lists is kept and reported", () => {
  const withOrphan = COMMITTED_SHAPE.replace("| W-03b | light", "| TR-99z | dark | no | GAP | GAP | | | removed |\n| W-03b | light");
  const { text, orphans } = mergeParity(withOrphan, screens, opts);
  assert.deepEqual(orphans, ["TR-99z dark"]);
  assert.ok(text.includes("| TR-99z | dark | no | GAP | GAP | | | removed |"));
});

test("a fresh file gets one table with every row", () => {
  const { text, added } = mergeParity("", screens, opts);
  assert.equal(added, 8);
  assert.equal(mergeParity(text, screens, opts).text, text);
  assert.match(text, /^\| TR-01a \| light \| — \| — \| — \| shots\/TR-01a-light-ios\.png, shots\/TR-01a-light-android\.png \| docs\/design\/v3\/png\/trainee\/TR-01a-signin-password\.png \| — \|$/m);
});

test("header names map to the canonical columns", () => {
  assert.equal(columnKey("Screen ID"), "id");
  assert.equal(columnKey("Screen"), "id");
  assert.equal(columnKey("App screenshots"), "shots");
  assert.equal(columnKey("Mock path"), "mock");
  assert.equal(columnKey("iOS verdict"), "ios");
  assert.equal(columnKey("Flows"), null);
  assert.equal(columnKey("Reachable (yes/no) and how"), "reachable");
  assert.equal(columnKey("Remaining differences"), "remaining");
});

test("two rows for the same screen and theme, even in different tables, are refused", () => {
  const dup = COMMITTED_SHAPE.replace("| TM-01a | light | F17", "| TR-01a | light | F17");
  assert.throws(() => mergeParity(dup, screens, opts), /two rows for TR-01a light/);
});

test("--check passes on the committed docs/qa/W12/parity.md and a plain run leaves it unchanged", () => {
  const silence = console.error;
  console.error = () => {};
  try {
    assert.equal(main(["--check"]), 0);
  } finally {
    console.error = silence;
  }
  const committed = fs.readFileSync(path.join(repo, "docs/qa/W12/parity.md"), "utf8");
  const real = parseProfile(fs.readFileSync(path.join(repo, "docs/design/v3/screen-profile.md"), "utf8"));
  const { text, added } = mergeParity(committed, real, { repo, profileDir: "docs/design/v3" });
  assert.equal(added, 0);
  assert.equal(text, committed);
});

test("--check fails while rows are missing and passes once they exist; it never writes", () => {
  const root = fixtureRepo();
  const out = "docs/qa/W12/parity.md";
  fs.mkdirSync(path.join(root, "docs/qa/W12"), { recursive: true });
  fs.writeFileSync(path.join(root, out), COMMITTED_SHAPE);
  const silence = console.error;
  console.error = () => {};
  try {
    assert.equal(main(["--repo", root, "--check"]), 1);
    assert.equal(fs.readFileSync(path.join(root, out), "utf8"), COMMITTED_SHAPE, "--check writes nothing");
    assert.equal(main(["--repo", root]), 0);
    assert.equal(main(["--repo", root, "--check"]), 0);
  } finally {
    console.error = silence;
  }
});

test("the real screen profile parses into 185 screens with unique IDs", () => {
  const real = parseProfile(fs.readFileSync(path.join(repo, "docs/design/v3/screen-profile.md"), "utf8"));
  assert.equal(real.length, 185);
  assert.equal(new Set(real.map((s) => s.id)).size, 185);
});
