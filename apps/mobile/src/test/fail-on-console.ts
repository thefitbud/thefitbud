/**
 * Fails any mobile test that writes to `console.error` (Z12-35, W12 device gate).
 *
 * Loaded as a `setupFiles` entry by both vitest projects in
 * `apps/mobile/vitest.config.ts`. On a device the same call would print an error
 * in the native log, which the device gate (`scripts/qa/device/`) fails on, so a
 * unit test that triggers one has found a real problem: a React key warning, a
 * state update on an unmounted component, an unhandled rejection that a catch
 * reported, and so on.
 *
 * How it works: before each test `console.error` is replaced with a recorder;
 * after the test, any recorded call fails that test with the messages. The
 * original `console.error` still prints, so the output stays readable.
 *
 * A test that expects an error on purpose (it drives an error path through
 * `reportError`, for example) says so explicitly:
 *
 * ```ts
 * const spy = vi.spyOn(console, "error").mockImplementation(() => {});
 * // ... act ...
 * expect(spy).toHaveBeenCalled();
 * ```
 *
 * `mockImplementation` replaces the recorder for that test, so the expected
 * call is not counted.
 *
 * ## Allow-list
 *
 * Every entry needs a written reason and a follow-up. Nothing else is allowed.
 *
 * 1. React DOM's `validateDOMNesting`, `<button>` inside `<button>` only.
 *    react-native-web renders a Pressable with role "button" as an HTML
 *    `<button>`, and HTML forbids nesting them. On a device the nesting is legal
 *    React Native, so this message can never appear in a device log, which is
 *    what the gate stands in for. It still points at something worth fixing: in
 *    `WorkoutTab` the `OverflowMenu` button sits inside the day card's button,
 *    and on iOS an accessible parent hides the inner control from VoiceOver.
 *    Follow-up for the WorkoutTab owner (Z12-44/45): un-nest the menu. Tests that
 *    hit it when the gate was turned on (Z12-35): WorkoutTab.render.test.tsx,
 *    WorkoutTab.week.test.tsx, WorkoutTab.pendingSummary.test.tsx and
 *    workout/coach-logged/WorkoutTab.gating.test.tsx. Drop this entry once the
 *    menu is un-nested.
 */
import { afterEach, beforeEach } from "vitest";

type Recorded = { args: unknown[] };

/** See "Allow-list" above. Each entry matches the call's arguments exactly. */
const ALLOWED: ReadonlyArray<{ reason: string; matches: (args: unknown[]) => boolean }> = [
  {
    reason: "react-native-web renders nested Pressables as nested <button> (HTML-only rule)",
    matches: (args) =>
      typeof args[0] === "string" &&
      args[0].startsWith(
        "Warning: validateDOMNesting(...): %s cannot appear as a descendant of <%s>.",
      ) &&
      args[1] === "<button>" &&
      args[2] === "button",
  },
];

export function isAllowedConsoleError(args: unknown[]): boolean {
  return ALLOWED.some((entry) => entry.matches(args));
}

const original = console.error.bind(console);
let recorded: Recorded[] = [];

function describeArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

beforeEach(() => {
  recorded = [];
  console.error = (...args: unknown[]) => {
    if (!isAllowedConsoleError(args)) recorded.push({ args });
    original(...args);
  };
});

afterEach(() => {
  const calls = recorded;
  recorded = [];
  console.error = original;
  if (calls.length === 0) return;
  const lines = calls
    .map((call, i) => `  ${i + 1}. ${call.args.map(describeArg).join(" ").slice(0, 400)}`)
    .join("\n");
  throw new Error(
    `console.error was called ${calls.length} time(s) during this test (Z12-35 gate). ` +
      `Fix the cause, or spy on console.error with mockImplementation if the test expects it:\n${lines}`,
  );
});
