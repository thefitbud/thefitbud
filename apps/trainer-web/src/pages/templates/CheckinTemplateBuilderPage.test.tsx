/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  CHECKIN_STANDARD_KEYS,
  type CheckinFieldDefinition,
  type CheckinFormTemplateDetail,
} from "@fitbud/contracts";
import { findCheckinFormKeyProblem, GLOBAL_CHECKIN_FORM_V2_FIELDS } from "@fitbud/core";

const api = vi.hoisted(() => ({
  getCheckinFormTemplate: vi.fn(),
  createCheckinFormTemplateVersion: vi.fn(),
}));

vi.mock("../../lib/api", () => ({ apiClient: api }));
vi.mock("../../hooks/useOnline", () => ({ useOnline: () => true }));

import { CheckinTemplateBuilderPage } from "./CheckinTemplateBuilderPage";

const TEMPLATE_ID = "7b0c9d52-3f9e-4a51-9a64-3e1f7d2c8a10";
const VERSION_ID = "7b0c9d52-3f9e-4a51-9a64-3e1f7d2c8a11";

function forkFields(): CheckinFieldDefinition[] {
  return [
    ...GLOBAL_CHECKIN_FORM_V2_FIELDS.map((field) => ({ ...field })),
    {
      id: "went-well",
      label: "What went well this week?",
      type: "long_text",
      required: false,
    },
  ] as CheckinFieldDefinition[];
}

