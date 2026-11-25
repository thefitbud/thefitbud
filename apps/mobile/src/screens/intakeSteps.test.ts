import { describe, expect, it } from "vitest";
import { groupIntakeSteps, intakeStepCount } from "./intakeSteps";

const fields = (n: number) => Array.from({ length: n }, (_, i) => `q${i + 1}`);
const sizes = (n: number) => groupIntakeSteps(fields(n)).map((g) => g.length);

describe("groupIntakeSteps (Z14-46, D-W14-45)", () => {
  it.each([
    [0, [0]],
    [1, [1]],
    [3, [3]],
    [4, [2, 2]],
    [5, [3, 2]],
    [7, [3, 2, 2]],
    [15, [3, 3, 3, 3, 3]],
    [16, [4, 3, 3, 3, 3]],
    [40, [8, 8, 8, 8, 8]],
  ])("%i fields give steps of %j", (count, expected) => {
    expect(sizes(count)).toEqual(expected);
  });

  it("keeps form order and every field exactly once", () => {
    for (const n of [1, 5, 14, 16, 23, 40]) {
      expect(groupIntakeSteps(fields(n)).flat()).toEqual(fields(n));
    }
  });

  it("never makes an empty step when there are questions, and sizes differ by at most one", () => {
    for (let n = 1; n <= 60; n++) {
      const s = sizes(n);
      expect(s.length).toBe(intakeStepCount(n));
      expect(Math.min(...s)).toBeGreaterThan(0);
      expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
      if (n <= 15) expect(Math.max(...s)).toBeLessThanOrEqual(3);
    }
  });

  it("the default 5-field form is two steps, not the old fixed five", () => {
    expect(intakeStepCount(5)).toBe(2);
    expect(intakeStepCount(3)).toBe(1);
  });
});
