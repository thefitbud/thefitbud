/**
 * Check-in review (Z10-10, frames 19 and 75): three rating tiles, the picked
 * measurements with their "since" line, photos, and a saved review that is
 * read-only. DOM-shaped harness: proves copy and states, not layout; the
 * visual check is the authority there.
 */
import { describe, expect, it, vi } from "vitest";
import {
  checkinFormVersionSchema,
  checkinReviewContextSchema,
  type CheckinReviewContext,
} from "@fitbud/contracts";
import { deviceTimeZone } from "@fitbud/core";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";
import {
  noteForCheckin,
  reviewedAtLabel,
  reviewedSummaryLine,
  signedDelta,
} from "./savedReview";

const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const CHECKIN = "9c1e7b30-5d2a-4a8f-b6c4-3e0f8d7a2b55";
const FORM_ID = "6d0f2a64-3c1b-4f6e-9a10-7b6f4e0c1d11";
const TRAINER = "a00ed048-8bac-4010-b641-dd888c8a8730";

const form = checkinFormVersionSchema.parse({
  id: FORM_ID,
  templateId: "2a9d5f10-7c3e-4b18-8d44-0e5b1c7a9f22",
  key: "rahul-weekly",
  version: 2,
  scope: "trainer",
  createdAt: "2026-10-01T06:30:00.000Z",
  fields: [
    { id: "weight", key: "weight", type: "measurement", measurementType: "body_weight_kg", label: "Weight", required: false },
    { id: "waist", key: "waist", type: "measurement", measurementType: "waist_cm", label: "Waist", required: false },
    { id: "energy", key: "energy", type: "scale_1_5", label: "Energy", required: false },
    { id: "hunger", key: "hunger", type: "scale_1_5", label: "Hunger", required: false },
    { id: "stress", key: "stress", type: "scale_1_5", label: "Stress", required: false },
    { id: "well", key: "notes", type: "long_text", label: "What went well?", required: false },
  ],
});

function context(reviewed: boolean): CheckinReviewContext {
  return checkinReviewContextSchema.parse({
    checkin: {
      id: CHECKIN,
      coachingRelationshipId: REL,
      checkinScheduleId: null,
      localDate: "2026-10-16",
      windowStartsAt: "2026-10-16T00:00:00.000Z",
      windowEndsAt: "2026-10-16T18:29:00.000Z",
      recordStatus: "submitted",
      recordVersion: 1,
      definitionVersion: 1,
      checkinFormVersionId: FORM_ID,
      answers: {
        fieldAnswers: {
          weight: 86.4,
          waist: 94,
          energy: 3,
          hunger: 4,
          stress: 4,
          well: "Hit my protein most days.",
        },
      },
      submittedAt: "2026-10-16T16:00:00.000Z",
      status: reviewed ? "reviewed" : "submitted",
      review: reviewed
        ? {
            id: "0f5d3c2a-6b1e-4d7f-8a90-1c2b3d4e5f60",
            checkinId: CHECKIN,
            coachingRelationshipId: REL,
            trainerUserId: TRAINER,
            outcome: "needs_follow_up",
            notes: "Weekend leg day works.",
            createdAt: "2026-10-18T04:16:00.000Z",
            updatedAt: "2026-10-18T04:16:00.000Z",
          }
        : null,
      createdAt: "2026-10-16T06:30:00.000Z",
      updatedAt: "2026-10-16T06:30:00.000Z",
    },
    pinnedForm: form,
    recentWorkoutAdherence: { completed: 3, missed: 1, modified: 0, skipped: 0, pending: 0 },
    recentMealCompliance: { confirmed: 10, modified: 1, skipped: 0, overdue: 0, pending: 2 },
    activeExceptions: [],
    photos: [],
    measurements: [
      { type: "body_weight_kg", value: "86.4", unit: "kg", observedAt: "2026-10-16T05:00:00.000Z" },
      { type: "body_weight_kg", value: "86.9", unit: "kg", observedAt: "2026-10-09T05:00:00.000Z" },
    ],
    previousNotes: reviewed
      ? [
          {
            id: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
            coachingRelationshipId: REL,
            trainerUserId: TRAINER,
            checkinId: CHECKIN,
            body: "Weekend leg day works.",
            visibility: "client",
            sharedAt: "2026-10-18T04:16:00.000Z",
            seenAt: null,
            createdAt: "2026-10-18T04:16:00.000Z",
            updatedAt: "2026-10-18T04:16:00.000Z",
          },
        ]
      : [],
    currentPlan: null,
    currentConfiguration: null,
  });
}

