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

function photo(id: string, type: string, entityId: string, status: string) {
  return {
    id,
    mediaType: "checkin_photo",
    status,
    contentType: "image/jpeg",
    createdAt: "2026-10-16T16:00:00.000Z",
    domainEntityType: type,
    domainEntityId: entityId,
  };
}

function context(reviewed: boolean, withNote = true): CheckinReviewContext {
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
    photos: [
      photo("aaaaaaaa-0000-4000-8000-000000000001", "checkin", CHECKIN, "ready"),
      photo("aaaaaaaa-0000-4000-8000-000000000002", "checkin", CHECKIN, "ready"),
      // Not this check-in's, or not uploaded: never shown or counted.
      photo("aaaaaaaa-0000-4000-8000-000000000003", "checkin", "00000000-0000-4000-8000-000000000009", "ready"),
      photo("aaaaaaaa-0000-4000-8000-000000000004", "checkin", CHECKIN, "pending_upload"),
    ],
    measurements: [
      { type: "body_weight_kg", value: "86.4", unit: "kg", observedAt: "2026-10-16T05:00:00.000Z" },
      { type: "body_weight_kg", value: "86.9", unit: "kg", observedAt: "2026-10-09T05:00:00.000Z" },
    ],
    previousNotes: reviewed && withNote
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
  getDownloadTarget: vi.fn(async (id: string) => ({ downloadUrl: `https://files.test/${id}?exp=1&sig=x` })),
};
const auth = mockAuth({ api, me: { timezone: "America/Los_Angeles" } }); // stored zone must NOT be used (D-W3b-11 (b))
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
// D-W3b-11 (b): the screen shows times in the device zone; pin it so the expected labels are stable.
vi.mock("@fitbud/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fitbud/core")>()),
  deviceTimeZone: () => "Asia/Kolkata",
}));

const reportError = vi.fn();
vi.mock("../../lib/reportError", () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

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

  it("shows only this check-in's uploaded photos as thumbnails", async () => {
    api.getDownloadTarget.mockClear();
    render(<CheckinReviewScreen checkinId={CHECKIN} relationshipId={REL} onBack={vi.fn()} onOpenClient={vi.fn()} />);
    await screen.findByText("Photos");
    await waitFor(() => expect(screen.getAllByLabelText("Check-in photo")).toHaveLength(2));
    expect(api.getDownloadTarget).toHaveBeenCalledTimes(2);
    expect(api.getDownloadTarget).not.toHaveBeenCalledWith("aaaaaaaa-0000-4000-8000-000000000003");
    expect(api.getDownloadTarget).not.toHaveBeenCalledWith("aaaaaaaa-0000-4000-8000-000000000004");
    expect(screen.getByText("2")).toBeTruthy();
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
    expect(screen.getByText("Needs follow-up · Sun 18 Oct, 9:46 am")).toBeTruthy();
    expect(screen.getByText("Visible to Rohan")).toBeTruthy();
    expect(screen.queryByText("Save review")).toBeNull();
    expect(screen.queryByLabelText("Add a note for Rohan")).toBeNull();
  });

  it("review saved but note failed: read-only, honest message, nothing claimed as shared", async () => {
    let saved = false;
    api.recordCheckinReview.mockImplementationOnce(async () => {
      saved = true;
      return {};
    });
    api.createTrainerNote.mockRejectedValueOnce(new Error("boom"));
    api.getCheckinReviewContext.mockImplementation(async () => context(saved, false));
    render(<CheckinReviewScreen checkinId={CHECKIN} relationshipId={REL} onBack={vi.fn()} onOpenClient={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Add a note for Rohan"), {
      target: { value: "Weekend leg day works." },
    });
    fireEvent.click(screen.getByText("Save review"));
    await waitFor(() => expect(screen.getByText("Check-in item closed in Attention")).toBeTruthy());
    expect(screen.getByText("Review saved. The note wasn't shared.")).toBeTruthy();
    expect(screen.queryByText("Couldn't load. Pull to try again.")).toBeNull();
    expect(screen.queryByText(/shared with Rohan/)).toBeNull();
    expect(screen.queryByText("Visible to Rohan")).toBeNull();
    expect(screen.queryByText("Save review")).toBeNull();
  });

  it("one press on the Visible to row toggles exactly once", async () => {
    api.getCheckinReviewContext.mockImplementation(async () => context(false));
    render(<CheckinReviewScreen checkinId={CHECKIN} relationshipId={REL} onBack={vi.fn()} onOpenClient={vi.fn()} />);
    await screen.findByText("Visible to Rohan");
    expect(screen.getByText("He'll see this note on his Today screen")).toBeTruthy();
    fireEvent.click(screen.getByText("Visible to Rohan"));
    expect(screen.getByText("Only you see this note")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(screen.getByText("He'll see this note on his Today screen")).toBeTruthy();
  });

  it("partial save reports a non-API note failure", async () => {
    let saved = false;
    const boom = new Error("boom");
    api.recordCheckinReview.mockImplementationOnce(async () => {
      saved = true;
      return {};
    });
    api.createTrainerNote.mockRejectedValueOnce(boom);
    api.getCheckinReviewContext.mockImplementation(async () => context(saved, false));
    reportError.mockClear();
    render(<CheckinReviewScreen checkinId={CHECKIN} relationshipId={REL} onBack={vi.fn()} onOpenClient={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Add a note for Rohan"), {
      target: { value: "Weekend leg day works." },
    });
    fireEvent.click(screen.getByText("Save review"));
    await waitFor(() => expect(screen.getByText("Review saved. The note wasn't shared.")).toBeTruthy());
    expect(reportError).toHaveBeenCalledWith("checkinReview.save", boom);
  });
});

