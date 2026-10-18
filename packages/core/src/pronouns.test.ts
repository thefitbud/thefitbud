import { describe, expect, it } from "vitest";
import { possessivePronoun } from "./pronouns.js";

describe("possessivePronoun", () => {
  it("maps gender and pronoun fields, with their as fallback", () => {
    expect(possessivePronoun("Female")).toBe("her");
    expect(possessivePronoun("male")).toBe("his");
    expect(possessivePronoun("she")).toBe("her");
    expect(possessivePronoun("his")).toBe("his");
    expect(possessivePronoun(null)).toBe("their");
    expect(possessivePronoun("")).toBe("their");
    expect(possessivePronoun("nonbinary")).toBe("their");
  });
});
