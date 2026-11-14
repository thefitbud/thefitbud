import { describe, expect, it, vi } from "vitest";
// The shared console-error gate every vitest workspace loads (Z12-35, D-W12-28).
import { isAllowedConsoleError, startConsoleGate } from "../../../../packages/config/vitest/console-gate.js";

function fakeConsole() {
  const printed: unknown[][] = [];
  return { printed, error: (...args: unknown[]) => void printed.push(args) } as unknown as Console & {
    printed: unknown[][];
  };
}

describe("console-error gate (Z12-35, D-W12-28)", () => {
  it("fails a test that calls console.error, and still prints it", () => {
    const c = fakeConsole();
    const finish = startConsoleGate(c);
    c.error('Warning: Each child in a list should have a unique "key" prop.');
    expect(() => finish()).toThrow(/console\.error was called 1 time\(s\) during this test/);
    expect(c.printed).toHaveLength(1);
  });

  it("passes a test with no console.error and restores the console", () => {
    const c = fakeConsole();
    const original = c.error;
    const finish = startConsoleGate(c);
    expect(c.error).not.toBe(original);
    finish();
    expect(c.error).toBe(original);
  });

  it("allows only the written allow-list entry", () => {
    const nested = [
      "Warning: validateDOMNesting(...): %s cannot appear as a descendant of <%s>.%s",
      "<button>",
      "button",
      "",
    ];
    expect(isAllowedConsoleError(nested)).toBe(true);
    expect(isAllowedConsoleError([nested[0], "<div>", "p", ""])).toBe(false);
    expect(isAllowedConsoleError([new Error("boom")])).toBe(false);
    const c = fakeConsole();
    const finish = startConsoleGate(c);
    c.error(...nested);
    expect(() => finish()).not.toThrow();
  });

  it("lets a test that expects an error opt out with a mocked spy", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    console.error("expected by this test");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
