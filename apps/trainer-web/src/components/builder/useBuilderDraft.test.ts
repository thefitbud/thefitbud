/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type { PlanContent } from "@fitbud/contracts";
import { useBuilderDraft } from "./useBuilderDraft";

const content: PlanContent = {
  workoutDays: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      order: 1,
      name: "Lower A",
      weekday: 2,
      required: true,
      exercises: [],
    },
  ],
  mealPrescriptions: [],
};

describe("useBuilderDraft conflict", () => {
  it("marks conflict and keepMine clears it after prepare", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError({
          status: 409,
          code: "STALE_RECORD_VERSION",
          message: "stale",
          requestId: "r1",
        }),
      )
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useBuilderDraft({
        initialContent: content,
        title: "Plan",
        save,
        enabled: true,
      }),
    );

    act(() => {
      result.current.setContent((current) => ({
        ...current,
        workoutDays: current.workoutDays.map((day) => ({ ...day, name: "Lower B" })),
      }));
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.saveState.kind).toBe("conflict");

    const prepare = vi.fn(async () => undefined);
    await act(async () => {
      await result.current.keepMine(prepare);
    });

    expect(prepare).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.saveState.kind).toBe("saved");
    });
    expect(save).toHaveBeenCalledTimes(2);
  });
});
