/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PlanContent } from "@fitbud/contracts";

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

const api = vi.hoisted(() => ({
  getPlan: vi.fn(),
  getPlanVersion: vi.fn(),
  getClientWorkspace: vi.fn(),
  updatePlanDraft: vi.fn(),
  previewPlanVersion: vi.fn(),
}));

vi.mock("../../lib/api", () => ({ apiClient: api }));
vi.mock("../../hooks/useOnline", () => ({ useOnline: () => true }));
vi.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));
vi.mock("../../pages/templates/LibrarySearch", () => ({
  ExerciseSearchPane: () => <div>Exercise search</div>,
  FoodSearchPane: () => <div>Food search</div>,
}));

import { PlanBuilderPage } from "./PlanBuilderPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlanBuilderPage", () => {
  it("loads a draft and shows Publish & schedule", async () => {
    api.getPlan.mockResolvedValue({
      plan: { title: "Marathon strength", id: "p1" },
    });
    api.getPlanVersion.mockResolvedValue({
      id: "v1",
      planId: "p1",
      versionNumber: 3,
      status: "draft",
      recordVersion: 1,
      content,
      creationSource: "adjustment",
    });
    api.getClientWorkspace.mockResolvedValue({
      header: {
        traineeDisplayName: "Vikram",
        onboardingStatus: "active",
        timezone: "Asia/Kolkata",
      },
      configuration: { configuration: null },
      plan: { plan: null, version: null },
    });

    render(
      <MemoryRouter initialEntries={["/clients/r1/plan/p1/versions/v1/edit"]}>
        <Routes>
          <Route
            path="/clients/:relationshipId/plan/:planId/versions/:versionId/edit"
            element={<PlanBuilderPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Publish & schedule" })).toBeTruthy();
    });
    expect(screen.getByTestId("screen-TW-13")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
  });
});
