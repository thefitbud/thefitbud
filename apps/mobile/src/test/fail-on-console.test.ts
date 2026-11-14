import { describe, expect, it, vi } from "vitest";
import { isAllowedConsoleError } from "./fail-on-console";

describe("fail-on-console allow-list (Z12-35)", () => {
  it("allows only react-native-web's nested <button> warning", () => {
    expect(
      isAllowedConsoleError([
        "Warning: validateDOMNesting(...): %s cannot appear as a descendant of <%s>.%s",
        "<button>",
        "button",
        "\n    at button",
      ]),
    ).toBe(true);
  });

  it("does not allow any other DOM nesting, React warning or error", () => {
    expect(
      isAllowedConsoleError([
        "Warning: validateDOMNesting(...): %s cannot appear as a descendant of <%s>.%s",
        "<div>",
        "p",
        "",
      ]),
    ).toBe(false);
    expect(
      isAllowedConsoleError(['Warning: Each child in a list should have a unique "key" prop.%s%s']),
    ).toBe(false);
    expect(isAllowedConsoleError([new Error("boom")])).toBe(false);
    expect(isAllowedConsoleError([])).toBe(false);
  });

  it("lets a test that expects an error opt out with a mocked spy", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    console.error("expected by this test");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
