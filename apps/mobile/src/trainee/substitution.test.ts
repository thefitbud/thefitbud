import { describe, expect, it } from "vitest";
import { nextLoggedRowsForSubstitution } from "./substitution";

describe("nextLoggedRowsForSubstitution", () => {
  it("replaces planned prefills on the first substitute food (629+117 bug)", () => {
    const planned = [
      { label: "Dinner plan", kcalPreview: 629 },
    ];
    const substitute = { label: "Greek yogurt", kcalPreview: 117 };
    const next = nextLoggedRowsForSubstitution({
      previous: planned,
      next: substitute,
      alreadyReplaced: false,
    });
    expect(next).toEqual([substitute]);
    expect(next.reduce((sum, row) => sum + (row.kcalPreview ?? 0), 0)).toBe(
      117,
    );
  });

  it("appends further foods after the plan has been replaced", () => {
    const afterReplace = [{ label: "Greek yogurt", kcalPreview: 117 }];
    const second = { label: "Banana", kcalPreview: 90 };
    expect(
      nextLoggedRowsForSubstitution({
        previous: afterReplace,
        next: second,
        alreadyReplaced: true,
      }),
    ).toEqual([...afterReplace, second]);
  });
});
