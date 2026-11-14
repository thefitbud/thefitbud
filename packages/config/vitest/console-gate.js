/**
 * The console-error gate for every vitest workspace (Z12-35, D-W12-28). Pure functions;
 * `fail-on-console.js` is the setup file that wires them into beforeEach/afterEach.
 *
 * On a device the same call prints an error in the native log, which the W12 device
 * gate (scripts/qa/device/) fails on, so a unit test that triggers one has found a real
 * problem: a React key warning, a state update after unmount, an error a catch reported.
 *
 * A test that expects an error on purpose says so explicitly, which replaces the
 * recorder for that test:
 *
 *   const spy = vi.spyOn(console, "error").mockImplementation(() => {});
 *
 * ## Allow-list (D-W12-28)
 *
 * Each entry needs a written reason and the ID of the task that removes it. Nothing else
 * is allowed.
 *
 * 1. React DOM's `validateDOMNesting`, `<button>` inside `<button>` only (apps/mobile
 *    render tests). react-native-web renders a Pressable with role "button" as an HTML
 *    `<button>`, and HTML forbids nesting them; on a device the nesting is legal React
 *    Native, so this message never reaches a device log. It still points at something
 *    worth fixing: in `WorkoutTab` the `OverflowMenu` button sits inside the day card's
 *    button, and on iOS an accessible parent hides the inner control from VoiceOver.
 *    Owner: Z12-44/Z12-45 (WorkoutTab), who un-nest the menu and drop this entry. Tests
 *    that hit it when the gate was turned on: WorkoutTab.render.test.tsx,
 *    WorkoutTab.week.test.tsx, WorkoutTab.pendingSummary.test.tsx,
 *    workout/coach-logged/WorkoutTab.gating.test.tsx.
 */

/** @type {ReadonlyArray<{ reason: string; owner: string; matches: (args: unknown[]) => boolean }>} */
export const ALLOWED = [
  {
    reason: "react-native-web renders nested Pressables as nested <button> (HTML-only rule)",
    owner: "Z12-44/Z12-45",
    matches: (args) =>
      typeof args[0] === "string" &&
      args[0].startsWith("Warning: validateDOMNesting(...): %s cannot appear as a descendant of <%s>.") &&
      args[1] === "<button>" &&
      args[2] === "button",
  },
];

/** @param {unknown[]} args */
export function isAllowedConsoleError(args) {
  return ALLOWED.some((entry) => entry.matches(args));
}

/** @param {unknown} arg */
function describeArg(arg) {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * Replaces console.error with a recorder (the original still prints) and returns a
 * function that restores it and throws if anything not allow-listed was recorded.
 * @param {Console} [target]
 */
export function startConsoleGate(target = console) {
  const original = target.error;
  /** @type {unknown[][]} */
  const recorded = [];
  target.error = (...args) => {
    if (!isAllowedConsoleError(args)) recorded.push(args);
    original.apply(target, args);
  };
  return function finish() {
    target.error = original;
    if (recorded.length === 0) return;
    const lines = recorded
      .map((args, i) => `  ${i + 1}. ${args.map(describeArg).join(" ").slice(0, 400)}`)
      .join("\n");
    throw new Error(
      `console.error was called ${recorded.length} time(s) during this test (Z12-35 gate, D-W12-28). ` +
        `Fix the cause, or spy on console.error with mockImplementation if the test expects it:\n${lines}`,
    );
  };
}
