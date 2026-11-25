/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssignPartialFailureModal } from "./AssignPartialFailureModal";

describe("AssignPartialFailureModal (frame 157)", () => {
  afterEach(() => cleanup());

  it("shows plan-published copy with Later and Retry reminders", () => {
    const onLater = vi.fn();
    const onRetry = vi.fn();
    render(
      <AssignPartialFailureModal
        planTitle="Marathon strength"
        traineeFirstName="Vikram"
        traineeGender="male"
        startLocalDate="2026-10-19"
        onLater={onLater}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("heading", { name: "Plan published, reminders not set" })).toBeTruthy();
    expect(screen.getByText(/Marathon strength is live for Vikram from Mon 19 Oct/)).toBeTruthy();
    expect(screen.getByText(/Vikram's workout reminders/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(onLater).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry reminders" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("reads the same for any gender and has no pronoun (D-W14-37)", () => {
    const read = (g: string | undefined) => {
      const v = render(
        <AssignPartialFailureModal
          planTitle="Marathon strength"
          traineeFirstName="Vikram"
          traineeGender={g}
          startLocalDate="2026-10-19"
          onLater={() => undefined}
          onRetry={() => undefined}
        />,
      );
      const t = v.baseElement.textContent ?? "";
      v.unmount();
      return t;
    };
    const female = read("female");
    expect(read("male")).toBe(female);
    expect(read(undefined)).toBe(female);
    expect(female).toContain("Vikram can still see and log the sessions.");
    expect(female).not.toMatch(/\b(he|she|his|her|hers|him)\b/i);
  });
});
