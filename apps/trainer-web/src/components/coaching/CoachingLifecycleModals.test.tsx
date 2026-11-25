/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("../../lib/stage1-api", () => ({ stage1Api: {} }));

import { CoachingLifecycleModals } from "./CoachingLifecycleModals";

const PRONOUN = /\b(he|she|his|her|hers|him)\b/i;

function text(mode: "end" | "reactivate", gender: string | null | undefined, plan: string | null) {
  const view = render(
    <CoachingLifecycleModals
      mode={mode}
      relationshipId="c422296e-ed7b-4196-a2b4-647096af3002"
      traineeName="Rohan Mehta"
      traineeGender={gender}
      lastPlanTitle={plan}
      onClose={() => undefined}
      onChanged={() => undefined}
    />,
  );
  const out = view.container.textContent ?? "";
  view.unmount();
  return out;
}

describe("CoachingLifecycleModals names the client by first name (D-W14-37)", () => {
  afterEach(() => cleanup());

  it.each(["end", "reactivate"] as const)("%s copy is identical for any gender and has no pronoun", (mode) => {
    const female = text(mode, "female", "Fat loss, phase 2");
    const male = text(mode, "male", "Fat loss, phase 2");
    const unset = text(mode, undefined, "Fat loss, phase 2");
    expect(male).toBe(female);
    expect(unset).toBe(female);
    expect(female).not.toMatch(PRONOUN);
    expect(text(mode, "female", null)).not.toMatch(PRONOUN);
  });

  it("uses the first name and the account/history wording", () => {
    expect(text("end", "male", null)).toContain("Rohan keeps the account and history.");
    const back = text("reactivate", "female", "Fat loss, phase 2");
    expect(back).toContain("Rohan's history, your notes, Rohan's intake answers");
    expect(back).toContain("Rohan's last plan (Fat loss, phase 2)");
    expect(back).toContain("Ask Rohan to update the intake");
  });
});
