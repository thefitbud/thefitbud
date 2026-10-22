import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExceptionDrawer } from "./ExceptionDrawer";

/**
 * Test that the drawer does not steal focus when onClose changes,
 * which was happening when the parent re-rendered with a new onClose
 * callback every ~4s during polling.
 */
describe("ExceptionDrawer focus behavior", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("does not steal focus from textarea when onClose callback changes", async () => {
    // Mock API calls to prevent network errors
    vi.mock("../lib/api", () => ({
      apiClient: {
        getException: vi.fn().mockResolvedValue({
          id: "exc-1",
          type: "skipped_meal",
          status: "detected",
          severity: "attention",
          summary: "Skipped meal",
          sourceEntityType: "meal_assignment",
          sourceEntityId: "meal-1",
          coachingRelationshipId: "rel-1",
          detectedAt: new Date().toISOString(),
          details: {},
        }),
        getClientWorkspace: vi.fn().mockResolvedValue({
          header: {
            traineeDisplayName: "Test Client",
            clientWhatsappE164: null,
          },
        }),
        getMealAssignment: vi.fn().mockResolvedValue({
          mealName: "Test Meal",
          windowEndsAt: new Date().toISOString(),
        }),
        acknowledgeException: vi.fn().mockResolvedValue({}),
        resolveException: vi.fn().mockResolvedValue({}),
      },
    }));

    vi.mock("../lib/stage1-api", () => ({
      stage1Api: {
        getResponsiveness: vi.fn().mockResolvedValue({
          label: "good",
        }),
      },
    }));

    function TestWrapper() {
      const [onCloseCount, setOnCloseCount] = useState(0);
      
      // Simulate parent re-render with new onClose callback
      const onClose = () => {
        console.log(`Close called: ${onCloseCount}`);
      };

      return (
        <div>
          <button
            data-testid="trigger-rerender"
            onClick={() => setOnCloseCount((c) => c + 1)}
          >
            Force Re-render
          </button>
          <ExceptionDrawer
            exceptionId="exc-1"
            onClose={onClose}
            onChanged={() => undefined}
          />
        </div>
      );
    }

    await act(async () => {
      root.render(
        <StrictMode>
          <TestWrapper />
        </StrictMode>
      );
    });

    // Wait for the drawer to render and focus the close button initially
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Find the note textarea
    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();

    // Focus the textarea (simulating user typing)
    await act(async () => {
      textarea?.focus();
    });

    expect(document.activeElement).toBe(textarea);

    // Trigger a re-render that would have created a new onClose callback
    const rerenderButton = container.querySelector(
      '[data-testid="trigger-rerender"]'
    ) as HTMLButtonElement;
    expect(rerenderButton).toBeTruthy();

    await act(async () => {
      rerenderButton.click();
    });

    // Wait for effects to run
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Focus should still be on the textarea, not stolen by the close button
    expect(document.activeElement).toBe(textarea);
  });
});
