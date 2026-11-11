/**
 * Check-in measurements (Z9-8, frames 14 and 14c): only the measurements the
 * trainer picked, each with its last stored value and a number input, and the
 * four 1-5 ratings. DOM-shaped harness (react-native-web + happy-dom): proves
 * copy, labels and values, not layout; the visual check is the authority there.
 */
import { describe, expect, it, vi } from "vitest";
import {
  checkinFormVersionSchema,
  checkinSchema,
  coachingRelationshipSchema,
} from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";
import {
  cleanMeasureInput,
  lastValuesByType,
  measureProblem,
} from "./checkin/MeasureRow";
import { enqueueAndPush } from "../sync/actions";

const RELATIONSHIP_ID = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const relationship = coachingRelationshipSchema.parse({
  id: RELATIONSHIP_ID,
  trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
  traineeUserId: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-09-01T06:30:00.000Z",
  endedAt: null,
  createdAt: "2026-09-01T06:30:00.000Z",
  updatedAt: "2026-11-01T06:30:00.000Z",
  trainerDisplayName: "Rahul Verma",
});

const FORM_ID = "6d0f2a64-3c1b-4f6e-9a10-7b6f4e0c1d11";
const form = checkinFormVersionSchema.parse({
  id: FORM_ID,
  templateId: "2a9d5f10-7c3e-4b18-8d44-0e5b1c7a9f22",
  key: "rahul-weekly",
  version: 2,
  scope: "trainer",
  createdAt: "2026-10-20T06:30:00.000Z",
  fields: [
    { id: "weight", key: "weight", type: "measurement", measurementType: "body_weight_kg", label: "Weight", required: false },
    { id: "waist", key: "waist", type: "measurement", measurementType: "waist_cm", label: "Waist", required: false, helpText: "At the navel" },
    { id: "hips", key: "hips", type: "measurement", measurementType: "hip_cm", label: "Hip", required: false },
    { id: "arm", key: "arm", type: "measurement", measurementType: "other", unit: "cm", label: "Arm", required: false },
    { id: "energy", key: "energy", type: "scale_1_5", label: "Energy", required: false },
    { id: "sleep", key: "sleep_quality", type: "scale_1_5", label: "Sleep quality", required: false },
    { id: "stress", key: "stress", type: "scale_1_5", label: "Stress", required: false },
    { id: "hunger", key: "hunger", type: "scale_1_5", label: "Hunger", required: false },
  ],
});

const checkin = checkinSchema.parse({
  id: "9c1e7b30-5d2a-4a8f-b6c4-3e0f8d7a2b55",
  coachingRelationshipId: RELATIONSHIP_ID,
  checkinScheduleId: null,
  localDate: "2026-10-23",
  windowStartsAt: "2026-10-23T00:00:00.000Z",
  windowEndsAt: "2026-10-23T18:29:00.000Z",
  recordStatus: "draft",
  recordVersion: 0,
  definitionVersion: 1,
  checkinFormVersionId: FORM_ID,
  answers: null,
  submittedAt: null,
  status: "due",
  review: null,
  createdAt: "2026-10-16T06:30:00.000Z",
  updatedAt: "2026-10-16T06:30:00.000Z",
});

const api = {
  getCheckin: vi.fn(async () => checkin),
  getProgressMetrics: vi.fn(async () => ({
    series: [
      {
        key: "arm",
        unit: "cm",
        points: [
          { localDate: "2026-10-02", value: 33.5, checkinId: null },
          { localDate: "2026-10-09", value: 34, checkinId: null },
        ],
      },
    ],
  })),
  getCheckinForm: vi.fn(async () => form),
  getProgressSummary: vi.fn(async () => ({
    measurements: [
      { type: "waist_cm", value: 96, unit: "cm", observedAt: "2026-10-02T06:30:00.000Z" },
      { type: "waist_cm", value: 94, unit: "cm", observedAt: "2026-10-09T06:30:00.000Z" },
      { type: "hip_cm", value: 102, unit: "cm", observedAt: "2026-10-09T06:30:00.000Z" },
      { type: "other", value: 34, unit: "cm", observedAt: "2026-10-09T06:30:00.000Z" },
    ],
  })),
};
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../sync/SyncProvider", () => ({
  useSyncEngine: () => ({ pushNow: vi.fn(), enqueue: vi.fn() }),
}));
vi.mock("../sync/actions", () => ({ enqueueAndPush: vi.fn(async () => ({})) }));

const { CheckinScreen } = await import("./CheckinScreen");