function detail(
  fields: CheckinFieldDefinition[],
  version = 2,
  ownership: "global" | "trainer" = "trainer",
): CheckinFormTemplateDetail {
  return {
    id: TEMPLATE_ID,
    name: "Weekly check-in",
    ownership,
    latestVersionId: VERSION_ID,
    latestVersionNumber: version,
    versions: [{ id: VERSION_ID, version, fields }],
  } as unknown as CheckinFormTemplateDetail;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/templates/checkins/${TEMPLATE_ID}`]}>
      <Routes>
        <Route path="/templates/checkins/:templateId" element={<CheckinTemplateBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getCheckinFormTemplate.mockResolvedValue(detail(forkFields()));
  api.createCheckinFormTemplateVersion.mockImplementation(
    async (_id: string, body: { fields: CheckinFieldDefinition[] }) => detail(body.fields, 3),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function savedFields(): CheckinFieldDefinition[] {
  const call = api.createCheckinFormTemplateVersion.mock.calls.at(-1);
  expect(call).toBeDefined();
  return (call![1] as { fields: CheckinFieldDefinition[] }).fields;
}

describe("CheckinTemplateBuilderPage", () => {
  it("shows standard questions as charted and own questions as not charted", async () => {
    renderPage();
    const standard = await screen.findByRole("list", { name: "Standard questions" });
    expect(within(standard).getAllByText("Charted")).toHaveLength(7);
    expect(within(standard).getByText("Body measurements")).toBeTruthy();
    expect(within(standard).getByText("waist, hip, chest, arm, thigh · cm · optional")).toBeTruthy();
    const own = screen.getByRole("list", { name: "Your own questions" });
    expect(within(own).getByText("What went well this week?")).toBeTruthy();
    expect(within(own).getByText("Not charted")).toBeTruthy();
  });

  it("locks standard wording", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Body weight/ }));
    const question = screen.getByLabelText("Question") as HTMLInputElement;
    expect(question.value).toBe("Body weight");
    expect(question.disabled).toBe(true);
    expect(screen.getByText("Wording is fixed for standard questions.")).toBeTruthy();
  });

  it("saves an unedited keyed v2 form with all 14 standard keys", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Save version" }));
    await waitFor(() => expect(api.createCheckinFormTemplateVersion).toHaveBeenCalled());
    const fields = savedFields();
    expect(fields.flatMap((field) => (field.key ? [field.key] : []))).toEqual([
      ...CHECKIN_STANDARD_KEYS,
    ]);
    expect(findCheckinFormKeyProblem(fields)).toBeNull();
    expect(fields.at(-1)).toMatchObject({ id: "went-well" });
    expect(fields.at(-1)?.key).toBeUndefined();
    expect(await screen.findByText(/Saved as v3/)).toBeTruthy();
  });

  it("edit then save keeps keys: tip, required and a new own question", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Sleep quality/ }));
    fireEvent.change(screen.getByLabelText("Tip for the client"), {
      target: { value: "Think about the last 7 nights" },
    });
    fireEvent.click(screen.getByLabelText("Required"));

    fireEvent.click(screen.getByRole("button", { name: /Add your own question/ }));
    fireEvent.change(screen.getByLabelText(/^Label/), {
      target: { value: "Anything hurting?" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    await waitFor(() => expect(api.createCheckinFormTemplateVersion).toHaveBeenCalled());
    const fields = savedFields();
    expect(new Set(fields.flatMap((field) => (field.key ? [field.key] : [])))).toEqual(
      new Set(CHECKIN_STANDARD_KEYS),
    );
    expect(fields.find((field) => field.key === "sleep_quality")).toMatchObject({
      id: "sleep_quality",
      label: "Sleep quality",
      required: true,
      helpText: "Think about the last 7 nights",
    });
    const hurting = fields.find((field) => field.label === "Anything hurting?");
    expect(hurting?.key).toBeUndefined();
  });

  it("measurement picker removes a key and saving drops only that key", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Body measurements/ }));
    const trigger = screen.getByRole("button", { name: "Measurements to collect" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: "Measurements to collect" });
    expect(within(panel).getByText("At the navel")).toBeTruthy();
    expect(within(panel).getByText("5 picked · all in cm")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("checkbox", { name: /Thigh/ }));
    expect(within(panel).getByText("4 picked · all in cm")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("group", { name: "Measurements to collect" })).toBeNull();
    expect(screen.getByText("waist, hip, chest, arm · cm · optional")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    await waitFor(() => expect(api.createCheckinFormTemplateVersion).toHaveBeenCalled());
    const keys = savedFields().flatMap((field) => (field.key ? [field.key] : []));
    expect(keys).toEqual(CHECKIN_STANDARD_KEYS.filter((key) => key !== "thigh"));
  });

  it("offers missing standard questions and adds them with their key", async () => {
    api.getCheckinFormTemplate.mockResolvedValue(
      detail(forkFields().filter((field) => field.key !== "hunger")),
    );
    renderPage();
    const add = (await screen.findByLabelText("Add a standard question")) as HTMLSelectElement;
    fireEvent.change(add, { target: { value: "hunger" } });
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    await waitFor(() => expect(api.createCheckinFormTemplateVersion).toHaveBeenCalled());
    const fields = savedFields();
    expect(fields.find((field) => field.key === "hunger")).toMatchObject({
      id: "hunger",
      label: "Hunger",
      type: "scale_1_5",
    });
    expect(fields.at(-1)?.id).toBe("went-well");
  });

  it("v1 fork: own charted measurement is not marked Not charted, and adding the standard one converts it", async () => {
    api.getCheckinFormTemplate.mockResolvedValue(
      detail([
        { id: "waist", label: "Waist", type: "measurement", measurementType: "waist_cm", required: true },
        { id: "wellbeing", label: "Wellbeing", type: "short_text", required: true },
      ] as CheckinFieldDefinition[]),
    );
    renderPage();
    const own = await screen.findByRole("list", { name: "Your own questions" });
    const waistRow = within(own).getByText("Waist").closest("li")!;
    expect(within(waistRow).getByText("Charted")).toBeTruthy();
    expect(within(waistRow).queryByText("Not charted")).toBeNull();
    const wellbeingRow = within(own).getByText("Wellbeing").closest("li")!;
    expect(within(wellbeingRow).getByText("Not charted")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Add a standard question"), {
      target: { value: "body" },
    });
    expect(screen.queryByText("Another question uses this label.")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Your own questions" })).queryByText("Waist")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    await waitFor(() => expect(api.createCheckinFormTemplateVersion).toHaveBeenCalled());
    const waists = savedFields().filter(
      (field) => field.type === "measurement" && field.measurementType === "waist_cm",
    );
    expect(waists).toHaveLength(1);
    expect(waists[0]).toMatchObject({ id: "waist", key: "waist", required: true });
  });

  it("own measurement question offers only the Other metric", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /What went well this week/ }));
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "measurement" } });
    const metric = screen.getByLabelText("Metric") as HTMLSelectElement;
    expect([...metric.options].map((option) => option.value)).toEqual(["other"]);
  });

  it("global form is read-only with Fork to edit", async () => {
    api.getCheckinFormTemplate.mockResolvedValue(detail(forkFields(), 2, "global"));
    renderPage();
    expect(await screen.findByRole("button", { name: "Fork to edit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
    expect(screen.queryByLabelText("Add a standard question")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add your own question/ })).toBeNull();
  });
});
