/**
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
import { UsedByCell } from "./templates/UsedByCell";

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
    const tabs = within(screen.getByRole("tablist", { name: "Template types" }));
    expect(tabs.getByRole("tab", { name: /^All/ })).toBeTruthy();
    expect(tabs.getByRole("tab", { name: /^Workouts/ })).toBeTruthy();
    expect(tabs.getByRole("tab", { name: /^Nutrition/ })).toBeTruthy();
    expect(tabs.getByRole("tab", { name: /^Check-in forms/ })).toBeTruthy();
    expect(tabs.getByRole("tab", { name: /^Intake forms/ })).toBeTruthy();
    expect(screen.getByText("Fat loss base · Rahul")).toBeTruthy();
    expect(screen.getByText("FitBud intake")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Use for client" }).length).toBeGreaterThan(0);
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
    const useButtons = screen.getAllByRole("button", { name: "Use for client" });
    fireEvent.click(useButtons[0]!);
    await waitFor(() =>
      expect(screen.getByTestId("use-template-modal")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Open draft" })).toBeTruthy();
    const modal = screen.getByTestId("use-template-modal");
    expect(modal.textContent).toMatch(/This opens a draft plan for Vikram/i);
    expect(
      within(modal).getByRole("combobox", { name: "Client" }),
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
      screen.getByRole("menuitem", { name: /Make a copy/i }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("fork-template-modal")).toBeTruthy(),
    );
    expect(
      screen.getByRole("heading", { name: "Make a copy" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make a copy" })).toBeTruthy();
    expect(screen.getByText(/aren.t affected/)).toBeTruthy();
  });

  it("shows counts on the type tabs", async () => {
    renderHub("/templates");
    await waitFor(() => expect(screen.getByText("Strength base")).toBeTruthy());
    const tabs = within(screen.getByRole("tablist", { name: "Template types" }));
    // 2 workouts, 2 nutrition, 1 check-in form, 1 intake form: 6 in all.
    expect(tabs.getByRole("tab", { name: "All 6" })).toBeTruthy();
    expect(tabs.getByRole("tab", { name: "Workouts 2" })).toBeTruthy();
    expect(tabs.getByRole("tab", { name: "Nutrition 2" })).toBeTruthy();
    expect(tabs.getByRole("tab", { name: "Check-in forms 1" })).toBeTruthy();
    expect(tabs.getByRole("tab", { name: "Intake forms 1" })).toBeTruthy();
  });

  it("marks the Edited column so iPad widths can hide it", async () => {
    renderHub("/templates");
    await waitFor(() => expect(screen.getByText("Strength base")).toBeTruthy());
    const header = screen.getByRole("columnheader", { name: "Edited" });
    expect(header.className).toContain("col-edited");
  });
});

describe("UsedByCell", () => {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const clients = ids.map((id, index) => ({
    relationshipId: id,
    traineeDisplayName: ["Ananya Bose", "Deepak Nair", "Priya Iyer"][index]!,
    status: "coaching_ready",
  })) as never;

  afterEach(cleanup);

  it("says Not used yet only when the count is 0", () => {
    render(<UsedByCell usedBy={{ count: 0, clientIds: [] }} clients={clients} />);
    expect(screen.getByText("Not used yet")).toBeTruthy();
  });

  it("shows one client with one avatar", () => {
    render(<UsedByCell usedBy={{ count: 1, clientIds: [ids[0]!] }} clients={clients} />);
    expect(screen.getByText("1 client")).toBeTruthy();
    expect(screen.getAllByTestId("used-by-avatar")).toHaveLength(1);
  });

  it("shows two clients", () => {
    render(
      <UsedByCell
        usedBy={{ count: 2, clientIds: [ids[0]!, ids[1]!] }}
        clients={clients}
      />,
    );
    expect(screen.getByText("2 clients")).toBeTruthy();
    expect(screen.getAllByTestId("used-by-avatar")).toHaveLength(2);
  });

  it("caps the avatars at three for four or more clients", () => {
    const fourIds = [...ids, "44444444-4444-4444-8444-444444444444"];
    render(
      <UsedByCell
        usedBy={{ count: 4, clientIds: fourIds }}
        clients={clients}
      />,
    );
    expect(screen.getByText("4 clients")).toBeTruthy();
    expect(screen.getAllByTestId("used-by-avatar")).toHaveLength(3);
  });

  it("renders a dash, not a crash, when the field is missing", () => {
    render(<UsedByCell usedBy={undefined} clients={clients} />);
    expect(screen.queryByText("Not used yet")).toBeNull();
    expect(screen.getByTestId("used-by-unknown")).toBeTruthy();
  });
});
