/** Trainer log and edit of a client's measurement (Z10-19). */
import { describe, expect, it, vi } from "vitest";
import { measurementSchema } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../../test/render";
import { buildCreateBody, buildEditBody, draftFor, measurementsOn, parseValue } from "./model";

const ids = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RID = ids(1);

function measurement(over: Record<string, unknown> = {}) {
  return measurementSchema.parse({
    id: ids(60),
    coachingRelationshipId: RID,
    traineeUserId: ids(5),
    type: "body_weight_kg",
    value: 72.4,
    unit: "kg",
    observedAt: "2026-11-04T03:00:00.000Z",
    source: "trainee_entry",
    checkinId: null,
    mediaAssetId: null,
    recordVersion: 1,
    loggedByRole: "trainee",
    lastEditedByRole: null,
    createdAt: "2026-11-04T03:00:00.000Z",
    updatedAt: "2026-11-04T03:00:00.000Z",
    ...over,
  });
}

const api = { listMeasurements: vi.fn(), createMeasurement: vi.fn(), request: vi.fn() };
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
  localDateInTimezone: (_z: string, d?: Date) => (d ? d.toISOString().slice(0, 10) : "2026-11-04"),
}));

const { ClientLogMeasurementScreen } = await import("./ClientLogMeasurementScreen");

function renderForm(over: { ended?: boolean; onSaved?: (m: string) => void } = {}) {
  render(
    <ClientLogMeasurementScreen
      relationshipId={RID}
      displayName="Rohan Mehta"
      ended={over.ended ?? false}
      clientZone="Asia/Kolkata"
      onBack={() => {}}
      onSaved={over.onSaved ?? (() => {})}
    />,
  );
}

describe("measurement model", () => {
  it("parses decimals with a comma and refuses what the API would", () => {
    expect(parseValue("72,4")).toBe(72.4);
    expect(parseValue("0")).toBeNull();
    expect(parseValue("abc")).toBeNull();
    expect(parseValue("1001")).toBeNull();
  });

  it("uses the fixed unit for weight and girths, and the typed one for other", () => {
    expect(buildCreateBody({ type: "waist_cm", value: "80", unit: "" }, "2026-11-04T05:00:00.000Z").unit).toBe("cm");
    expect(buildCreateBody({ type: "other", value: "5", unit: "mm" }, "2026-11-04T05:00:00.000Z").unit).toBe("mm");
  });

  it("sends only the change, with the version read; null when unchanged", () => {
    const m = measurement();
    expect(buildEditBody(draftFor(m), m)).toBeNull();
    expect(buildEditBody({ ...draftFor(m), value: "71.9" }, m)).toEqual({ recordVersion: 1, value: 71.9 });
  });

  it("leaves out check-in measurements, which a trainer cannot edit", () => {
    const items = [measurement(), measurement({ id: ids(61), source: "checkin", checkinId: ids(7) })];
    expect(measurementsOn(items, "2026-11-04", "Asia/Kolkata")).toHaveLength(1);
  });
});

describe("ClientLogMeasurementScreen", () => {
  it("logs a weight for the picked day and says Logged by you", async () => {
    api.listMeasurements.mockResolvedValue({ items: [], nextCursor: null });
    api.createMeasurement.mockResolvedValue(measurement());
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await screen.findByText("Date · up to 7 days back");
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "72,4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Logged by you"));
    const [rid, body, key] = api.createMeasurement.mock.calls[0]!;
    expect(rid).toBe(RID);
    expect(body).toMatchObject({ type: "body_weight_kg", value: 72.4, unit: "kg" });
    expect(key).toBeTruthy();
  });

  it("edits a client's entry through PATCH with its recordVersion and says Edited by you", async () => {
    api.listMeasurements.mockResolvedValue({ items: [measurement()], nextCursor: null });
    api.request.mockResolvedValue(measurement({ value: 71.9, recordVersion: 2, lastEditedByRole: "coach" }));
    const onSaved = vi.fn();
    renderForm({ onSaved });
    fireEvent.click(await screen.findByRole("button", { name: "Body weight 72.4 kg" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "71.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Edited by you"));
    const [method, path, , opts] = api.request.mock.calls[0]!;
    expect(method).toBe("PATCH");
    expect(path).toBe(`/progress/measurements/${ids(60)}`);
    expect(opts.body).toEqual({ recordVersion: 1, value: 71.9 });
  });

  it("is read-only for an ended client", async () => {
    renderForm({ ended: true });
    await screen.findByText(/Coaching with Rohan has ended/);
    expect(screen.queryByRole("button", { name: "Save measurement" })).toBeNull();
  });
});
