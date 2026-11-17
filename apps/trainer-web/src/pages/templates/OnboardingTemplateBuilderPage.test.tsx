/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  OnboardingFieldDefinition,
  OnboardingFormTemplateDetail,
} from "@fitbud/contracts";

const api = vi.hoisted(() => ({
  getOnboardingFormTemplate: vi.fn(),
  createOnboardingFormTemplateVersion: vi.fn(),
}));

vi.mock("../../lib/api", () => ({ apiClient: api }));
vi.mock("../../hooks/useOnline", () => ({ useOnline: () => true }));

import { OnboardingTemplateBuilderPage } from "./OnboardingTemplateBuilderPage";

const TEMPLATE_ID = "10111111-1111-4111-8111-111111111111";
const VERSION_ID = "10111111-1111-4111-8111-111111111112";

function fields(): OnboardingFieldDefinition[] {
  return [
    {
      id: "goal",
      label: "Your goal",
      type: "short_text",
      required: true,
    },
    {
      id: "medical",
      label: "Medical conditions",
      type: "long_text",
      required: false,
      highlight: true,
    },
    {
      id: "diet",
      label: "Diet preference",
      type: "single_choice",
      required: true,
      options: [
        { id: "veg", label: "Veg" },
        { id: "non_veg", label: "Non-veg" },
      ],
    },
  ];
}

function detail(
  ownership: "global" | "trainer" = "trainer",
  version = 3,
): OnboardingFormTemplateDetail {
  return {
    id: TEMPLATE_ID,
    name: "Quick intake — returning client",
    ownership,
    latestVersionId: VERSION_ID,
    latestVersionNumber: version,
    versions: [{ id: VERSION_ID, version, fields: fields() }],
  } as unknown as OnboardingFormTemplateDetail;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/templates/onboarding/${TEMPLATE_ID}`]}>
      <Routes>
        <Route
          path="/templates/onboarding/:templateId"
          element={<OnboardingTemplateBuilderPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getOnboardingFormTemplate.mockResolvedValue(detail());
  api.createOnboardingFormTemplateVersion.mockImplementation(async () =>
    detail("trainer", 4),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OnboardingTemplateBuilderPage", () => {
  it("shows question list and right Question panel", async () => {
    renderPage();
    expect(await screen.findByTestId("screen-TW-24")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Questions" });
    expect(within(list).getByText("Your goal")).toBeTruthy();
    expect(within(list).getByText(/Short text · required/)).toBeTruthy();
    expect(within(list).getByText("Medical conditions")).toBeTruthy();
    expect(within(list).getByText(/Long text · flagged for review/)).toBeTruthy();

    const panel = screen.getByRole("complementary", { name: "Question" });
    expect(within(panel).getByRole("heading", { name: "Question" })).toBeTruthy();
    expect(within(panel).getByDisplayValue("Your goal")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Publish v4/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Preview$/ })).toBeTruthy();
    expect(screen.getByText(/Onboarding form · 3 questions/)).toBeTruthy();
  });

  it("edits the selected question in the panel", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Questions" });
    fireEvent.click(
      within(list).getByRole("button", {
        name: /Medical conditions.*Long text/,
      }),
    );
    const panel = screen.getByRole("complementary", { name: "Question" });
    const input = within(panel).getByDisplayValue("Medical conditions");
    fireEvent.change(input, { target: { value: "Health history" } });
    expect(within(panel).getByDisplayValue("Health history")).toBeTruthy();
    expect(within(list).getByText("Health history")).toBeTruthy();
  });

  it("opens phone preview from Preview", async () => {
    renderPage();
    await screen.findByRole("button", { name: /^Preview$/ });
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/ }));
    expect(await screen.findByLabelText("Trainee phone preview")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Form preview" })).toBeTruthy();
  });

  it("shows Fork to edit for FitBud base forms", async () => {
    api.getOnboardingFormTemplate.mockResolvedValue(detail("global", 4));
    renderPage();
    expect(await screen.findByRole("button", { name: /Fork to edit/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull();
    expect(screen.getByText(/FitBud base · read-only/)).toBeTruthy();
  });

  it("publishes a new version", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Publish v4/ });
    const panel = screen.getByRole("complementary", { name: "Question" });
    fireEvent.change(within(panel).getByDisplayValue("Your goal"), {
      target: { value: "Main goal now" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Publish v4/ }));
    await waitFor(() =>
      expect(api.createOnboardingFormTemplateVersion).toHaveBeenCalled(),
    );
    expect(
      await screen.findByText(/Published as v4\. Clients who already answered keep their version\./),
    ).toBeTruthy();
  });
});
