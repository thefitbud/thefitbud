import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { mealAssignmentSchema, type MealAssignment } from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));
vi.mock("../sync/SyncProvider", () => ({
  useSyncEngine: () => ({}),
  useReachability: () => null,
}));
const auth = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth.current }));

const deviate = vi.hoisted(() => vi.fn(async () => undefined));
const editEntry = vi.hoisted(() => vi.fn(async () => undefined));
const photo = vi.hoisted(() => ({
  pick: vi.fn(),
  prepare: vi.fn(),
  send: vi.fn(),
}));
vi.mock("./mealActions", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./mealActions");
  return {
    ...actual,
    deviateMealAssignment: deviate,
    editMealEntry: editEntry,
    pickMealPhoto: photo.pick,
    prepareMealPhoto: photo.prepare,
    uploadAndAttachMealPhoto: photo.send,
  };
});

import { SomethingDifferentSheet } from "./SomethingDifferentSheet";
import { peekMealSaved, resetMealSavedNotice } from "./food/mealSavedNotice";
import { currentMealPhotoJobs, resetMealPhotoJobsForTests } from "./food/mealPhotoJobs";
import { resetDeviceStorageForTests } from "../sync/storage";

const USER = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";

const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const DATE = "2026-11-13";

const assignment: MealAssignment = mealAssignmentSchema.parse({
  id: "b2222222-2222-4222-8222-222222222222",
  coachingRelationshipId: REL,
  planId: "3c1e4f2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
  planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
  mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
  mealName: "Lunch",
  localDate: DATE,
  windowStartsAt: `${DATE}T07:00:00.000Z`,
  windowEndsAt: `${DATE}T08:59:00.000Z`,
  photoRequired: false,
  status: "pending",
  scheduleStatus: "scheduled",
  prescription: {
    id: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    order: 1,
    name: "Lunch",
    scheduleHint: null,
    instructions: null,
    photoRequired: false,
    mealType: "lunch",
    items: [
      { name: "Vegetable poha", portionLabel: "1 bowl", calories: 400, proteinGrams: 20, carbsGrams: 60, fatGrams: 10 },
    ],
  },
  compliance: null,
  createdAt: `${DATE}T00:00:00.000Z`,
  updatedAt: `${DATE}T00:00:00.000Z`,
});

function renderSheet(onDone = vi.fn()) {
  render(
    <SomethingDifferentSheet
      assignment={assignment}
      relationshipId={REL}
      variant="sheet"
      onDone={onDone}
      onCancel={vi.fn()}
    />,
  );
  return onDone;
}

function expectRealHeight() {
  // One full screen with its own scroll area and a pinned footer (Z14-13);
  // no fixed-height box squeezed into the sheet.
  expect(
    screen.queryByTestId("something-different-subscreen") ?? screen.queryByTestId("ate-out-form"),
  ).toBeTruthy();
}

describe("SomethingDifferentSheet sheet variant sub-screens", () => {
  beforeEach(() => {
    deviate.mockClear();
    resetMealSavedNotice();
    auth.current = mockAuth();
  });

  it("lists the three ways in the v3 order (TR-08a)", () => {
    renderSheet();
    const titles = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
      .filter((label) =>
        ["Changed the portion", "Log it myself", "Ate out"].includes(label ?? ""),
      );
    expect(titles).toEqual(["Changed the portion", "Log it myself", "Ate out"]);
    expect(screen.getByText("Enter the kcal from the menu or label")).toBeTruthy();
  });

  it("Ate out takes the exact kcal, counts it and announces the save (TR-08c)", async () => {
    const onDone = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    expect(screen.getByText(/How many kcal\? Check the menu, the bill or the label\./)).toBeTruthy();
    expectRealHeight();
    fireEvent.change(screen.getByLabelText("Kcal"), { target: { value: "1120" } });
    expect((screen.getByLabelText("Kcal") as HTMLInputElement).value).toBe("1,120");
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    const body = (deviate.mock.calls[0] as unknown[])[2];
    expect(body).toEqual({
      deviationKind: "restaurant",
      notes: null,
      photoIntent: null,
      items: [{ customFood: { name: "Ate out", kcal: 1120 } }],
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(peekMealSaved(REL)).toMatchObject({ mealName: "Lunch", kcal: 1120, kind: "restaurant" });
  });

  it("Ate out needs the kcal or a note", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    expect(await screen.findByText("Enter the kcal, or a short note about what you had.")).toBeTruthy();
    expect(deviate).not.toHaveBeenCalled();
  });

  it("Changed the portion steps by ½, shows the difference and saves (TR-08b)", async () => {
    const onDone = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Changed the portion" }));
    expect(screen.getByText("Change how much you had. Steps are ½.")).toBeTruthy();
    expectRealHeight();
    fireEvent.click(screen.getByRole("button", { name: "More Vegetable poha" }));
    expect(screen.getByLabelText("Vegetable poha: 1½ bowl")).toBeTruthy();
    expect(screen.getByText("+200 vs plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save portion" }));
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    const body = (deviate.mock.calls[0] as unknown[])[2] as { deviationKind: string; items: unknown[] };
    expect(body.deviationKind).toBe("portion_adjustment");
    expect(body.items).toEqual([
      {
        customFood: { name: "Vegetable poha", kcal: 600, servingLabel: "1½ bowl" },
        saveToMyFoods: false,
      },
    ]);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("Ate out keeps a Save with the kcal pinned under the fields (TR-08c3)", async () => {
    const onDone = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    fireEvent.change(screen.getByLabelText("Kcal"), { target: { value: "38" } });
    // Save top right and the pinned button, both reachable with the keyboard up.
    expect(screen.getAllByRole("button", { name: "Save" }).length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Save · 38 kcal" }));
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("offline: the neutral banner shows and the portion still saves (queued, TR-08b3)", async () => {
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      const onDone = renderSheet();
      fireEvent.click(screen.getByRole("button", { name: "Changed the portion" }));
      const banner = await screen.findByTestId("offline-banner");
      expect(banner.textContent).toContain("You\u2019re offline. Your change saves on your phone and sends when you\u2019re back.");
      // Neutral: no alert role (D-W14-9).
      expect(banner.getAttribute("role")).not.toBe("alert");
      fireEvent.click(screen.getByRole("button", { name: "Save portion" }));
      await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onDone).toHaveBeenCalled());
    } finally {
      online.mockRestore();
    }
  });

  it("offline: Ate out shows the same banner and saves", async () => {
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      const onDone = renderSheet();
      fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
      expect(await screen.findByTestId("offline-banner")).toBeTruthy();
      fireEvent.change(screen.getByLabelText("Kcal"), { target: { value: "300" } });
      fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
      await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onDone).toHaveBeenCalled());
    } finally {
      online.mockRestore();
    }
  });

  it("goes back to the menu from the portion screen", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Changed the portion" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Ate out" })).toBeTruthy();
  });
});

