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
    expect(screen.getByText(/his workout reminders/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(onLater).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry reminders" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
