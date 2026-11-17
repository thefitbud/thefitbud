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
 * The list is empty. Its one entry (nested `<button>`s under `WorkoutTab` in
 * react-native-web) was removed by Z12-44, which un-nested the day card's controls.
 */

/** @type {ReadonlyArray<{ reason: string; owner: string; matches: (args: unknown[]) => boolean }>} */
export const ALLOWED = [];

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
