/**
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listPlanTemplatesExtended: vi.fn(),
  listOnboardingFormTemplates: vi.fn(),
  listCheckinFormTemplates: vi.fn(),
  listClients: vi.fn(),
  getPlanTemplate: vi.fn(),
  listExerciseLibrary: vi.fn(),
  me: vi.fn(),
}));

vi.mock("../lib/http-api", () => ({
  listPlanTemplatesExtended: api.listPlanTemplatesExtended,
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    listOnboardingFormTemplates: api.listOnboardingFormTemplates,
    listCheckinFormTemplates: api.listCheckinFormTemplates,
    listClients: api.listClients,
    getPlanTemplate: api.getPlanTemplate,
    listExerciseLibrary: api.listExerciseLibrary,
    me: api.me,
  },
}));

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: {
      trainerProfile: { displayName: "Rahul Verma" },
      timezone: "Asia/Kolkata",
    },
  }),
}));

vi.mock("../hooks/useOnline", () => ({
  useOnline: () => true,
}));

import { TemplatesHub } from "./TemplatesHub";

const NOW = "2026-11-12T10:00:00.000Z";

function plan(
  id: string,
  title: string,
  templateType: "workout" | "nutrition" | "combined",
  ownership: "global" | "trainer",
) {
  return {
    id,
    title,
    templateType,
    ownership,
    trainerUserId: ownership === "trainer" ? "11111111-1111-4111-8111-111111111111" : null,
    recordVersion: 2,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function renderHub(path = "/templates") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/templates/*" element={<TemplatesHub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TemplatesHub Z12-13", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    api.listPlanTemplatesExtended.mockImplementation(
      async (query: { templateType?: string }) => ({
        nextCursor: null,
        items: [
          plan(
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
            "Fat loss base · Rahul",
            "workout",
            "trainer",
          ),
          plan(
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
            "Strength base",
            "workout",
            "global",
          ),
          plan(
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
            "Demo Indian meals",
            "nutrition",
            "trainer",
          ),
          plan(
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
            "Veg fat-loss base",
            "nutrition",
            "global",
          ),
        ].filter((item) =>
          query.templateType ? item.templateType === query.templateType : true,
        ),
      }),
    );
    api.listOnboardingFormTemplates.mockResolvedValue({
      nextCursor: null,
      items: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
          name: "FitBud intake",
          ownership: "global",
          trainerUserId: null,
          latestVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
          latestVersionNumber: 1,
          updatedAt: NOW,
        },
      ],
    });
    api.listCheckinFormTemplates.mockResolvedValue({
      nextCursor: null,
      items: [
        {
          id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
          name: "Weekly check-in",
          ownership: "global",
          trainerUserId: null,
          latestVersionId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
          latestVersionNumber: 1,
          updatedAt: NOW,
        },
      ],
    });
    api.listClients.mockResolvedValue({
      nextCursor: null,
      items: [
        {
          relationshipId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
          traineeDisplayName: "Vikram Singh",
          status: "coaching_ready",
        },
        {
          relationshipId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
          traineeDisplayName: "Kavya Ended",
          status: "ended",
        },
      ],
    });
    api.getPlanTemplate.mockResolvedValue({
      content: { workoutDays: [{ exercises: [{}, {}, {}, {}] }] },
    });
    api.listExerciseLibrary.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("renders the unified table with type filters", async () => {
    renderHub("/templates");
    await waitFor(() =>
      expect(screen.getByRole("columnheader", { name: "Template" })).toBeTruthy(),
    );
    expect(screen.getByText("Plans and forms you can reuse for any client")).toBeTruthy();
    expect(screen.getByRole("button", { name: /New template/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Workout" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nutrition" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Intake form" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Check-in form" })).toBeTruthy();
    expect(screen.getByText("Fat loss base · Rahul")).toBeTruthy();
    expect(screen.getByText("FitBud intake")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Use$/ }).length).toBeGreaterThan(0);
  });

  it("shows Mine empty for nutrition with Show FitBud base", async () => {
    api.listPlanTemplatesExtended.mockImplementation(
      async (query: { templateType?: string }) => ({
        nextCursor: null,
        items:
          query.templateType === "nutrition"
            ? [
                plan(
                  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
                  "Veg fat-loss base",
                  "nutrition",
                  "global",
                ),
              ]
            : [],
      }),
    );
    api.listOnboardingFormTemplates.mockResolvedValue({
      nextCursor: null,
      items: [],
    });
    api.listCheckinFormTemplates.mockResolvedValue({
      nextCursor: null,
      items: [],
    });

    renderHub("/templates/diets?scope=mine");
    await waitFor(() =>
      expect(screen.getByTestId("templates-mine-empty")).toBeTruthy(),
    );
    expect(
      screen.getByRole("heading", {
        name: "No nutrition templates of your own yet",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Show FitBud base" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Clear filters" }).length,
    ).toBeGreaterThan(0);
  });

  it("opens Use modal with Open draft copy", async () => {
    renderHub("/templates/workouts");
    await waitFor(() =>
      expect(screen.getByText("Strength base")).toBeTruthy(),
    );
    const useButtons = screen.getAllByRole("button", { name: /^Use$/ });
    fireEvent.click(useButtons[0]!);
    await waitFor(() =>
      expect(screen.getByTestId("use-template-modal")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Open draft" })).toBeTruthy();
    expect(
      screen.getByText(/This opens a draft plan for/i),
    ).toBeTruthy();
    expect(screen.queryByText("Kavya")).toBeNull();
  });

  it("opens Make your own copy from the base overflow", async () => {
    renderHub("/templates/workouts");
    await waitFor(() =>
      expect(screen.getByText("Strength base")).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /More actions for Strength base/i }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Make your own copy/i }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("fork-template-modal")).toBeTruthy(),
    );
    expect(
      screen.getByRole("heading", { name: "Make your own copy" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make copy" })).toBeTruthy();
  });
});