describe("Ate out screen (TR-08c2)", () => {
  beforeEach(() => {
    deviate.mockClear();
    resetMealSavedNotice();
    resetMealPhotoJobsForTests();
    resetDeviceStorageForTests();
    window.localStorage.clear();
    photo.pick.mockReset();
    photo.prepare.mockReset();
    photo.send.mockReset();
    photo.pick.mockResolvedValue({ uri: "file:///cache/menu.jpg", width: 3000, height: 4000 });
    photo.prepare.mockResolvedValue({ uri: "file:///cache/menu-small.jpg", bytes: new Uint8Array([7, 8, 9]) });
    auth.current = mockAuth({
      api: {},
      me: { userId: USER, timezone: "Asia/Kolkata" },
    });
  });

  it("asks what you had, with the trainee's label, and offers an optional photo", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    expect(screen.getByText("What did you have? (optional)")).toBeTruthy();
    expect(screen.queryByText(/Note for/)).toBeNull();
    expect(screen.getByText("Add a photo")).toBeTruthy();
    expect(screen.getByText("Optional · the menu or your plate")).toBeTruthy();
  });

  it("a photo picked here becomes a durable photo job once the meal is saved", async () => {
    const onDone = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a photo" }));
    // The same choice as Diet's Add photo, without the coach's prompt.
    expect(screen.queryByText(/asks for a photo/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose from gallery" }));
    expect(await screen.findByTestId("ate-out-photo-added")).toBeTruthy();
    expect(photo.prepare).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Kcal"), { target: { value: "380" } });
    fireEvent.click(screen.getByRole("button", { name: "Save · 380 kcal" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(deviate).toHaveBeenCalledTimes(1);
    const job = currentMealPhotoJobs()?.snapshot()[assignment.id];
    expect(job).toMatchObject({ relationshipId: REL, localDate: DATE });
    // The log was only queued: the photo waits for its server entry id.
    expect(job?.state === "waiting" || job?.state === "uploading").toBe(true);
    expect(photo.send).not.toHaveBeenCalled();
    const stored = Object.keys(window.localStorage).filter((key) => key.includes("mealPhotoJobs"));
    expect(stored.some((key) => key.includes(".job."))).toBe(true);
    expect(stored.some((key) => key.includes(".jpeg."))).toBe(true);
  });

  it("Remove drops the picked photo before saving", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Ate out" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove photo" }));
    expect(screen.getByRole("button", { name: "Add a photo" })).toBeTruthy();
  });
});

describe("SomethingDifferentSheet Change this log mode (Z14-13b, TR-07n4)", () => {
  const logged: MealAssignment = {
    ...assignment,
    status: "modified",
    compliance: {
      id: "e5555555-5555-4555-8555-555555555555",
      assignmentId: assignment.id,
      coachingRelationshipId: REL,
      planVersionId: assignment.planVersionId,
      traineeUserId: USER,
      outcome: "modified",
      recordVersion: 2,
      loggedAt: new Date().toISOString(),
      deviationKind: "portion_adjustment",
      notes: null,
      photoRequired: false,
      photoIntent: null,
      mediaAssetId: null,
      loggedItems: [{ name: "Vegetable poha", quantity: 2, servingLabel: "1 bowl", energyKcal: 800 }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  beforeEach(() => {
    editEntry.mockClear();
    deviate.mockClear();
    auth.current = mockAuth();
  });

  it("opens the portion screen prefilled with the logged amounts and saves as an edit", async () => {
    const onEdited = vi.fn();
    const onRemove = vi.fn();
    render(
      <SomethingDifferentSheet
        assignment={logged}
        relationshipId={REL}
        variant="screen"
        onDone={vi.fn()}
        onCancel={vi.fn()}
        edit={{ start: "portion", canRemove: true, onRemove, onEdited }}
      />,
    );
    expect(screen.getByText("Edit portion")).toBeTruthy();
    expect(screen.getByLabelText(/Vegetable poha: 2 bowl/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove this log" }));
    expect(onRemove).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[1]!);
    await waitFor(() => expect(editEntry).toHaveBeenCalledTimes(1));
    expect(deviate).not.toHaveBeenCalled();
    const input = (editEntry.mock.calls[0] as unknown[])[2] as {
      body: { outcome: string; deviationKind: string };
    };
    expect(input.body).toMatchObject({ outcome: "modified", deviationKind: "portion_adjustment" });
    await waitFor(() => expect(onEdited).toHaveBeenCalled());
  });
});