/**
 * Z11b-1: Firoz opened Ananya's "Weekly check-in · Mon 16 Nov" from the client
 * screen and saw only the "Workouts · Meals logged" line. That card opens the
 * next check-in when nothing waits for review, and the seed's next check-in is
 * an unsubmitted draft with no answers. Fixtures below use the demo seed's
 * pinned form (rahul.coach-cf2) and its answer shape.
 */
describe("CheckinReviewScreen on the demo seed's form", () => {
  const SEED_FORM_ID = "9eda0f4d-0fdc-4602-9a08-901227d9d149";
  const seedForm = checkinFormVersionSchema.parse({
    id: SEED_FORM_ID,
    templateId: "fd316b02-9490-4b83-b560-9127bb510b6b",
    key: "rahul.coach-cf2",
    version: 1,
    scope: "trainer",
    createdAt: "2026-05-26T05:00:00.000Z",
    fields: [
      { id: "body_weight", label: "Average morning weight this week", type: "measurement", measurementType: "body_weight_kg", required: false },
      { id: "top_squat", label: "Top squat set", type: "number", unit: "kg", required: false },
      { id: "sessions_done", label: "How many planned workouts did you complete?", type: "single_choice", required: false, options: [
        { id: "all", label: "All" },
        { id: "most", label: "Most" },
        { id: "some", label: "Some" },
        { id: "none", label: "None" },
      ] },
      { id: "training_feel", label: "How did training feel?", type: "scale_1_5", required: false, lowLabel: "Very easy", highLabel: "Very hard" },
      { id: "sleep", label: "Sleep quality", type: "scale_1_5", required: false, lowLabel: "Poor", highLabel: "Great" },
      { id: "pain", label: "Any pain or niggles?", type: "yes_no", required: false },
      { id: "wellbeing", label: "One line: how was the week?", type: "short_text", required: true, maxLength: 1000 },
      { id: "notes", label: "Anything you need from me?", type: "long_text", required: false, maxLength: 2000 },
    ],
  });

  function seedContext(kind: "submitted" | "next"): CheckinReviewContext {
    const base = context(false);
    const submitted = kind === "submitted";
    return checkinReviewContextSchema.parse({
      ...base,
      pinnedForm: seedForm,
      photos: [],
      measurements: [],
      checkin: {
        ...base.checkin,
        localDate: submitted ? "2026-11-09" : "2026-11-16",
        windowStartsAt: submitted ? "2026-11-09T03:30:00.000Z" : "2026-11-16T03:30:00.000Z",
        windowEndsAt: submitted ? "2026-11-11T03:30:00.000Z" : "2026-11-18T03:30:00.000Z",
        checkinFormVersionId: SEED_FORM_ID,
        recordStatus: submitted ? "submitted" : "draft",
        recordVersion: submitted ? 1 : 0,
        status: submitted ? "submitted" : "scheduled",
        submittedAt: submitted ? "2026-11-09T12:30:00.000Z" : null,
        review: null,
        answers: submitted
          ? {
              wellbeing: "Positive week, felt in control of food",
              notes: "Weight is stuck for 2 weeks, what to do?",
              bodyWeightKg: 55.7,
              fieldAnswers: {
                body_weight: 55.7,
                sessions_done: "all",
                training_feel: 4,
                sleep: 2,
                pain: false,
                wellbeing: "Positive week, felt in control of food",
              },
            }
          : null,
      },
    });
  }

  it("renders the submitted check-in's answers, measurement and review sheet", async () => {
    api.getCheckinReviewContext.mockImplementation(async () => seedContext("submitted"));
    render(<CheckinReviewScreen checkinId={CHECKIN} relationshipId={REL} onBack={vi.fn()} onOpenClient={vi.fn()} />);
    expect(await screen.findByText("How did training feel?")).toBeTruthy();
    expect(screen.getByText("4 of 5")).toBeTruthy();
    expect(screen.getByText("2 of 5")).toBeTruthy();
    expect(screen.getByText("How many planned workouts did you complete?")).toBeTruthy();
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Any pain or niggles?")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
    expect(screen.getByText("Positive week, felt in control of food")).toBeTruthy();
    expect(screen.getByText("Weight is stuck for 2 weeks, what to do?")).toBeTruthy();
    expect(screen.getByText("55.7 kg")).toBeTruthy();
    expect(screen.getByText("Save review")).toBeTruthy();
    expect(screen.queryByText(/not submitted yet/)).toBeNull();
  });

  it("the next, unsubmitted check-in says so and offers no review it cannot save", async () => {
    api.getCheckinReviewContext.mockImplementation(async () => seedContext("next"));
    api.recordCheckinReview.mockClear();
    render(<CheckinReviewScreen checkinId={CHECKIN} relationshipId={REL} onBack={vi.fn()} onOpenClient={vi.fn()} />);
    expect(await screen.findByText("Due Mon 16 Nov · not submitted yet")).toBeTruthy();
    expect(screen.getByText(/Meals logged/)).toBeTruthy();
    expect(screen.queryByText("Save review")).toBeNull();
    expect(screen.queryByLabelText("Add a note for Rohan")).toBeNull();
    expect(screen.queryByText("Check-in item closed in Attention")).toBeNull();
    expect(api.recordCheckinReview).not.toHaveBeenCalled();
  });
});