describe("measurement helpers", () => {
  it("keeps digits and one decimal point", () => {
    expect(cleanMeasureInput("93,5cm")).toBe("93.5");
    expect(cleanMeasureInput("1.2.3")).toBe("1.23");
  });

  it("uses the core range by key and the field's unit (Z6-6)", () => {
    const waist = form.fields[1];
    if (waist?.type !== "measurement") throw new Error("fixture");
    expect(measureProblem(waist, "")).toBeNull();
    expect(measureProblem(waist, "93.5")).toBeNull();
    expect(measureProblem(waist, "9")).toBe("Enter a valid value in cm");
    expect(measureProblem(waist, "251")).toBe("Enter a valid value in cm");
  });

  it("uses the newest value per body part and none for other", () => {
    const last = lastValuesByType([
      { type: "waist_cm", value: 96, observedAt: "2026-10-02T06:30:00.000Z" },
      { type: "waist_cm", value: 94, observedAt: "2026-10-09T06:30:00.000Z" },
      { type: "other", value: 34, observedAt: "2026-10-09T06:30:00.000Z" },
    ]);
    expect(last.waist_cm?.value).toBe(94);
    expect(last.other).toBeUndefined();
  });
});

describe("CheckinScreen measurements", () => {
  it("shows only the picked measurements, last value, and four ratings", async () => {
    render(<CheckinScreen relationship={relationship} checkin={checkin} onDone={() => {}} />);
    await screen.findByLabelText("Waist, cm");
    expect(screen.getByLabelText("Hip, cm")).toBeTruthy();
    expect(screen.getByLabelText("Arm, cm")).toBeTruthy();
    expect(screen.queryByLabelText("Chest, cm")).toBeNull();
    expect(screen.getByText(/Rahul asks for these 3\. Measure in the morning, before breakfast\./)).toBeTruthy();
    expect(screen.getByText("Last: 94 cm • Fri 9 Oct")).toBeTruthy();
    expect(screen.getByText("Last: 102 cm • Fri 9 Oct")).toBeTruthy();
    // Arm is a keyed `other` field: its last value comes from the arm series.
    expect(screen.getByText("Last: 34 cm • Fri 9 Oct")).toBeTruthy();
    expect(screen.getByText("Body measurements")).toBeTruthy();
    expect(screen.getByText("Body and photos")).toBeTruthy();
  });

  it("types a value on the keypad and flags an out-of-range one", async () => {
    render(<CheckinScreen relationship={relationship} checkin={checkin} onDone={() => {}} />);
    const waist = (await screen.findByLabelText("Waist, cm")) as HTMLInputElement;
    expect(waist.getAttribute("inputmode")).toBe("decimal");
    fireEvent.change(waist, { target: { value: "93.5" } });
    await waitFor(() => expect(waist.value).toBe("93.5"));
    expect(screen.queryByText("Enter a valid value in cm")).toBeNull();
    fireEvent.change(waist, { target: { value: "9" } });
    await screen.findByText("Enter a valid value in cm");
  });

  it("blocks Continue on step 1 while a measurement is invalid", async () => {
    render(<CheckinScreen relationship={relationship} checkin={checkin} onDone={() => {}} />);
    const waist = await screen.findByLabelText("Waist, cm");
    const next = () => screen.getByRole("button", { name: "Continue" });
    expect(next().getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.change(waist, { target: { value: "9" } });
    await waitFor(() => expect(next().getAttribute("aria-disabled")).toBe("true"));
    fireEvent.change(waist, { target: { value: "93.5" } });
    await waitFor(() => expect(next().getAttribute("aria-disabled")).not.toBe("true"));
  });

  it("shows four 1-5 ratings and submits only the answered keys", async () => {
    render(<CheckinScreen relationship={relationship} checkin={checkin} onDone={() => {}} />);
    const waist = await screen.findByLabelText("Waist, cm");
    fireEvent.change(waist, { target: { value: "93.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    for (const name of ["Energy", "Sleep quality", "Stress", "Hunger"]) {
      for (const n of [1, 2, 3, 4, 5]) {
        expect(await screen.findByRole("button", { name: `${name} ${n}` })).toBeTruthy();
      }
    }
    fireEvent.click(screen.getByRole("button", { name: "Energy 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to Rahul" }));
    await waitFor(() =>
      expect(
        vi.mocked(enqueueAndPush).mock.calls.some(
          ([, op]) => (op as { operation: string }).operation === "checkin.submit",
        ),
      ).toBe(true),
    );
    const submit = vi
      .mocked(enqueueAndPush)
      .mock.calls.map(([, op]) => op as unknown as { operation: string; payload: { body: { answers: unknown } } })
      .find((op) => op.operation === "checkin.submit");
    expect(submit?.payload.body.answers).toEqual({ fieldAnswers: { waist: 93.5, energy: 4 } });
  });
});
