import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { fireEvent, render, screen } from "../../test/render";
import { isNetworkFailure } from "./offline";
import {
  ATTENTION_EMPTY_BODY,
  ATTENTION_ERROR_BODY,
  AttentionEmptyState,
  AttentionErrorState,
  AttentionOfflineBanner,
} from "./states";

describe("attention states", () => {
  it("renders the all-clear state (frame 43)", () => {
    render(<AttentionEmptyState />);
    expect(screen.getByText("Nobody needs you right now")).toBeTruthy();
    expect(screen.getByText(ATTENTION_EMPTY_BODY)).toBeTruthy();
  });

  it("renders the error state and Retry refetches (frame 45)", () => {
    const onRetry = vi.fn();
    render(<AttentionErrorState onRetry={onRetry} />);
    expect(screen.getByText("Couldn't load Attention")).toBeTruthy();
    expect(screen.getByText(ATTENTION_ERROR_BODY)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the offline line with the last update time (frame 44)", () => {
    render(<AttentionOfflineBanner updatedAt="9:40 am" />);
    expect(
      screen.getByText("You're offline. Showing the last update from 9:40 am."),
    ).toBeTruthy();
  });
});

describe("isNetworkFailure", () => {
  it("accepts only proven network failures", () => {
    expect(isNetworkFailure(new TypeError("Network request failed"))).toBe(
      true,
    );
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(
      isNetworkFailure(
        new ApiClientError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "x",
          requestId: "r",
        }),
      ),
    ).toBe(true);
  });

  it("never calls a schema, server or programming error offline", () => {
    expect(
      isNetworkFailure(
        Object.assign(new Error("Invalid input"), { name: "ZodError" }),
      ),
    ).toBe(false);
    expect(isNetworkFailure(new TypeError("undefined is not a function"))).toBe(
      false,
    );
    expect(isNetworkFailure(new Error("offline"))).toBe(false);
    expect(isNetworkFailure(new Error("fetch of undefined"))).toBe(false);
    expect(
      isNetworkFailure(
        new ApiClientError({
          status: 500,
          code: "INTERNAL",
          message: "x",
          requestId: "r",
        }),
      ),
    ).toBe(false);
  });
});
