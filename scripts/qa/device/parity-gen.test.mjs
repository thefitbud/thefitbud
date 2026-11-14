// Z12-35. Run with: node --test scripts/qa/device/parity-gen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { columnKey, main, mergeParity, parseProfile, screenIdOf } from "./parity-gen.mjs";

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
  // Only one dark mock exists, so the others are marked missing.
  fs.writeFileSync(path.join(v3, "png-dark/trainee/TR-01a-signin-password.png"), "");
  return root;
}

const screens = parseProfile(PROFILE);
const opts = { repo: fixtureRepo(), profileDir: "docs/design/v3" };

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
  assert.equal(screens[0].png, "png/trainee/TR-01a-signin-password.png");
});

test("a fresh file gets one row per screen and theme, with screenshot and mock defaults", () => {
  const { text, added, kept } = mergeParity("", screens, opts);
  assert.equal(added, 8);
  assert.equal(kept, 0);
  const rows = text.split("\n").filter((l) => /^\| (TR|TM|W)-/.test(l));
  assert.equal(rows.length, 8);
  assert.equal(
    rows[0],
    "| TR-01a | light |  |  |  | shots/TR-01a-light-ios.png, shots/TR-01a-light-android.png | docs/design/v3/png/trainee/TR-01a-signin-password.png |  |",
  );
  assert.match(rows[1], /\| TR-01a \| dark \|.*png-dark\/trainee\/TR-01a-signin-password\.png \|/);
  assert.match(rows[3], /png-dark\/trainee\/TR-06a2-today-scrolled\.png \(missing\)/);
});

test("re-running is idempotent", () => {
  const once = mergeParity("", screens, opts).text;
  const twice = mergeParity(once, screens, opts);
  assert.equal(twice.text, once);
  assert.equal(twice.added, 0);
  assert.equal(twice.kept, 8);
});

test("filled cells, the committed header and surrounding text are preserved", () => {
  // A hand-written file in the committed layout: different column titles and order,
  // one row already graded, prose before and after, and a row the profile dropped.
  const committed = [
    "# W12 parity",
    "",
    "Intro text that must survive.",
    "",
    "| Screen ID | Theme | Reachable | iOS verdict | Android verdict | App screenshots | Mock path | Remaining differences |",
    "|---|---|---|---|---|---|---|---|",
    "| TR-06a2 | light | yes · F11 step 3 | MATCH | CLOSE | shots/custom.png | docs/x.png | chip \\| spacing |",
    "| TR-99z | dark | no | GAP | GAP | | | screen removed |",
    "",
    "## Notes",
    "Trailing notes.",
    "",
  ].join("\n");
  const { text, added, kept, orphans } = mergeParity(committed, screens, opts);
  assert.equal(kept, 1);
  assert.equal(added, 7);
  assert.deepEqual(orphans, ["TR-99z dark"]);
  assert.ok(text.startsWith("# W12 parity\n\nIntro text that must survive.\n\n| Screen ID | Theme | Reachable | iOS verdict |"));
  assert.ok(text.endsWith("\n## Notes\nTrailing notes.\n"));
  assert.ok(
    text.includes("| TR-06a2 | light | yes · F11 step 3 | MATCH | CLOSE | shots/custom.png | docs/x.png | chip \\| spacing |"),
    "the graded row is kept exactly, escaped pipe included",
  );
  assert.ok(text.includes("| TR-99z | dark | no | GAP | GAP |"), "an orphan row is kept");
  // And a second run changes nothing.
  assert.equal(mergeParity(text, screens, opts).text, text);
});

test("an empty cell in an existing row is filled, a filled one is not", () => {
  const committed = [
    "| Screen ID | Theme | Reachable (how) | iOS | Android | App screenshots | Mock | Remaining differences |",
    "|---|---|---|---|---|---|---|---|",
    "| TR-01a | light | yes · F02 step 1 |  | GAP |  |  |  |",
  ].join("\n");
  const { text } = mergeParity(committed, screens, opts);
  const row = text.split("\n").find((l) => l.startsWith("| TR-01a | light"));
  assert.equal(
    row,
    "| TR-01a | light | yes · F02 step 1 |  | GAP | shots/TR-01a-light-ios.png, shots/TR-01a-light-android.png | docs/design/v3/png/trainee/TR-01a-signin-password.png |  |",
  );
});

test("header names map to the canonical columns", () => {
  assert.equal(columnKey("Screen ID"), "id");
  assert.equal(columnKey("screen"), "id");
  assert.equal(columnKey("App screenshots"), "shots");
  assert.equal(columnKey("Mock path"), "mock");
  assert.equal(columnKey("iOS verdict"), "ios");
  assert.equal(columnKey("Android"), "android");
  assert.equal(columnKey("Reachable (yes/no) and how"), "reachable");
  assert.equal(columnKey("Remaining differences"), "remaining");
  assert.equal(columnKey("Something else"), null);
});

test("two rows for the same screen and theme are refused, not silently merged", () => {
  const dup = [
    "| Screen ID | Theme | iOS |",
    "|---|---|---|",
    "| TR-01a | light | MATCH |",
    "| TR-01a | light | GAP |",
  ].join("\n");
  assert.throws(() => mergeParity(dup, screens, opts), /two rows for TR-01a light/);
});

test("--check fails while rows are missing and passes once they exist", () => {
  const root = fixtureRepo();
  const out = "docs/qa/W12/parity.md";
  const silence = console.error;
  console.error = () => {};
  try {
    assert.equal(main(["--repo", root, "--check"]), 1);
    assert.equal(fs.existsSync(path.join(root, out)), false, "--check writes nothing");
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
