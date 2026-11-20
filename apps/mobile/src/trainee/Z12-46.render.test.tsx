/**
 * Z12-46: Progress keypad (TR-13c), reviewed check-in (TR-14g, read-only),
 * the check-in card for a trainee with no plan, error mapping (no raw API
 * text unless it is an ApiClientError's own message), the workout time label,
 * and the "kcal left" line. DOM-shaped harness (react-native-web): copy and
 * structure, not layout.
 */
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import {
  checkinFormVersionSchema,
  checkinSchema,
  coachingRelationshipSchema,
} from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

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
    { id: "energy", key: "energy", type: "scale_1_5", label: "Energy", required: false },
  ],
});

const reviewedCheckin = checkinSchema.parse({
  id: "9c1e7b30-5d2a-4a8f-b6c4-3e0f8d7a2b55",
  coachingRelationshipId: RELATIONSHIP_ID,
  checkinScheduleId: null,
  localDate: "2026-11-08",
  windowStartsAt: "2026-11-08T00:00:00.000Z",
  windowEndsAt: "2026-11-08T18:29:00.000Z",
  recordStatus: "submitted",
  recordVersion: 3,
  definitionVersion: 1,
  checkinFormVersionId: FORM_ID,
  answers: { fieldAnswers: { energy: 4 } },
  submittedAt: "2026-11-08T06:30:00.000Z",
  status: "reviewed",
  review: {
    id: "5a1e7b30-5d2a-4a8f-b6c4-3e0f8d7a2b55",
    checkinId: "9c1e7b30-5d2a-4a8f-b6c4-3e0f8d7a2b55",
    coachingRelationshipId: RELATIONSHIP_ID,
    trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
    outcome: "acknowledged",
    notes: "Great week. Keep protein near 110 g.",
    createdAt: "2026-11-09T03:42:00.000Z",
    updatedAt: "2026-11-09T03:42:00.000Z",
  },
  createdAt: "2026-11-01T06:30:00.000Z",
  updatedAt: "2026-11-09T03:42:00.000Z",
});

let ensureDue = vi.fn(async () => undefined);
const api = {
  getCheckinForm: vi.fn(async () => form),
  getCheckin: vi.fn(async () => reviewedCheckin),
  getProgressSummary: vi.fn(async () => ({ measurements: [], entries: [], media: [] })),
  ensureDueCheckin: (...args: unknown[]) => (ensureDue as (...a: unknown[]) => unknown)(...args),
  listCheckins: vi.fn(async () => ({ items: [], nextCursor: null })),
  listNotifications: vi.fn(async () => ({
    items: [
      {
        id: "n-1",
        type: "checkin_reviewed",
        readAt: null,
        domainEntityId: "c-1",
        coachingRelationshipId: "r-1",
      },
    ],
  })),
};
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  return {
    ...actual,
    useSyncEngine: () => ({
      pullAndApply: async () => undefined,
      pushNow: vi.fn(),
      enqueue: vi.fn(),
      store: {
        upsertLocal: async () => undefined,
        listLocal: async () => [],
        listOutbox: async () => [],
        getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
      },
    }),
  };
});
// The Modal itself is not what is under test: draw the sheet inline.
vi.mock("../components/BottomSheet", () => ({
  BottomSheet: ({
    visible,
    title,
    children,
  }: {
    visible: boolean;
    title?: string;
    children: React.ReactNode;
  }) => (visible ? (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ) : null),
}));
vi.mock("../sync/actions", () => ({ enqueueAndPush: vi.fn(async () => ({ results: [] })) }));

const { CheckinScreen, TodayCheckinCard } = await import("./CheckinScreen");
const { ProgressTab } = await import("./ProgressTab");
const { deepLinkFailureReason } = await import("./TraineeShell");
const { workoutTimeLabel } = await import("./today/workoutTime");
const { kcalLeftText } = await import("./today/TodaySummaryCard");

describe("TR-14g reviewed check-in", () => {
  it("shows the coach's reply and the answers, and nothing to edit", async () => {
    const onDone = vi.fn();
    render(<CheckinScreen relationship={relationship} checkin={reviewedCheckin} onDone={onDone} />);
    await screen.findByText("Your answers");
    expect(screen.getByText("Great week. Keep protein near 110 g.")).toBeTruthy();
    expect(screen.getByText("4 of 5")).toBeTruthy();
    expect(screen.queryByText("Continue")).toBeNull();
    expect(screen.queryByText(/Send to/)).toBeNull();
    fireEvent.click(screen.getByText("Back to Today"));
    expect(onDone).toHaveBeenCalled();
  });
});

