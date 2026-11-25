import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Z14-15: the wording rules in docs/spec/banned-strings.json catch the retired
// copy (D-W14-3, D-W14-15, D-W14-29). The trainer-web scan runs the same
// patterns against rendered pages; this checks the patterns themselves.
const banned = JSON.parse(
  readFileSync(
    new URL("../../../../docs/spec/banned-strings.json", import.meta.url),
    "utf8",
  ),
) as { patterns: Array<{ id: string; regex: string; flags: string }> };

function hits(id: string, text: string): boolean {
  const p = banned.patterns.find((x) => x.id === id);
  if (!p) throw new Error(`missing rule ${id}`);
  return new RegExp(p.regex, p.flags).test(text);
}

describe("retired wording rules", () => {
  it("catches a seeded Nudge in any case and form", () => {
    for (const text of ["Nudge", "nudge Aarav", "Nudges are unavailable", "Aarav nudged you", "Nudging…"]) {
      expect(hits("nudge", text)).toBe(true);
    }
    expect(hits("nudge", "Remind Aarav")).toBe(false);
    expect(hits("nudge", "Aarav sent you a reminder")).toBe(false);
  });

  it("catches a seeded bracketed support code", () => {
    for (const text of ["Not saved. (WO-SAVE)", "Couldn't reach FitBud (AUTH-NET).", "(CS-SUB-SAVE)"]) {
      expect(hits("bracketed-support-code", text)).toBe(true);
    }
    expect(hits("bracketed-support-code", "Not saved. Your entries are still here.")).toBe(false);
    expect(hits("bracketed-support-code", "Mon (IST) and 5 (of 7)")).toBe(false);
  });

  it("catches the replaced review words", () => {
    expect(hits("mark-reviewed", "Mark reviewed")).toBe(true);
    expect(hits("mark-reviewed", "Noted, keep open")).toBe(false);
    expect(hits("reviewed-still-open", "Reviewed, still open")).toBe(true);
    expect(hits("reviewed-still-open", "Noted, still open")).toBe(false);
  });
});