const api = {
  getCheckinReviewContext: vi.fn(async () => context(false)),
  getClientWorkspace: vi.fn(async () => ({ header: { traineeDisplayName: "Rohan Mehta" } })),
  recordCheckinReview: vi.fn(async () => ({})),
  createTrainerNote: vi.fn(async () => ({})),
};
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));

const { CheckinReviewScreen } = await import("../CheckinReviewScreen");

describe("saved review helpers", () => {
  it("formats the saved time like the frame", () => {
    expect(reviewedAtLabel("2026-10-18T04:16:00.000Z", "Asia/Kolkata")).toBe("Sun 18 Oct, 9:46 am");
    const review = context(true).checkin.review!;
    expect(reviewedSummaryLine(review, "Asia/Kolkata")).toBe("Needs follow-up · Sun 18 Oct, 9:46 am");
  });
  it("finds the note saved with this check-in only", () => {
    const { previousNotes } = context(true);
    expect(noteForCheckin(previousNotes, CHECKIN)?.visibility).toBe("client");
    expect(noteForCheckin(previousNotes, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
  it("uses a real minus sign", () => {
    expect(signedDelta(-0.5)).toBe("−0.5");
    expect(signedDelta(1)).toBe("+1");
  });
});

describe("CheckinReviewScreen", () => {
  it("shows rating tiles, measurements with a since line and the review sheet", async () => {
    render(<CheckinReviewScreen checkinId={CHECKIN} relationshipId={REL} onBack={vi.fn()} onOpenClient={vi.fn()} />);
    expect(await screen.findByText("3 of 5")).toBeTruthy();
    expect(screen.getAllByText("4 of 5")).toHaveLength(2);
    expect(screen.getByText("What went well?")).toBeTruthy();
    expect(screen.getByText("86.4 kg")).toBeTruthy();
    expect(screen.getByText(/−0\.5 since Fri 9 Oct/)).toBeTruthy();
    expect(screen.getByText("Save review")).toBeTruthy();
  });

  it("stays on the screen after saving and turns read-only", async () => {
    const onBack = vi.fn();
    // The screen reloads after saving; the server then returns the review.
    let saved = false;
    api.recordCheckinReview.mockImplementationOnce(async () => {
      saved = true;
      return {};
    });
    api.getCheckinReviewContext.mockImplementation(async () => context(saved));
    render(<CheckinReviewScreen checkinId={CHECKIN} relationshipId={REL} onBack={onBack} onOpenClient={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Add a note for Rohan"), {
      target: { value: "Weekend leg day works." },
    });
    fireEvent.click(screen.getByText("Save review"));
    await waitFor(() => expect(screen.getByText("Check-in item closed in Attention")).toBeTruthy());
    expect(onBack).not.toHaveBeenCalled();
    expect(api.recordCheckinReview).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Review saved · shared with Rohan")).toBeTruthy();
    expect(screen.getByText(reviewedSummaryLine(context(true).checkin.review!, deviceTimeZone()))).toBeTruthy();
    expect(screen.getByText("Visible to Rohan")).toBeTruthy();
    expect(screen.queryByText("Save review")).toBeNull();
    expect(screen.queryByLabelText("Add a note for Rohan")).toBeNull();
  });
});