describe("check-in card without a plan", () => {
  it("does not ask the server and says the first check-in follows the plan", async () => {
    ensureDue = vi.fn(async () => undefined);
    render(<TodayCheckinCard relationship={relationship} onOpen={() => {}} noPlan />);
    await screen.findByText(/Your first check-in opens once Rahul has set up your plan\./);
    expect(ensureDue).not.toHaveBeenCalled();
  });

  it("NO_ACTIVE_CONFIGURATION is a calm 'not open yet' card, never the server's sentence", async () => {
    ensureDue = vi.fn(async () => {
      throw new ApiClientError({
        code: "NO_ACTIVE_CONFIGURATION",
        message: "Server wording that must not be shown.",
        requestId: "r2",
        status: 422,
      });
    });
    render(<TodayCheckinCard relationship={relationship} onOpen={() => {}} />);
    await screen.findByText(/Your first check-in opens once Rahul has set up your plan\./);
    expect(screen.queryByText(/Server wording/)).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("does not ask the server while the plan is still loading", async () => {
    ensureDue = vi.fn(async () => undefined);
    render(<TodayCheckinCard relationship={relationship} onOpen={() => {}} planLoading />);
    await screen.findByText("Checking for a due check-in…");
    expect(ensureDue).not.toHaveBeenCalled();
  });

  it("shows a short code, not the text of a non-API error", async () => {
    ensureDue = vi.fn(async () => {
      throw new Error("SQLITE_ERROR: no such column secret_internal_name");
    });
    render(<TodayCheckinCard relationship={relationship} onOpen={() => {}} />);
    await screen.findByText(/CHK-CARD/);
    expect(screen.queryByText(/SQLITE|secret_internal_name/)).toBeNull();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("shows an ApiClientError's own curated message", async () => {
    ensureDue = vi.fn(async () => {
      throw new ApiClientError({
        code: "CHECKIN_NOT_OPEN",
        message: "That check-in isn't open yet.",
        requestId: "r1",
        status: 409,
      });
    });
    render(<TodayCheckinCard relationship={relationship} onOpen={() => {}} />);
    await screen.findByText("That check-in isn't open yet.");
  });

  it("retries ensure-due once on a network failure before showing the card", async () => {
    let calls = 0;
    ensureDue = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
    });
    render(<TodayCheckinCard relationship={relationship} onOpen={() => {}} />);
    await waitFor(() => {
      expect(ensureDue).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByText(/CHK-NET|Try again/)).toBeNull();
  });

  it("shows CHK-NET when ensure-due still fails after one retry", async () => {
    ensureDue = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    render(<TodayCheckinCard relationship={relationship} onOpen={() => {}} />);
    await screen.findByText(/CHK-NET/);
    expect(ensureDue).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});

describe("TR-14 submit while the push did not land", () => {
  it("reads 'Saved for', not 'Sent to', when no result for the mutation comes back", async () => {
    const dueCheckin = checkinSchema.parse({
      ...reviewedCheckin,
      recordStatus: "draft",
      status: "due",
      review: null,
      submittedAt: null,
      answers: { fieldAnswers: {} },
    });
    api.getCheckin = vi.fn(async () => dueCheckin) as never;
    render(<CheckinScreen relationship={relationship} checkin={dueCheckin} onDone={() => {}} />);
    for (let i = 0; i < 6; i += 1) {
      const send = screen.queryByRole("button", { name: "Send to Rahul" });
      if (send) {
        fireEvent.click(send);
        break;
      }
      const energy = screen.queryByRole("button", { name: "Energy 4" });
      if (energy) fireEvent.click(energy);
      fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    }
    await screen.findByText("Saved for Rahul");
    expect(screen.queryByText("Sent to Rahul")).toBeNull();
  });
});

describe("TR-13c log weight keypad", () => {
  it("types a value, shows the last one, and offers Save weight", async () => {
    api.getProgressSummary = vi.fn(async () => ({
      measurements: [
        {
          id: "m1",
          coachingRelationshipId: RELATIONSHIP_ID,
          traineeUserId: relationship.traineeUserId,
          type: "body_weight_kg",
          value: 78.4,
          unit: "kg",
          observedAt: "2026-11-12T01:35:00.000Z",
          source: "trainee_entry",
          checkinId: null,
          mediaAssetId: null,
          recordVersion: 1,
          createdAt: "2026-11-12T01:35:00.000Z",
          updatedAt: "2026-11-12T01:35:00.000Z",
        },
      ],
      entries: [],
      media: [],
    })) as never;
    render(<ProgressTab relationship={relationship} />);
    await screen.findByText(/Last weigh-in/);
    fireEvent.click(screen.getByRole("button", { name: "Log weight" }));
    const input = (await screen.findByLabelText("Log weight, kg")) as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(screen.getByText("Last: 78.4 kg on Thu 12 Nov")).toBeTruthy();
    fireEvent.change(input, { target: { value: "78.3" } });
    await waitFor(() => expect(input.value).toBe("78.3"));
    expect(screen.getByText("Save weight")).toBeTruthy();
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() =>
      expect(screen.getByText("Save weight").closest("[aria-disabled='true']")).toBeTruthy(),
    );
  });
});

describe("reviewed banner (TR-06h)", () => {
  it("goes on the notice queue instead of drawing its own banner", async () => {
    const { createNoticeQueue } = await import("../components/notice/noticeQueue");
    const { NoticeContext } = await import("../components/notice/NoticeContext");
    const { ReviewedBanner } = await import("./today/ReviewedBanner");
    const queue = createNoticeQueue();
    const showBanner = vi.spyOn(queue, "showBanner");
    render(
      <NoticeContext.Provider value={queue}>
        <ReviewedBanner coachName="Rahul" onOpenCheckin={() => {}} />
      </NoticeContext.Provider>,
    );
    await waitFor(() => expect(showBanner).toHaveBeenCalled());
    const input = showBanner.mock.calls[0]![0];
    expect(input.title).toBe("Rahul reviewed your check-in");
    expect(input.key).toBe("checkin-reviewed:n-1");
    expect(input.target).toBe("checkin:c-1");
    // Drawn by the host, not in place.
    expect(screen.queryByText("Rahul reviewed your check-in")).toBeNull();
  });
});

describe("deep-link failures", () => {
  it("says 'isn't available' only for not-found", () => {
    const notFound = new ApiClientError({ code: "NOT_FOUND", message: "x", requestId: "r", status: 404 });
    expect(deepLinkFailureReason("t", notFound, "meal")).toBe("This meal isn't available anymore.");
  });
  it("never blames a missing meal for a network or parse failure", () => {
    expect(deepLinkFailureReason("t", new TypeError("Network request failed"), "meal")).toContain("MEAL-NET");
    const reason = deepLinkFailureReason("t", new Error("boom: internal detail"), "check-in");
    expect(reason).toContain("CHECKIN-PARSE");
    expect(reason).not.toMatch(/isn't available|internal detail|connection|NET/);
    const zod = deepLinkFailureReason("t", checkinSchema.safeParse({}).error, "meal");
    expect(zod).toContain("MEAL-PARSE");
    expect(zod).not.toContain("connection");
  });
  it("shows a 5xx ApiClientError's own message with its status", () => {
    const err = new ApiClientError({
      code: "DATABASE_BUSY",
      message: "FitBud is busy. Try again in a moment.",
      requestId: "r",
      status: 503,
    });
    expect(deepLinkFailureReason("t", err, "meal")).toBe(
      "FitBud is busy. Try again in a moment. (MEAL-503)",
    );
  });
});

describe("Today helpers", () => {
  it("shows no clock time for a workout whose window opens at local midnight", () => {
    // 2026-11-14 00:00 IST
    expect(workoutTimeLabel("2026-11-13T18:30:00.000Z", "Asia/Kolkata")).toBeNull();
    expect(workoutTimeLabel("2026-11-14T13:00:00.000Z", "Asia/Kolkata")).toBe("6:30 pm");
  });
  it("reads kcal left and over from the same totals", () => {
    expect(kcalLeftText(1072, 1850)).toEqual({ value: "778", unit: "kcal left", goal: "Goal 1,850" });
    expect(kcalLeftText(2000, 1850)?.unit).toBe("kcal over");
    expect(kcalLeftText(100, 0)).toBeNull();
    // Unknown intake: no made-up "left" number (the ring reads "≥").
    expect(kcalLeftText(1072, 1850, true)).toBeNull();
  });
});
