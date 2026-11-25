/** Trainer log and edit of a client's meal (Z10-19, Z12-52): editors and coach payloads. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackHandler, Platform } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import { mealAssignmentSchema } from "@fitbud/contracts";
import { act, fireEvent, mockAuth, render, screen, waitFor } from "../../../test/render";
import { buildMealBody, mealsOn, startDraft, setOutcome, isComplete } from "./model";

const ids = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RID = ids(1);

function compliance(over: Record<string, unknown> = {}) {
  return {
    id: ids(50),
    assignmentId: ids(10),
    coachingRelationshipId: RID,
    planVersionId: ids(3),
    traineeUserId: ids(5),
    outcome: "confirmed",
    recordVersion: 2,
    loggedAt: "2026-11-04T05:00:00.000Z",
    deviationKind: null,
    notes: null,
    photoRequired: false,
    photoIntent: null,
    mediaAssetId: null,
    loggedByRole: "trainee",
    lastEditedByRole: null,
    createdAt: "2026-11-04T05:00:00.000Z",
    updatedAt: "2026-11-04T05:00:00.000Z",
    ...over,
  };
}

function meal(over: { id?: string; name?: string; order?: number; compliance?: unknown; date?: string } = {}) {
  return mealAssignmentSchema.parse({
    id: over.id ?? ids(10),
    coachingRelationshipId: RID,
    planId: ids(2),
    planVersionId: ids(3),
    mealPrescriptionId: ids(4),
    mealName: over.name ?? "Breakfast",
    localDate: over.date ?? "2026-11-04",
    windowStartsAt: "2026-11-04T01:00:00.000Z",
    windowEndsAt: "2026-11-04T05:00:00.000Z",
    photoRequired: false,
    status: over.compliance ? "confirmed" : "pending",
    prescription: {
      id: ids(4),
      order: over.order ?? 1,
      name: over.name ?? "Breakfast",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [
        {
          name: "Vegetable poha",
          portionLabel: "1 bowl",
          calories: 400,
          proteinGrams: 20,
          carbsGrams: 60,
          fatGrams: 10,
        },
      ],
    },
    compliance: over.compliance ?? null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  });
}

const api = { listMealAssignments: vi.fn(), request: vi.fn() };
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../../components/Screen", () => ({
  Screen: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
vi.mock("../../../lib/dates", async (orig) => ({
  ...(await orig<typeof import("../../../lib/dates")>()),
  localDateInTimezone: () => "2026-11-04",
}));
vi.mock("../../../sync/SyncProvider", () => ({ useSyncEngine: () => ({}) }));
vi.mock("../../../lib/meFoodsApi", () => ({
  fetchMeFoodRecent: vi.fn(async () => ({ items: [], nextCursor: null })),
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const { ClientLogMealScreen } = await import("./ClientLogMealScreen");

function renderForm(over: { ended?: boolean; onSaved?: (m: string) => void; onBack?: () => void } = {}) {
  render(
    <ClientLogMealScreen
      relationshipId={RID}
      displayName="Rohan Mehta"
      ended={over.ended ?? false}
      clientZone="Asia/Kolkata"
      onBack={over.onBack ?? (() => {})}
      onSaved={over.onSaved ?? (() => {})}
    />,
  );
}

describe("meal model", () => {
  it("leaves recordVersion out of a first log and sends it for an existing entry", () => {
    const d = setOutcome(startDraft(null), "skipped");
    expect(buildMealBody(d, null)).toEqual({ outcome: "skipped", notes: null });
    const existing = meal({ compliance: compliance() }).compliance!;
    expect(buildMealBody(startDraft(existing), existing)).toMatchObject({ outcome: "confirmed", recordVersion: 2 });
  });

  it("needs a change kind for a changed meal and drops it when the outcome moves away", () => {
    const d = setOutcome(startDraft(null), "modified");
    expect(isComplete(d)).toBe(false);
    expect(isComplete({ ...d, deviationKind: "portion_adjustment" })).toBe(true);
    expect(setOutcome({ ...d, deviationKind: "portion_adjustment" }, "skipped").deviationKind).toBeNull();
  });

  it("offers only scheduled, current meals of the day", () => {
    const items = [meal({ id: ids(11), order: 2, name: "Lunch" }), meal({ id: ids(12), date: "2026-11-03" }), meal({ id: ids(13), order: 1 })];
    expect(mealsOn(items, "2026-11-04").map((m) => m.id)).toEqual([ids(13), ids(11)]);
  });
});

describe("ClientLogMealScreen", () => {
  it("Modified opens TR-08a; portion editor posts coach-authored portion_adjustment", async () => {
    api.listMealAssignments.mockResolvedValue({ items: [meal()], nextCursor: null });
    api.request.mockResolvedValue(compliance({ loggedByRole: "coach", deviationKind: "portion_adjustment", outcome: "modified" }));
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await screen.findByText(/Planned for Wed 4 Nov/);
    fireEvent.click(await screen.findByRole("button", { name: "Modified" }));
    expect(await screen.findByText("Changed the portion")).toBeTruthy();
    expect(screen.getByText("Log it myself")).toBeTruthy();
    expect(screen.getByText("Ate out")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Changed the portion" }));
    expect(screen.getByText("Change how much you had. Steps are ½.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save portion" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Logged by you"));
    const [method, path, , opts] = api.request.mock.calls[0]!;
    expect(method).toBe("PUT");
    expect(path).toBe(`/meals/compliance/${ids(10)}/2026-11-04`);
    expect(opts.body).toMatchObject({
      outcome: "modified",
      deviationKind: "portion_adjustment",
      notes: null,
    });
    expect(opts.body.items).toEqual([
      {
        customFood: { name: "Vegetable poha", kcal: 400, servingLabel: "1 bowl" },
        saveToMyFoods: false,
      },
    ]);
    expect(opts.idempotencyKey).toBeTruthy();
  });

  it("Ate out editor posts coach-authored restaurant with kcal", async () => {
    api.request.mockReset();
    api.listMealAssignments.mockResolvedValue({ items: [meal()], nextCursor: null });
    api.request.mockResolvedValue(compliance({ loggedByRole: "coach", deviationKind: "restaurant", outcome: "modified" }));
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await screen.findByText(/Planned for/);
    fireEvent.click(await screen.findByRole("button", { name: "Modified" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ate out" }));
    fireEvent.change(screen.getByLabelText("Kcal"), { target: { value: "1120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Logged by you"));
    expect(api.request.mock.calls[0]![3].body).toEqual({
      outcome: "modified",
      deviationKind: "restaurant",
      notes: null,
      items: [{ customFood: { name: "Ate out", kcal: 1120 } }],
    });
  });

  it("Log it myself opens TR-26a and posts coach-authored logged_foods", async () => {
    api.request.mockReset();
    api.listMealAssignments.mockResolvedValue({ items: [meal()], nextCursor: null });
    api.request.mockResolvedValue(
      compliance({ loggedByRole: "coach", deviationKind: "logged_foods", outcome: "modified" }),
    );
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await screen.findByText(/Planned for/);
    fireEvent.click(await screen.findByRole("button", { name: "Modified" }));
    fireEvent.click(await screen.findByRole("button", { name: "Log it myself" }));
    expect(await screen.findByTestId("food-search-screen")).toBeTruthy();
    expect(screen.getByText("Tap a food to set katori, piece, cup or grams.")).toBeTruthy();
    // Plan food + adds at once (TR-26b); Save posts logged_foods as the coach.
    fireEvent.click(screen.getByTestId("food-add-plan:0"));
    fireEvent.click(screen.getByTestId("food-log-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Logged by you"));
    expect(api.request.mock.calls[0]![3].body).toMatchObject({
      outcome: "modified",
      deviationKind: "logged_foods",
      notes: null,
    });
    expect(api.request.mock.calls[0]![3].body.items).toEqual([
      {
        customFood: { name: "Vegetable poha", kcal: 400, servingLabel: "1 bowl" },
        saveToMyFoods: false,
      },
    ]);
  });

  it("edits a client's entry with its recordVersion and says Edited by you", async () => {
    api.request.mockReset();
    api.listMealAssignments.mockResolvedValue({ items: [meal({ compliance: compliance() })], nextCursor: null });
    api.request.mockResolvedValue(compliance({ outcome: "skipped", recordVersion: 3, lastEditedByRole: "coach" }));
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await screen.findByText(/Planned for Wed 4 Nov · Confirmed/);
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: "Skipped" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Edited by you"));
    expect(api.request.mock.calls[0]![3].body).toEqual({ outcome: "skipped", notes: null, recordVersion: 2 });
  });

  it("shows the coach label on an entry the coach logged", async () => {
    api.listMealAssignments.mockResolvedValue({ items: [meal({ compliance: compliance({ loggedByRole: "coach" }) })], nextCursor: null });
    renderForm();
    await screen.findByText(/Confirmed · Logged by you/);
  });

  it("keeps a client's food list: only the note is editable", async () => {
    api.listMealAssignments.mockResolvedValue({
      items: [meal({ compliance: compliance({ outcome: "modified", deviationKind: "logged_foods" }) })],
      nextCursor: null,
    });
    renderForm();
    await screen.findByText(/logged the foods for this meal/);
    expect((screen.getByRole("button", { name: "Skipped" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Something different" })).toBeNull();
    expect(screen.queryByText("Changed the portion")).toBeNull();
  });

  it("coach Something different reuses the entry key after a 5xx", async () => {
    api.request.mockReset();
    api.listMealAssignments.mockResolvedValue({ items: [meal()], nextCursor: null });
    api.request
      .mockRejectedValueOnce(
        new ApiClientError({
          code: "INTERNAL",
          message: "Something went wrong on our side.",
          requestId: "r",
          status: 500,
        }),
      )
      .mockResolvedValue(
        compliance({ loggedByRole: "coach", deviationKind: "portion_adjustment", outcome: "modified" }),
      );
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await screen.findByText(/Planned for Wed 4 Nov/);
    fireEvent.click(await screen.findByRole("button", { name: "Modified" }));
    fireEvent.click(await screen.findByRole("button", { name: "Changed the portion" }));
    fireEvent.click(screen.getByRole("button", { name: "Save portion" }));
    await screen.findByText(/Something went wrong on our side/);
    // Flake trace (CI run 45535882284): the retry press must land after the
    // failed save has finished (the button leaves its busy state), or the
    // press is dropped and onSaved never fires. Wait for that, then retry.
    // Waits end as soon as the state is true; the bound only caps a real failure.
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Save portion" }).getAttribute("aria-busy"),
        ).not.toBe("true"),
      { timeout: 4000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save portion" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Logged by you"), { timeout: 4000 });
    const keys = api.request.mock.calls.map((c) => c[3].idempotencyKey);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(new Set(keys).size).toBe(1);
  });

  it("reuses the key after a 5xx and replaces it after a 4xx", async () => {
    api.request.mockReset();
    api.listMealAssignments.mockResolvedValue({ items: [meal()], nextCursor: null });
    api.request
      .mockRejectedValueOnce(new ApiClientError({ code: "INTERNAL", message: "Something went wrong on our side.", requestId: "r", status: 500 }))
      .mockRejectedValueOnce(new ApiClientError({ code: "BACKDATE_LIMIT", message: "A trainer log must be dated within the last 7 days.", requestId: "r", status: 422 }))
      .mockResolvedValueOnce(compliance());
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await screen.findByText(/Planned for/);
    fireEvent.click(await screen.findByRole("button", { name: "Confirmed" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save meal" }));
    await screen.findByText(/Not saved\. Something went wrong on our side\./);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText(/Not saved\. A trainer log must be dated/);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const keys = api.request.mock.calls.map((c) => c[3].idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("asks to reload on a version conflict and does not retry the stale body", async () => {
    api.request.mockReset();
    api.listMealAssignments.mockResolvedValue({ items: [meal({ compliance: compliance() })], nextCursor: null });
    api.request.mockRejectedValueOnce(
      new ApiClientError({ code: "VERSION_CONFLICT", message: "This meal changed since it was opened. Reload and try again.", requestId: "r", status: 409 }),
    );
    renderForm();
    await screen.findByText(/Planned for/);
    fireEvent.click(await screen.findByRole("button", { name: "Skipped" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await screen.findByText(/This meal changed since it was opened/);
    expect(screen.getByRole("button", { name: "Reload entry" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is read-only for an ended client", async () => {
    renderForm({ ended: true });
    await screen.findByText(/Coaching with Rohan has ended/);
    expect(screen.queryByRole("button", { name: "Save meal" })).toBeNull();
  });
});

describe("meal log back (Z14-18)", () => {
  let listener: (() => boolean) | null = null;
  const realOS = Platform.OS;
  const onBack = vi.fn();
  beforeEach(() => {
    listener = null;
    onBack.mockClear();
    api.request.mockReset();
    (Platform as { OS: string }).OS = "android";
    vi.spyOn(BackHandler, "addEventListener").mockImplementation(((
      _event: string,
      handler: () => boolean,
    ) => {
      listener = handler;
      return { remove: () => undefined };
    }) as never);
    api.listMealAssignments.mockResolvedValue({ items: [meal()], nextCursor: null });
  });
  afterEach(() => {
    (Platform as { OS: string }).OS = realOS;
    vi.restoreAllMocks();
  });
  const press = (): boolean => {
    let consumed = false;
    act(() => {
      consumed = listener?.() ?? false;
    });
    return consumed;
  };
  async function openFoodSearch() {
    renderForm({ onBack });
    await screen.findByText(/Planned for Wed 4 Nov/);
    fireEvent.click(await screen.findByRole("button", { name: "Modified" }));
    await screen.findByRole("button", { name: "Log it myself" });
    fireEvent.click(screen.getByRole("button", { name: "Log it myself" }));
    await screen.findByTestId("food-search-screen");
  }

  it("hardware back steps food search to the menu to the main view, never leaving the log", async () => {
    await openFoodSearch();
    expect(press()).toBe(true);
    await screen.findByRole("button", { name: "Log it myself" });
    expect(screen.queryByTestId("food-search-screen")).toBeNull();
    expect(press()).toBe(true);
    await screen.findByRole("button", { name: "Modified" });
    expect(screen.queryByRole("button", { name: "Log it myself" })).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("on-screen Back steps the same way", async () => {
    await openFoodSearch();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByRole("button", { name: "Log it myself" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByRole("button", { name: "Modified" });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("back from the main view of a dirty draft asks Discard this log?; a clean one leaves", async () => {
    renderForm({ onBack });
    await screen.findByText(/Planned for Wed 4 Nov/);
    expect(press()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    onBack.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmed" }));
    expect(press()).toBe(true);
    expect(await screen.findByText("Discard this log?")).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("stepping out of an inner view of a dirty draft does not ask or leave", async () => {
    await openFoodSearch();
    press();
    press();
    await screen.findByRole("button", { name: "Modified" });
    expect(screen.queryByText("Discard this log?")).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });
});
