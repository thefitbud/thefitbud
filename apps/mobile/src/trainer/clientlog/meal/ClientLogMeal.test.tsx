/** Trainer log and edit of a client's meal (Z10-19): copy, rules and request bodies. */
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { mealAssignmentSchema } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../../test/render";
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
    prescription: { id: ids(4), order: over.order ?? 1, name: over.name ?? "Breakfast", scheduleHint: null, instructions: null, photoRequired: false },
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

const { ClientLogMealScreen } = await import("./ClientLogMealScreen");

function renderForm(over: { ended?: boolean; onSaved?: (m: string) => void } = {}) {
  render(
    <ClientLogMealScreen
      relationshipId={RID}
      displayName="Rohan Mehta"
      ended={over.ended ?? false}
      clientZone="Asia/Kolkata"
      onBack={() => {}}
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
    expect(isComplete({ ...d, deviationKind: "substitute" })).toBe(true);
    expect(setOutcome({ ...d, deviationKind: "substitute" }, "skipped").deviationKind).toBeNull();
  });

  it("offers only scheduled, current meals of the day", () => {
    const items = [meal({ id: ids(11), order: 2, name: "Lunch" }), meal({ id: ids(12), date: "2026-11-03" }), meal({ id: ids(13), order: 1 })];
    expect(mealsOn(items, "2026-11-04").map((m) => m.id)).toEqual([ids(13), ids(11)]);
  });
});

describe("ClientLogMealScreen", () => {
  it("logs a changed meal with its kind and note, sends no recordVersion, says Logged by you", async () => {
    api.listMealAssignments.mockResolvedValue({ items: [meal()], nextCursor: null });
    api.request.mockResolvedValue(compliance());
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await screen.findByText(/Planned for Wed 4 Nov/);
    fireEvent.click(screen.getByRole("button", { name: "Modified" }));
    fireEvent.click(screen.getByRole("button", { name: "Substitute" }));
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Had poha instead" } });
    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Logged by you"));
    const [method, path, , opts] = api.request.mock.calls[0]!;
    expect(method).toBe("PUT");
    expect(path).toBe(`/meals/compliance/${ids(10)}/2026-11-04`);
    expect(opts.body).toEqual({ outcome: "modified", deviationKind: "substitute", notes: "Had poha instead" });
    expect(opts.idempotencyKey).toBeTruthy();
  });

  it("edits a client's entry with its recordVersion and says Edited by you", async () => {
    api.request.mockReset();
    api.listMealAssignments.mockResolvedValue({ items: [meal({ compliance: compliance() })], nextCursor: null });
    api.request.mockResolvedValue(compliance({ outcome: "skipped", recordVersion: 3, lastEditedByRole: "coach" }));
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await screen.findByText(/Planned for Wed 4 Nov · Confirmed/);
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Skipped" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
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
    expect(screen.queryByRole("button", { name: "Substitute" })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
    await screen.findByText(/Not saved\. Something went wrong on our side\./);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText(/Not saved\. A trainer log must be dated/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Skipped" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
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
